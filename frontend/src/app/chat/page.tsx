'use client';

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import Link from 'next/link';
import { fetchChatHistory, sendQuery, type ChatMessage } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Source {
  document_id?: string;
  title?: string;
  category?: string;
  source_title?: string;
  source_url?: string;
  effective_date?: string;
  last_verified?: string;
  provenance_verified?: boolean;
  relevance_score?: number;
}

interface Message {
  id: string;
  role: 'ai' | 'user';
  text: string;
  sources?: Source[];
  isTyping?: boolean;
}


const QUICK_ACTIONS = [
  '연금저축 한도 문의',
  'IRP 차이점',
  '세액공제율 기준',
  '연말정산 세액공제 확인',
  '퇴직연금 전환 방법',
];

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'ai',
  text: '안녕하세요! 절세택시의 AI 기사입니다 🚕\n\n고객님의 연금 및 ISA 계좌 현황을 바탕으로 최적의 절세 경로를 안내해 드릴게요. 무엇이든 물어보세요!',
};


const SESSION_STORAGE_KEY = 'taxi_chat_session_id';

// ─── Component helpers ────────────────────────────────────────────────────────
function createSessionId(): string {
  return `session_${Date.now()}`;
}

function getStoredSessionId() {
  const stored = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (stored) return stored;

  const created = createSessionId();
  window.localStorage.setItem(SESSION_STORAGE_KEY, created);
  return created;
}

function historyToMessages(history: ChatMessage[]): Message[] {
  return history.map((item, idx) => ({
    id: item.id != null ? `history-${item.id}` : `history-idx-${idx}`,
    role: item.role === 'assistant' ? 'ai' : 'user',
    text: item.message,
  }));
}

function formatText(text: string) {
  return text.split('\n').map((line, i) => (
    <span key={i}>
      {line}
      {i < text.split('\n').length - 1 && <br />}
    </span>
  ));
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-current opacity-60"
          style={{ animation: `typingBounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
    </div>
  );
}

function AiAvatar() {
  return (
    <div
      className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center border shadow-sm"
      style={{ background: 'white', borderColor: 'rgba(199,196,216,0.3)' }}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: '20px', color: 'var(--color-primary)', fontVariationSettings: "'FILL' 1" }}
      >
        smart_toy
      </span>
    </div>
  );
}
function relevancePercent(score?: number) {
  if (typeof score !== 'number' || Number.isNaN(score)) return null;
  return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`;
}

function pageLabel(source: Source) {
  const text = `${source.title ?? ''} ${source.document_id ?? ''}`;
  const koreanPage = text.match(/(\d+)페이지/);
  if (koreanPage) return `${koreanPage[1]}페이지`;

  const idPage = text.match(/page[_-](\d+)/i);
  if (idPage) return `${Number(idPage[1])}페이지`;

  return null;
}

function SourceCard({ source, index }: { source: Source; index: number }) {
  const relevance = relevancePercent(source.relevance_score);
  const page = pageLabel(source);
  const title = source.title || source.source_title || source.document_id || `참조 문서 ${index + 1}`;
  const hasMetadata = Boolean(source.category || source.effective_date || source.last_verified);

  return (
    <article className="source-card">
      <div className="source-card-topline">
        <span className="source-chip source-chip--primary">문서 {index + 1}</span>
        {page && <span className="source-chip">PDF {page}</span>}
        {source.provenance_verified && <span className="source-chip">출처 검증</span>}
        {source.provenance_verified === false && <span className="source-chip">검증 필요</span>}
        {relevance && <span className="source-score">연관도 {relevance}</span>}
      </div>

      <p className="source-title">{title}</p>

      {hasMetadata && (
        <div className="source-meta-grid">
          {source.category && (
            <span>
              <span className="source-meta-label">분류</span>
              {source.category}
            </span>
          )}
          {source.effective_date && (
            <span>
              <span className="source-meta-label">기준일</span>
              {source.effective_date}
            </span>
          )}
          {source.last_verified && (
            <span>
              <span className="source-meta-label">검증일</span>
              {source.last_verified}
            </span>
          )}
        </div>
      )}

      {(source.source_title || source.source_url) && (
        <div className="source-link-row">
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
            verified
          </span>
          {source.source_url ? (
            <a href={source.source_url} target="_blank" rel="noreferrer">
              {source.source_title || '공식 출처 열기'}
            </a>
          ) : (
            <span>{source.source_title}</span>
          )}
        </div>
      )}
    </article>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // sessionId 변경 시 대화 내역 조회 (Issue #14)
  useEffect(() => {
    if (!sessionId) return;
    const loadHistory = async () => {
      setHistoryLoading(true);
      try {
        const history = await fetchChatHistory(sessionId);
        if (history.length === 0) {
          setMessages([WELCOME_MESSAGE]);
        } else {
          setMessages(historyToMessages(history));
        }
      } catch {
        // 히스토리 로드 실패 시 환영 메시지 유지
        setMessages([WELCOME_MESSAGE]);
      } finally {
        setHistoryLoading(false);
      }
    };
    loadHistory();
  }, [sessionId]);

  // 컴포넌트 마운트 시 sessionId 초기화 (Issue #14: session_${Date.now()} 기반)
  useEffect(() => {
    const activeSessionId = getStoredSessionId();
    setSessionId(activeSessionId);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, historyLoading]);

  // Auto-resize textarea
  const handleTextareaInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, []);

  /**
   * 메시지 전송 함수 (Issue #14: api.ts의 sendQuery 사용)
   * - 사용자 메시지를 UI에 즉시 반영
   * - sendQuery()로 백엔드 호출 → 응답 answer를 AI 메시지로 추가
   */
  const handleSendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const activeSessionId = sessionId ?? getStoredSessionId();
    if (!sessionId) setSessionId(activeSessionId);

    // 사용자 메시지 즉시 UI 반영
    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', text: trimmed };
    const typingMsg: Message = { id: `typing-${Date.now()}`, role: 'ai', text: '', isTyping: true };

    setMessages((prev) => [...prev, userMsg, typingMsg]);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '40px';
    }
    setLoading(true);

    try {
      // api.ts의 sendQuery 사용 (session_id + question 전송, DB 저장은 백엔드에서 처리)
      const json = await sendQuery(activeSessionId, trimmed);
      const aiMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'ai',
        text: json.answer || '답변을 가져오지 못했습니다.',
        sources: json.sources?.length ? json.sources : undefined,
      };
      setMessages((prev) => prev.filter((m) => !m.isTyping).concat(aiMsg));
    } catch (e: unknown) {
      const errMsg: Message = {
        id: `err-${Date.now()}`,
        role: 'ai',
        text: `죄송합니다, 오류가 발생했습니다.\n${e instanceof Error ? e.message : '알 수 없는 오류'}`,
      };
      setMessages((prev) => prev.filter((m) => !m.isTyping).concat(errMsg));
    } finally {
      setLoading(false);
    }
  }, [loading, sessionId]);

  // 이전 코드와의 호환성을 위한 alias
  const sendMessage = handleSendMessage;

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // 새 상담: session_${Date.now()} 방식으로 새 세션 생성 (Issue #14)
  const handleReset = useCallback(() => {
    const nextSessionId = createSessionId(); // "session_${Date.now()}"
    window.localStorage.setItem(SESSION_STORAGE_KEY, nextSessionId);
    setSessionId(nextSessionId);             // useEffect가 자동으로 히스토리 재조회
    setMessages([]);                         // sessionId 변경 → useEffect에서 갱신됨
    setInput('');
  }, []);

  return (
    <div
      className="h-screen flex overflow-hidden"
      style={{ background: 'var(--color-background)', color: 'var(--color-on-background)' }}
    >
      {/* ── Sidebar ── */}
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className="flex flex-col h-screen w-80 fixed left-0 top-0 z-40 transition-transform duration-300"
        style={{
          background: 'var(--color-surface-container-low)',
          borderRight: '1px solid rgba(199,196,216,0.3)',
          transform: sidebarOpen ? 'translateX(0)' : undefined,
        }}
      >
        <style>{`
          @media (max-width: 767px) {
            aside { transform: ${sidebarOpen ? 'translateX(0)' : 'translateX(-100%)'}; }
          }
        `}</style>

        <div className="flex flex-col h-full p-4">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8 mt-4">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center shadow-sm"
              style={{ background: 'rgba(53,37,205,0.08)' }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '24px', color: 'var(--color-primary)', fontVariationSettings: "'FILL' 1" }}
              >
                local_taxi
              </span>
            </div>
            <div>
              <h1
                className="font-bold text-lg leading-tight"
                style={{ fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--color-primary)' }}
              >
                Tax-i
              </h1>
              <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                Your Smart Tax Scout
              </p>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 space-y-1 overflow-y-auto">
            {[
              { icon: 'add_comment', label: '새 상담', active: true, onClick: handleReset },
              { icon: 'receipt_long', label: '상담 기록', active: false },
              { icon: 'savings', label: '저장된 절세 정보', active: false },
            ].map(({ icon, label, active, onClick }) => (
              <button
                key={label}
                onClick={onClick}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors text-sm font-medium"
                style={{
                  background: active ? 'var(--color-primary)' : 'transparent',
                  color: active ? 'white' : 'var(--color-on-surface-variant)',
                }}
              >
                <span
                  className="material-symbols-outlined text-xl"
                  style={active ? { fontVariationSettings: "'FILL' 1" } : {}}
                >
                  {icon}
                </span>
                {label}
              </button>
            ))}
          </nav>

          {/* Bottom nav */}
          <div
            className="mt-auto pt-4 space-y-1"
            style={{ borderTop: '1px solid rgba(199,196,216,0.3)' }}
          >
            {[
              { icon: 'arrow_back', label: '진단으로 돌아가기', href: '/diagnose' },
              { icon: 'home', label: '홈으로', href: '/' },
            ].map(({ icon, label, href }) => (
              <Link
                key={label}
                href={href}
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors"
                style={{ color: 'var(--color-on-surface-variant)' }}
              >
                <span className="material-symbols-outlined text-xl">{icon}</span>
                {label}
              </Link>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col md:ml-80 relative h-full min-w-0">

        {/* Header */}
        <header
          className="flex justify-between items-center w-full px-5 py-3 sticky top-0 z-20 backdrop-blur-md"
          style={{
            background: 'rgba(248,249,255,0.85)',
            borderBottom: '1px solid rgba(199,196,216,0.3)',
            boxShadow: '0 1px 8px rgba(0,0,0,0.04)',
          }}
        >
          <div className="flex items-center gap-3">
            <button
              className="md:hidden p-1 rounded-lg"
              style={{ color: 'var(--color-on-surface-variant)' }}
              onClick={() => setSidebarOpen(true)}
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <span
              className="font-bold text-xl md:hidden"
              style={{ fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--color-primary)' }}
            >
              Tax-i
            </span>
            <span
              className="font-bold text-xl hidden md:block"
              style={{ fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--color-primary)' }}
            >
              AI 상담
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm"
              style={{
                background: 'rgba(229,238,255,0.6)',
                borderColor: 'rgba(199,196,216,0.4)',
                color: 'var(--color-on-surface-variant)',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '16px', color: 'var(--color-secondary)', fontVariationSettings: "'FILL' 1" }}
              >
                auto_awesome
              </span>
              <span className="text-xs font-medium">RAG + GPT-4o mini</span>
            </div>
            <button
              className="p-2 rounded-full transition-colors"
              style={{ color: 'var(--color-on-surface-variant)' }}
              onClick={handleReset}
              title="새 상담"
            >
              <span className="material-symbols-outlined">add_comment</span>
            </button>
          </div>
        </header>

        {/* Chat area */}
        <main
          className="flex-1 overflow-y-auto relative"
          style={{ paddingBottom: '160px' }}
        >
          {/* Ambient gradient */}
          <div
            className="absolute inset-0 pointer-events-none opacity-30"
            style={{
              background: 'radial-gradient(circle at top right, rgba(211,228,254,0.5) 0%, transparent 50%)',
            }}
          />

          <div className="relative z-10 px-4 md:px-10 py-6 space-y-6 max-w-4xl mx-auto">
            {messages.map((msg, idx) =>
              msg.role === 'ai' ? (
                <div key={msg.id} className="flex gap-3 max-w-[85%]" style={{ animation: `chatFadeIn 0.35s ease-out ${idx * 0.05}s both` }}>
                  <AiAvatar />
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-xs ml-1" style={{ color: 'var(--color-outline)' }}>
                      Tax-i AI
                    </span>
                    <div
                      className="p-4 rounded-2xl rounded-tl-sm text-sm leading-relaxed"
                      style={{
                        background: 'white',
                        border: '1px solid rgba(199,196,216,0.2)',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
                        color: 'var(--color-on-background)',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {msg.isTyping ? <TypingDots /> : formatText(msg.text)}
                      {/* Sources */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="source-section">
                          <div className="source-section-header">
                            <span
                              className="material-symbols-outlined"
                              style={{ fontSize: '16px', color: 'var(--color-primary)' }}
                            >
                              library_books
                            </span>
                            <p>참조한 공식 자료</p>
                          </div>
                          <div className="source-card-list">
                            {msg.sources.slice(0, 4).map((src, i) => (
                              <SourceCard key={`${src.document_id ?? src.title ?? i}-${i}`} source={src} index={i} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  key={msg.id}
                  className="flex gap-3 max-w-[85%] ml-auto justify-end"
                  style={{ animation: `chatFadeIn 0.35s ease-out both` }}
                >
                  <div className="flex flex-col gap-1 items-end min-w-0">
                    <span className="text-xs mr-1" style={{ color: 'var(--color-outline)' }}>
                      나
                    </span>
                    <div
                      className="p-4 rounded-2xl rounded-tr-sm text-sm leading-relaxed"
                      style={{
                        background: 'var(--color-primary)',
                        color: 'white',
                        boxShadow: '0 4px 20px rgba(79,70,229,0.15)',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {msg.text}
                    </div>
                  </div>
                </div>
              )
            )}
            <div ref={chatEndRef} />
          </div>
        </main>

        {/* ── Input Area ── */}
        <div
          className="absolute bottom-0 left-0 right-0 z-20"
          style={{
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(16px)',
            borderTop: '1px solid rgba(199,196,216,0.3)',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.04)',
          }}
        >
          <div className="max-w-4xl mx-auto px-4 md:px-8 py-3">
            {/* Quick actions */}
            <div className="flex gap-2 mb-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action}
                  onClick={() => sendMessage(action)}
                  disabled={loading}
                  className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
                  style={{
                    background: 'var(--color-surface-container)',
                    borderColor: 'rgba(199,196,216,0.5)',
                    color: 'var(--color-on-surface-variant)',
                  }}
                >
                  {action}
                </button>
              ))}
            </div>

            {/* Textarea + buttons */}
            <div
              className="flex items-end gap-2 p-2 rounded-xl border-2 transition-colors"
              style={{
                background: 'var(--color-surface)',
                borderColor: 'rgba(199,196,216,0.5)',
              }}
              onFocusCapture={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-primary)';
              }}
              onBlurCapture={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(199,196,216,0.5)';
              }}
            >
              <textarea
                ref={textareaRef}
                className="flex-1 bg-transparent border-none outline-none resize-none py-2 text-sm leading-relaxed"
                style={{
                  color: 'var(--color-on-background)',
                  minHeight: '40px',
                  maxHeight: '128px',
                }}
                placeholder="연금, 세액공제, IRP에 대해 자유롭게 질문하세요…"
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  handleTextareaInput();
                }}
                onKeyDown={handleKeyDown}
                disabled={loading}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                className="p-2 rounded-lg flex items-center justify-center flex-shrink-0 transition-all"
                style={{
                  background: loading || !input.trim() ? 'rgba(199,196,216,0.5)' : 'var(--color-primary)',
                  color: 'white',
                }}
              >
                {loading ? (
                  <span
                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                    style={{ animation: 'spin 0.7s linear infinite' }}
                  />
                ) : (
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                    send
                  </span>
                )}
              </button>
            </div>

            {/* Disclaimer */}
            <p
              className="text-center text-xs mt-2"
              style={{ color: 'rgba(70,69,85,0.5)', lineHeight: 1.5 }}
            >
              Tax-i AI는 공식 자료 기반으로 답변하지만 중요한 결정 전 반드시 세무 전문가와 상담하세요.
            </p>
          </div>
        </div>
      </div>

      {/* Global animations */}
      <style>{`
        @keyframes typingBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes chatFadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .overflow-x-auto::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
