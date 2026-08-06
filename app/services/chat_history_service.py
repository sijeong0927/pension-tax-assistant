import json
import re
from datetime import datetime
from collections.abc import Mapping, Sequence
from typing import Any, List, Optional
from supabase import Client

class ChatHistoryService:
    _SOURCE_FIELDS = (
        "document_id",
        "title",
        "category",
        "source_title",
        "source_url",
        "effective_date",
        "last_verified",
        "source_chunk_ids",
        "excerpt",
        "provenance_verified",
    )

    @staticmethod
    def mask_pii(text: str) -> str:
        """
        주민등록번호, 전화번호 등 민감정보(PII) 사전 마스킹 처리
        """
        if not text:
            return text
        
        # 1. 주민등록번호 패턴 (예: 990101-1234567 -> 990101-*******)
        rrn_pattern = r'\b(\d{6})[- ]?([1-4]\d{6})\b'
        text = re.sub(rrn_pattern, r'\1-*******', text)

        # 2. 휴대전화번호 패턴 (예: 010-1234-5678 -> 010-****-5678)
        phone_pattern = r'\b(01[016789])[- ]?(\d{3,4})[- ]?(\d{4})\b'
        text = re.sub(phone_pattern, r'\1-****-\3', text)

        return text

    @staticmethod
    def save_message(
        db: Client,
        session_id: str,
        role: str,
        message: str,
        sources: Sequence[Mapping[str, Any]] | None = None,
        user_id: int | None = None,
    ) -> dict[str, Any]:
        """
        대화 메시지 마스킹 후 Supabase DB 저장
        """
        masked_message = ChatHistoryService.mask_pii(message)
        chat_data = {
            "session_id": session_id,
            "user_id": user_id,
            "role": role,
            "message": masked_message,
        }
        
        res = db.table("chat_histories").insert(chat_data).execute()
        if not res.data:
            raise RuntimeError("Failed to insert chat_history message into Supabase.")
            
        chat_entry = res.data[0]
        chat_history_id = chat_entry["id"]

        if sources is not None:
            normalized_sources = ChatHistoryService._normalize_sources(sources)
            db.table("chat_history_sources").insert({
                "chat_history_id": chat_history_id,
                "sources_json": normalized_sources,
            }).execute()
            chat_entry["sources"] = normalized_sources
        else:
            chat_entry["sources"] = []

        return chat_entry

    @classmethod
    def get_sources(cls, chat_entry: dict[str, Any], db: Optional[Client] = None) -> list[dict[str, Any]]:
        """저장된 출처 조회"""
        if "sources" in chat_entry and chat_entry["sources"] is not None:
            return chat_entry["sources"]

        if db is None:
            return []

        chat_history_id = chat_entry.get("id")
        if not chat_history_id:
            return []

        res = db.table("chat_history_sources").select("*").eq("chat_history_id", chat_history_id).execute()
        if not res.data:
            return []

        sources_json = res.data[0].get("sources_json")
        if isinstance(sources_json, list):
            return cls._normalize_sources(sources_json)
        elif isinstance(sources_json, str):
            try:
                raw_sources = json.loads(sources_json)
                if isinstance(raw_sources, list):
                    return cls._normalize_sources(raw_sources)
            except (TypeError, json.JSONDecodeError):
                pass
        return []

    @classmethod
    def _normalize_sources(
        cls, sources: Sequence[Mapping[str, Any]]
    ) -> list[dict[str, Any]]:
        normalized: list[dict[str, Any]] = []
        for source in sources:
            if not isinstance(source, Mapping):
                continue
            normalized.append(
                {
                    field: source[field]
                    for field in cls._SOURCE_FIELDS
                    if source.get(field) is not None
                }
            )
        return normalized

    @staticmethod
    def get_history(db: Client, session_id: str, limit: int = 50, user_id: int | None = None) -> List[dict[str, Any]]:
        """
        특정 세션의 대화 이력 조회 (Supabase API)
        """
        query = db.table("chat_histories").select("*, chat_history_sources(sources_json)").eq("session_id", session_id)
        if user_id is not None:
            query = query.eq("user_id", user_id)
            
        res = query.order("created_at", desc=False).limit(limit).execute()
        records = res.data or []

        history = []
        for item in records:
            sources = []
            source_relation = item.get("chat_history_sources")
            if source_relation:
                # 1:1 관계 또는 리스트 반환 시
                rel_data = source_relation[0] if isinstance(source_relation, list) and len(source_relation) > 0 else source_relation
                if isinstance(rel_data, dict) and "sources_json" in rel_data:
                    raw_src = rel_data["sources_json"]
                    if isinstance(raw_src, list):
                        sources = ChatHistoryService._normalize_sources(raw_src)
                    elif isinstance(raw_src, str):
                        try:
                            sources = ChatHistoryService._normalize_sources(json.loads(raw_src))
                        except Exception:
                            pass
            item["sources"] = sources
            history.append(item)
            
        return history

    @staticmethod
    def get_sessions(db: Client, limit: int = 50, user_id: int | None = None) -> List[dict]:
        """
        저장된 세션 목록 조회 (가장 최근 메시지 기준 내림차순 정렬)
        """
        query = db.table("chat_histories").select("id, session_id, role, message, created_at")
        if user_id is not None:
            query = query.eq("user_id", user_id)
            
        res = query.order("created_at", desc=True).limit(500).execute()
        records = res.data or []

        # 세션별 마이그레이션 & 미리보기 구성
        sessions_map: dict[str, dict] = {}
        for item in records:
            s_id = item["session_id"]
            if s_id not in sessions_map:
                sessions_map[s_id] = {
                    "session_id": s_id,
                    "last_active": item["created_at"],
                    "first_user_msg": None,
                    "total_count": 0,
                }
            sessions_map[s_id]["total_count"] += 1
            if item["role"] == "user":
                sessions_map[s_id]["first_user_msg"] = item["message"]

        result = []
        for s_id, s_info in sessions_map.items():
            preview = s_info["first_user_msg"][:60] if s_info["first_user_msg"] else "새 상담"
            
            # ISO format timestamp -> int ms
            ts = 0
            if s_info["last_active"]:
                try:
                    dt = datetime.fromisoformat(s_info["last_active"].replace("Z", "+00:00"))
                    ts = int(dt.timestamp() * 1000)
                except Exception:
                    pass

            result.append({
                "session_id": s_id,
                "preview": preview,
                "created_at": ts,
                "total_count": s_info["total_count"]
            })
            if len(result) >= limit:
                break
                
        return result

    @staticmethod
    def delete_session(db: Client, session_id: str, user_id: int | None = None) -> bool:
        """
        특정 세션의 대화 내역 전체 삭제 (Supabase API)
        """
        query = db.table("chat_histories").delete().eq("session_id", session_id)
        if user_id is not None:
            query = query.eq("user_id", user_id)

        res = query.execute()
        return bool(res.data)
