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
const SESSION_LIST_KEY = 'taxi_chat_session_list';

/** localStorage에 저장되는 세션 메타데이터 */
interface SessionMeta {
  sessionId: string;
  createdAt: number;      // Date.now()
  preview: string;        // 첫 사용자 질문 미리보기
}

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

/** 저장된 세션 목록을 가져옵니다 */
function loadSessionList(): SessionMeta[] {
  try {
    const raw = window.localStorage.getItem(SESSION_LIST_KEY);
    return raw ? (JSON.parse(raw) as SessionMeta[]) : [];
  } catch {
    return [];
  }
}

/** 현재 세션을 목록에 추가(or 갱신)합니다 */
function archiveSession(sessionId: string, preview: string) {
  const list = loadSessionList();
  const exists = list.find((s) => s.sessionId === sessionId);
  if (exists) {
    exists.preview = preview || exists.preview;
  } else {
    list.unshift({ sessionId, createdAt: Date.now(), preview });
  }
  // 최대 50개 세션만 보관
  window.localStorage.setItem(SESSION_LIST_KEY, JSON.stringify(list.slice(0, 50)));
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

/** 콤팝트 한 줄짜리 출체 칩 */
function SourceChip({ source, index }: { source: Source; index: number }) {
  const relevance = typeof source.relevance_score === 'number'
    ? `${Math.round(Math.max(0, Math.min(1, source.relevance_score)) * 100)}%`
    : null;
  const title = source.title || source.source_title || source.document_id || `참조 ${index + 1}`;
  const shortTitle = title.length > 30 ? `${title.slice(0, 30)}…` : title;

  const content = (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs"
      style={{
        background: 'rgba(229,238,255,0.6)',
        border: '1px solid rgba(199,196,216,0.35)',
        color: 'var(--color-on-surface-variant)',
        maxWidth: '100%',
      }}
    >
      <span
        className="material-symbols-outlined flex-shrink-0"
        style={{ fontSize: '13px', color: 'var(--color-primary)' }}
      >
        description
      </span>
      <span className="font-medium flex-shrink-0" style={{ color: 'var(--color-primary)' }}>
        {index + 1}
      </span>
      <span className="truncate" style={{ minWidth: 0 }}>{shortTitle}</span>
      {relevance && (
        <span
          className="flex-shrink-0 px-1.5 py-0.5 rounded-full font-semibold"
          style={{ background: 'rgba(0,108,73,0.1)', color: 'var(--color-secondary)', fontSize: '10px' }}
        >
          {relevance}
        </span>
      )}
    </div>
  );

  if (source.source_url) {
    return (
      <a href={source.source_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
        {content}
      </a>
    );
  }
  return content;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // 'chat' | 'history' | 'savings'
  const [sidebarView, setSidebarView] = useState<'chat' | 'history' | 'savings'>('chat');
  // localStorage에 축적된 과거 세션 목록
  const [sessionList, setSessionList] = useState<SessionMeta[]>([]);

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
    // 저장된 세션 목록도 로드
    setSessionList(loadSessionList());
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

    // 첫 메시지 전송 시 세션을 localStorage에 아카이브
    archiveSession(activeSessionId, trimmed);
    setSessionList(loadSessionList());

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

  // 새 상담: 현재 세션을 아카이브한 후 새 세션으로 전환
  const handleReset = useCallback(() => {
    // 현재 세션에 대화가 있으면 저장
    const firstUserMsg = messages.find((m) => m.role === 'user');
    if (sessionId && firstUserMsg) {
      archiveSession(sessionId, firstUserMsg.text.slice(0, 60));
    }

    const nextSessionId = createSessionId(); // "session_${Date.now()}"
    window.localStorage.setItem(SESSION_STORAGE_KEY, nextSessionId);
    setSessionId(nextSessionId);             // useEffect가 자동으로 히스토리 재조회
    setMessages([]);                         // sessionId 변경 → useEffect에서 갱신됨
    setInput('');
    setSidebarView('chat');
    setSidebarOpen(false);
    // 목록 갱신
    setSessionList(loadSessionList());
  }, [sessionId, messages]);

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
              {
                icon: 'add_comment',
                label: '새 상담',
                view: 'chat' as const,
                onClick: handleReset,
              },
              {
                icon: 'receipt_long',
                label: '상담 기록',
                view: 'history' as const,
                onClick: () => { setSidebarView('history'); setSidebarOpen(false); },
              },
              {
                icon: 'savings',
                label: '저장된 절세 정보',
                view: 'savings' as const,
                onClick: () => { setSidebarView('savings'); setSidebarOpen(false); },
              },
            ].map(({ icon, label, view, onClick }) => {
              const active = sidebarView === view;
              return (
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
              );
            })}
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
              {sidebarView === 'history' ? '상담 기록' : sidebarView === 'savings' ? '저장된 절세 정보' : 'AI 상담'}
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

        {/* ── 상담 기록 패널 ── */}
        {sidebarView === 'history' && (
          <main className="flex-1 overflow-y-auto px-4 md:px-10 py-8">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <span
                    className="material-symbols-outlined"
                    style={{ color: 'var(--color-primary)', fontVariationSettings: "'FILL' 1" }}
                  >
                    receipt_long
                  </span>
                  <h2 className="font-bold text-lg" style={{ fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--color-on-surface)' }}>
                    상담 기록
                  </h2>
                </div>
                <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(53,37,205,0.08)', color: 'var(--color-primary)' }}>
                  총 {sessionList.length}건
                </span>
              </div>

              {sessionList.length === 0 ? (
                <div className="text-center py-16" style={{ color: 'var(--color-on-surface-variant)' }}>
                  <span className="material-symbols-outlined text-5xl block mb-3" style={{ color: 'var(--color-outline-variant)' }}>chat_bubble</span>
                  <p className="font-medium">아직 상담 기록이 없어요.</p>
                  <p className="text-sm mt-1">AI 기사님과 대화를 시작하면 여기에 쌓입니다.</p>
                  <button
                    onClick={handleReset}
                    className="mt-6 px-6 py-2.5 rounded-full text-sm font-semibold transition-colors"
                    style={{ background: 'var(--color-primary)', color: 'white' }}
                  >
                    새 상담 시작하기
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {sessionList.map((sess) => {
                    const isCurrent = sess.sessionId === sessionId;
                    const date = new Date(sess.createdAt);
                    const dateStr = date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
                    const timeStr = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

                    return (
                      <button
                        key={sess.sessionId}
                        onClick={async () => {
                          // 해당 세션의 메시지를 백엔드에서 불러와 채팅 뷰로 전환
                          window.localStorage.setItem(SESSION_STORAGE_KEY, sess.sessionId);
                          setSessionId(sess.sessionId);
                          setSidebarView('chat');
                        }}
                        className="w-full text-left p-4 rounded-xl border transition-all"
                        style={{
                          background: isCurrent ? 'rgba(53,37,205,0.05)' : 'white',
                          borderColor: isCurrent ? 'var(--color-primary)' : 'rgba(199,196,216,0.3)',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="material-symbols-outlined flex-shrink-0"
                              style={{ fontSize: '18px', color: isCurrent ? 'var(--color-primary)' : 'var(--color-outline)' }}
                            >
                              {isCurrent ? 'chat' : 'history'}
                            </span>
                            <p
                              className="text-sm font-medium truncate"
                              style={{ color: 'var(--color-on-surface)' }}
                            >
                              {sess.preview || '(미리보기 없음)'}
                            </p>
                          </div>
                          {isCurrent && (
                            <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-semibold"
                              style={{ background: 'var(--color-primary)', color: 'white' }}>
                              현재
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-1.5 ml-6" style={{ color: 'var(--color-outline)' }}>
                          {dateStr} {timeStr}
                        </p>
                      </button>
                    );
                  })}
                  <p className="text-center text-xs mt-4" style={{ color: 'var(--color-outline)' }}>
                    기록은 이 기기의 브라우저에 최대 50건 보관됩니다.
                  </p>
                </div>
              )}
            </div>
          </main>
        )}


        {/* ── 저장된 절세 정보 패널 ── */}
        {sidebarView === 'savings' && (
          <main className="flex-1 overflow-y-auto px-4 md:px-10 py-8">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center gap-2 mb-6">
                <span
                  className="material-symbols-outlined"
                  style={{ color: 'var(--color-secondary)', fontVariationSettings: "'FILL' 1" }}
                >
                  savings
                </span>
                <h2 className="font-bold text-lg" style={{ fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--color-on-surface)' }}>
                  나의 절세 정보
                </h2>
              </div>

              {/* 세액공제 요약 카드 */}
              <div
                className="p-5 rounded-2xl mb-4"
                style={{ background: 'linear-gradient(135deg, rgba(53,37,205,0.08), rgba(0,108,73,0.06))', border: '1px solid rgba(199,196,216,0.3)' }}
              >
                <p className="font-semibold text-sm mb-3" style={{ color: 'var(--color-on-surface-variant)' }}>현재 세액공제 트레이주열 요약</p>
                {[
                  { label: '연금저축 한도', value: '600만원', chip: '16.5%' },
                  { label: 'IRP 포함 합산 한도', value: '900만원', chip: '13.2% ~' },
                  { label: '연간 최대 환급액', value: '최대 148.5만원', chip: '5,500만원 이하' },
                ].map(({ label, value, chip }) => (
                  <div key={label} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid rgba(199,196,216,0.15)' }}>
                    <span className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>{label}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm" style={{ color: 'var(--color-on-surface)' }}>{value}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(53,37,205,0.1)', color: 'var(--color-primary)' }}>{chip}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* 진단 CTA */}
              <div
                className="p-5 rounded-2xl mb-4"
                style={{ background: 'white', border: '1px solid rgba(199,196,216,0.25)', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(0,108,73,0.08)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--color-secondary)', fontVariationSettings: "'FILL' 1" }}>calculate</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm" style={{ color: 'var(--color-on-surface)' }}>실시간 시뮬레이터로 정확한 수치 확인</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-on-surface-variant)' }}>총급여와 납입액을 슬라이더로 직접 조정하며 예상 세액공제액을 확인하세요.</p>
                    <Link
                      href="/diagnose"
                      className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 rounded-full text-xs font-semibold transition-colors"
                      style={{ background: 'var(--color-secondary)', color: 'white' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>query_stats</span>
                      진단 시뮬레이터 열기
                    </Link>
                  </div>
                </div>
              </div>

              <p className="text-xs text-center" style={{ color: 'var(--color-outline)', lineHeight: 1.6 }}>
                실제 세액공제액은 결정세액 및 다른 공제 항목에 따라 달라질 수 있습니다. 중요한 결정 전 세무 전문가와 상담하세요.
              </p>
            </div>
          </main>
        )}

        {/* Chat area (sidebarView === 'chat'일 때만 표시) */}
        {sidebarView === 'chat' && (
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
                      {/* Sources — 콤팝트 쳩 */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div
                          className="mt-3 pt-2.5"
                          style={{ borderTop: '1px solid rgba(199,196,216,0.2)' }}
                        >
                          <div className="flex items-center gap-1 mb-1.5">
                            <span
                              className="material-symbols-outlined"
                              style={{ fontSize: '13px', color: 'var(--color-outline)' }}
                            >
                              library_books
                            </span>
                            <span className="text-xs" style={{ color: 'var(--color-outline)' }}>
                              참조 자료
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            {msg.sources.slice(0, 3).map((src, i) => (
                              <SourceChip key={`${src.document_id ?? src.title ?? i}-${i}`} source={src} index={i} />
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
        )}  {/* end sidebarView === 'chat' */}

        {/* ── Input Area (chat 뷰에서만 표시) ── */}
        {sidebarView === 'chat' && (
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
        )}  {/* end sidebarView === 'chat' input area */}
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
