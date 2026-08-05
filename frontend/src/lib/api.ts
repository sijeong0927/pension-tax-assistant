/**
 * api.ts
 * 절세택시 백엔드 API 통신 모듈
 *
 * 백엔드 엔드포인트:
 *   GET  /api/v1/chat/history/{session_id}  → 대화 내역 조회
 *   POST /api/v1/chat/query                 → AI 질의 및 저장
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ─── 타입 정의 ───────────────────────────────────────────────────────────────

/** 백엔드 chat_histories 테이블 row에 대응하는 메시지 타입 */
export interface ChatMessage {
  id?: number;
  session_id?: string;
  role: 'user' | 'assistant';
  message: string;
  created_at?: string;
}

/** GET /api/v1/chat/history/{session_id} 응답 */
interface HistoryResponse {
  success: boolean;
  session_id: string;
  history: ChatMessage[];
}

/** POST /api/v1/chat/query 요청 */
interface QueryRequest {
  session_id: string;
  question: string;
}

/** POST /api/v1/chat/query 응답 */
export interface QueryResponse {
  success: boolean;
  answer: string;
  sources: SourceDoc[];
}

export interface SourceDoc {
  question?: string;
  answer?: string;
  source_title?: string;
  source_url?: string;
  effective_date?: string;
  category?: string;
}

// ─── API 함수 ────────────────────────────────────────────────────────────────

/**
 * 특정 세션의 대화 내역을 조회합니다.
 * 오류 발생 시 빈 배열을 반환하여 UI가 깨지지 않도록 합니다.
 */
export async function fetchChatHistory(sessionId: string): Promise<ChatMessage[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/chat/history/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      // 캐시 무효화: 항상 최신 대화 내역을 가져옴
      cache: 'no-store',
    });

    if (!res.ok) {
      console.error(`[fetchChatHistory] HTTP ${res.status}: ${res.statusText}`);
      return [];
    }

    const data: HistoryResponse = await res.json();
    return data.history ?? [];
  } catch (error) {
    console.error('[fetchChatHistory] 네트워크 오류:', error);
    return [];
  }
}

/**
 * 사용자 질문을 백엔드로 전송하고 AI 답변을 수신합니다.
 * 질문과 답변 모두 백엔드에서 SQLite에 저장됩니다.
 */
export async function sendQuery(
  sessionId: string,
  query: string,
): Promise<QueryResponse> {
  const body: QueryRequest = {
    session_id: sessionId,
    question: query,
  };

  const res = await fetch(`${BASE_URL}/api/v1/chat/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail || `서버 오류 (HTTP ${res.status})`);
  }

  return res.json() as Promise<QueryResponse>;
}

export interface SessionMeta {
  session_id: string;
  preview: string;
  created_at: number;
  total_count: number;
}

/**
 * 저장된 세션 목록(상담 기록)을 서버에서 가져옵니다.
 */
export async function fetchSessions(): Promise<SessionMeta[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/chat/sessions`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    if (!res.ok) {
      console.error(`[fetchSessions] HTTP ${res.status}: ${res.statusText}`);
      return [];
    }

    const data = await res.json();
    return data.sessions ?? [];
  } catch (error) {
    console.error('[fetchSessions] 네트워크 오류:', error);
    return [];
  }
}

/**
 * 특정 세션의 대화 내역 전체를 삭제합니다.
 */
export async function deleteSession(sessionId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/chat/history/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch (error) {
    console.error('[deleteSession] 네트워크 오류:', error);
    return false;
  }
}
