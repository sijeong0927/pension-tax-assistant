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
  sources?: SourceDoc[];
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
  document_id?: string;
  title?: string;
  question?: string;
  answer?: string;
  source_title?: string;
  source_url?: string;
  effective_date?: string;
  category?: string;
  last_verified?: string;
  provenance_verified?: boolean;
  relevance_score?: number;
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

export interface TaxSavingsData {
  session_id: string;
  income_range: string;
  pension_savings_paid: number;
  irp_paid: number;
  deductible_pension_savings: number;
  deductible_irp: number;
  deductible_amount: number;
  gross_tax_credit: number;
  estimated_refund: number;
}

export async function saveTaxSavings(data: TaxSavingsData): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/tax-savings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch (error) {
    console.error('[saveTaxSavings] error:', error);
    return false;
  }
}

export async function fetchTaxSavings(sessionId: string): Promise<TaxSavingsData | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/tax-savings/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.success && json.data) {
      return json.data as TaxSavingsData;
    }
    return null;
  } catch (error) {
    console.error('[fetchTaxSavings] error:', error);
    return null;
  }
}

export interface StreamCallbacks {
  onSources?: (sources: SourceDoc[]) => void;
  onMessage?: (text: string) => void;
  onQuickReplies?: (replies: string[]) => void;
  onError?: (err: string) => void;
  onDone?: () => void;
}

export async function sendQueryStream(
  sessionId: string,
  query: string,
  callbacks: StreamCallbacks
) {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/chat/query/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, question: query }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      callbacks.onError?.((err as { detail?: string }).detail || `서버 오류 (${res.status})`);
      return;
    }

    if (!res.body) {
      callbacks.onError?.('ReadableStream not supported');
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const block of lines) {
        if (!block.trim()) continue;
        const eventMatch = block.match(/^event:\s*(.+)$/m);
        const dataMatch = block.match(/^data:\s*(.+)$/m);

        if (eventMatch && dataMatch) {
          const eventName = eventMatch[1].trim();
          const dataStr = dataMatch[1].trim();

          try {
            const data = JSON.parse(dataStr);
            if (eventName === 'sources') {
              callbacks.onSources?.(data);
            } else if (eventName === 'message') {
              callbacks.onMessage?.(data.content || '');
            } else if (eventName === 'quick_replies') {
              callbacks.onQuickReplies?.(data);
            } else if (eventName === 'error') {
              callbacks.onError?.(data.error || 'Unknown error');
            }
          } catch (e) {
            console.error('Failed to parse SSE data', dataStr, e);
          }
        }
      }
    }
    
    callbacks.onDone?.();
  } catch (error: any) {
    callbacks.onError?.(error.message);
  }
}
