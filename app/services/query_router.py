from __future__ import annotations

import json
import re
from typing import Any


def is_obvious_tax_office_visit(query: str) -> bool:
    """정규식 및 키워드를 사용해 명백하게 세무서 방문 질의인 경우 True를 반환합니다."""
    query_clean = re.sub(r"\s+", "", query).lower()
    
    # 세무소/세무서/국세청 키워드 확인
    has_office = "세무서" in query_clean or "국세청" in query_clean or "세무소" in query_clean
    
    # 직접 방문, 민원실 업무, 위임장, 신분증 지참 등 방문 관련 단어 확인
    visit_keywords = [
        "방문", "준비물", "가려는데", "갈때", "서류가뭐", 
        "위임장", "신분증", "민원실", "직접가", "가야해",
        "가야하", "가야되", "가야합"
    ]
    has_visit_intent = any(kw in query_clean for kw in visit_keywords)
    
    return has_office and has_visit_intent


def route_query(query: str, openai_client: Any, model: str) -> str | None:
    """사용자의 질문 의도를 분석하여 '관할세무서' 또는 '회사제출용'을 반환합니다.
    
    만약 분석이 불가능하거나 실패하면 None을 반환하여 기본 전체 검색을 수행하도록 합니다.
    """
    if not query or not query.strip():
        return None
        
    # 1. 룰 기반 1차 신속 검사
    if is_obvious_tax_office_visit(query):
        return "관할세무서"
        
    # 2. OpenAI API를 활용한 정밀 의도 판별
    prompt = (
        "사용자의 질문을 읽고 질문의 목적지/의도를 다음 세 가지 중 하나로 분류해 주세요.\n\n"
        "[분류 기준]\n"
        "- \"관할세무서\": 사용자가 세무서(또는 국세청) 민원실 직접 방문, 방문 준비물(신분증, 위임장)을 묻는 경우.\n"
        "- \"회사제출용\": 근로자가 소속 회사에 제출할 연말정산 서류, 간소화 자료 제출 방법에 대해 질문하는 경우.\n"
        "- \"기타\": 세법, 연금저축/IRP 계좌, 세액공제, 퇴직연금 전환, 한도, 인출 등 일반적인 금융/세무 질의인 경우.\n\n"
        f"[질문]: {query}\n\n"
        "반드시 JSON 형식으로 출력하세요:\n"
        "{\"intent\": \"관할세무서\"} 또는 {\"intent\": \"회사제출용\"} 또는 {\"intent\": \"기타\"}\n"
        "이외의 텍스트는 절대 출력하지 마세요."
    )
    
    try:
        response = openai_client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a precise classifier that outputs intent in JSON format."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.0
        )
        
        result_text = response.choices[0].message.content.strip()
        data = json.loads(result_text)
        intent = data.get("intent")
        if intent in ("관할세무서", "회사제출용"):
            return intent
    except Exception:
        # LLM 호출 실패 시 룰 기반으로 다시 Fallback
        pass
        
    return None
