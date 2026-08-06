'use client';

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import Link from 'next/link';
import { fetchChatHistory, sendQueryStream, fetchSessions, deleteSession, fetchTaxSavings, fetchMe, calculateLiteTax, type ChatMessage, type SessionMeta, type SourceDoc, type TaxSavingsData, type LiteTaxData } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────
type Source = SourceDoc;

interface Message {
  id: string;
  role: 'ai' | 'user';
  text: string;
  sources?: SourceDoc[];
  isTyping?: boolean;
  quickReplies?: string[];
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
    sources: item.sources?.length ? item.sources : undefined,
  }));
}

function CitationReference({ source, index }: { source: Source; index: number }) {
  const sourceName = source.source_title || '공식 출처 정보 미등록';
  const citation = `[문서 ${index + 1}]`;
  const triggerClassName = 'font-semibold underline decoration-dotted underline-offset-2 cursor-help rounded focus:outline-none focus:ring-2 focus:ring-offset-1';
  const triggerStyle = {
    color: 'var(--color-primary)',
    textDecorationColor: 'rgba(53,37,205,0.45)',
  };

  const trigger = (
    <span
      tabIndex={0}
      className={triggerClassName}
      style={triggerStyle}
      aria-label={`${citation} 공식 출처: ${sourceName}`}
    >
      {citation}
    </span>
  );

  return (
    <span className="group relative inline-flex align-baseline">
      {trigger}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 w-64 rounded-lg px-3 py-2 text-left text-xs leading-relaxed opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
        style={{
          background: 'var(--color-on-surface)',
          color: 'white',
          whiteSpace: 'normal',
        }}
      >
        <span className="block font-semibold">문서 {index + 1}</span>
        <span className="mt-1 block">공식 출처: {sourceName}</span>
        {source.effective_date && (
          <span className="mt-1 block opacity-80">기준일: {source.effective_date}</span>
        )}
        {source.source_chunk_ids && source.source_chunk_ids.length > 0 && (
          <span className="mt-1 block opacity-80">
            근거 청크: {source.source_chunk_ids.join(', ')}
          </span>
        )}
        {source.excerpt && (
          <span className="mt-2 block opacity-90">근거 발췌: {source.excerpt}</span>
        )}
      </span>
    </span>
  );
}

function renderCitations(text: string, sources: Source[], keyPrefix: string) {
  const citationPattern = /\[문서\s*(\d+)\]/g;
  const parts = text.split(citationPattern);

  return parts.map((part, partIndex) => {
    if (partIndex % 2 === 0) return part;

    const sourceIndex = Number(part) - 1;
    const source = sources[sourceIndex];
    if (!source) return `[문서 ${part}]`;

    return (
      <CitationReference
        key={`${keyPrefix}-citation-${partIndex}`}
        source={source}
        index={sourceIndex}
      />
    );
  });
}

function formatText(text: string, sources: Source[] = []) {
  const boldPattern = /(\*\*[^*\n]+\*\*)/g;
  const lines = text.split('\n');

  return lines.map((line, lineIndex) => {
    const segments = line.split(boldPattern);

    return (
      <span key={lineIndex}>
        {segments.map((segment, segmentIndex) => {
          const isBold = segment.startsWith('**') && segment.endsWith('**');
          const content = isBold ? segment.slice(2, -2) : segment;
          const renderedContent = renderCitations(
            content,
            sources,
            `${lineIndex}-${segmentIndex}`,
          );

          if (isBold) {
            return (
              <strong key={`${lineIndex}-${segmentIndex}`} className="font-semibold">
                {renderedContent}
              </strong>
            );
          }

          return <span key={`${lineIndex}-${segmentIndex}`}>{renderedContent}</span>;
        })}
        {lineIndex < lines.length - 1 && <br />}
      </span>
    );
  });
}

function getUpcomingTaxEvent() {
  const today = new Date();
  const month = today.getMonth() + 1;

  if (month <= 2) {
    return { title: "연말정산 간소화 서비스", desc: "1월 15일 ~ 2월 28일", icon: "📄", dDay: "진행 중" };
  } else if (month <= 5) {
    return { title: "종합소득세 확정 신고", desc: "5월 1일 ~ 5월 31일", icon: "📝", dDay: "5월 일정" };
  } else if (month <= 7) {
    return { title: "부가가치세 확정 신고", desc: "7월 1일 ~ 7월 25일", icon: "🏢", dDay: "7월 일정" };
  } else if (month === 8) {
    return { title: "주민세(개인분) 납부", desc: "8월 16일 ~ 8월 31일", icon: "🏠", dDay: "이달 말까지" };
  } else if (month === 9) {
    return { title: "근로장려금 반기 신청", desc: "9월 1일 ~ 9월 15일", icon: "💵", dDay: "이달 15일까지" };
  } else if (month <= 11) {
    return { title: "종합소득세 중간예납", desc: "11월 1일 ~ 11월 30일", icon: "📊", dDay: "11월 일정" };
  } else {
    return { title: "연금계좌 납입 마감", desc: "12월 31일 (금융사별 마감시간 유의)", icon: "⏳", dDay: "마감 임박" };
  }
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
      className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center bg-[#F3F4F6] border border-gray-200 shadow-sm overflow-hidden"
    >
      <span className="text-[24px] mt-1">👨‍✈️</span>
    </div>
  );
}
function pageLabel(source: Source) {
  const text = `${source.title ?? ''} ${source.document_id ?? ''}`;
  const koreanPage = text.match(/(\d+)페이지/);
  if (koreanPage) return `${koreanPage[1]}페이지`;

  const idPage = text.match(/page[_-](\d+)/i);
  if (idPage) return `${Number(idPage[1])}페이지`;

  return null;
}

interface SourceGroup {
  key: string;
  source: Source;
  chunks: Source[];
}

function sourceGroupKey(source: Source) {
  if (source.source_url) return `url:${source.source_url}`;
  if (source.source_title) return `title:${source.source_title}`;
  return `document:${source.document_id ?? source.title ?? 'unknown'}`;
}

function groupSources(sources: Source[]): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();

  sources.forEach((source) => {
    const key = sourceGroupKey(source);
    const group = groups.get(key);
    if (group) {
      group.chunks.push(source);
      return;
    }
    groups.set(key, { key, source, chunks: [source] });
  });

  return [...groups.values()];
}

function sourceLocation(source: Source, index: number) {
  if (source.source_chunk_ids && source.source_chunk_ids.length > 0) {
    return source.source_chunk_ids.join(', ');
  }
  return pageLabel(source) || source.category || `검색 근거 ${index + 1}`;
}

/** 동일 공식 출처의 검색 근거를 한 카드로 묶어 표시한다. */
function SourceChip({ group }: { group: SourceGroup }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const sourceName = group.source.source_title || group.source.title || '공식 출처 정보 미등록';

  return (
    <div className="group relative">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-[#e5eeff] focus:outline-none focus:ring-2 focus:ring-offset-1"
        style={{
          background: 'rgba(229,238,255,0.6)',
          border: '1px solid rgba(199,196,216,0.35)',
          color: 'var(--color-on-surface-variant)',
        }}
        aria-label={`${sourceName} 검색 근거 ${group.chunks.length}개`}
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((expanded) => !expanded)}
      >
        <span
          className="material-symbols-outlined flex-shrink-0"
          style={{ fontSize: '15px', color: 'var(--color-primary)' }}
        >
          description
        </span>
        <span className="min-w-0 flex-1 break-words font-medium">{sourceName}</span>
        <span
          className="flex-shrink-0 rounded-full px-1.5 py-0.5 font-semibold"
          style={{ background: 'rgba(0,108,73,0.1)', color: 'var(--color-secondary)', fontSize: '10px' }}
        >
          근거 {group.chunks.length}개
        </span>
      </button>
      <div
        role="tooltip"
        className={`pointer-events-none absolute bottom-full left-0 z-30 mb-2 w-full min-w-72 max-w-lg rounded-lg px-3 py-3 text-left text-xs leading-relaxed shadow-lg transition-opacity duration-150 ${isExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
        style={{ background: 'var(--color-on-surface)', color: 'white' }}
      >
        <span className="block font-semibold">{sourceName}</span>
        <span className="mt-1 block opacity-80">검색에 사용된 근거 청크</span>
        <div className="mt-2 space-y-2">
          {group.chunks.map((chunk, index) => (
            <div key={`${chunk.document_id ?? chunk.title ?? 'chunk'}-${index}`} className="border-t border-white/20 pt-2 first:border-t-0 first:pt-0">
              <span className="block font-medium">근거 {index + 1} · {sourceLocation(chunk, index)}</span>
              <span className="mt-1 block opacity-90">
                {chunk.excerpt || '저장된 근거에 발췌 내용이 없습니다.'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
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
  // 'chat' | 'history' | 'savings'
  const [sidebarView, setSidebarView] = useState<'chat' | 'history' | 'savings'>('chat');
  // localStorage에 축적된 과거 세션 목록
  const [sessionList, setSessionList] = useState<SessionMeta[]>([]);
  const [savingsData, setSavingsData] = useState<TaxSavingsData | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);

  // 🧮 간이 연말정산 계산기 State
  const [grossSalaryInput, setGrossSalaryInput] = useState('');
  const [familyCount, setFamilyCount] = useState(1);
  const [prepaidTaxInput, setPrepaidTaxInput] = useState('');
  const [isAccordionOpen, setIsAccordionOpen] = useState(false);
  const [isCalcResultOpen, setIsCalcResultOpen] = useState(false);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcResult, setCalcResult] = useState<LiteTaxData | null>(null);

  const handleSalaryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/[^0-9]/g, '');
    if (!rawVal) {
      setGrossSalaryInput('');
      return;
    }
    setGrossSalaryInput(parseInt(rawVal, 10).toLocaleString('ko-KR'));
  };

  const handlePrepaidTaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/[^0-9]/g, '');
    if (!rawVal) {
      setPrepaidTaxInput('');
      return;
    }
    setPrepaidTaxInput(parseInt(rawVal, 10).toLocaleString('ko-KR'));
  };

  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawSalary = parseInt(grossSalaryInput.replace(/,/g, ''), 10);
    if (isNaN(rawSalary) || rawSalary <= 0) {
      alert('세전 연봉을 올바르게 입력해 주세요.');
      return;
    }

    setCalcLoading(true);
    const rawPrepaid = prepaidTaxInput ? parseInt(prepaidTaxInput.replace(/,/g, ''), 10) : null;
    const activeSessionId = sessionId ?? getStoredSessionId();

    const data = await calculateLiteTax(rawSalary, familyCount, rawPrepaid, activeSessionId);
    setCalcLoading(false);

    if (data) {
      setCalcResult(data);
      setIsCalcResultOpen(true);
    } else {
      alert('계산 중 오류가 발생했습니다. 백엔드 상태를 확인해 주세요.');
    }
  };

  useEffect(() => {
    if (isAuthenticated()) {
      setIsLoggedIn(true);
      fetchMe().then(user => {
        if (user) {
          setUserName(user.full_name || user.name || (user.email ? user.email.split('@')[0] : '회원'));
        }
      }).catch(console.error);
    }
  }, []);

  // When sidebarView changes to savings, fetch savings data
  useEffect(() => {
    if (sidebarView === 'savings' && sessionId) {
      fetchTaxSavings(sessionId).then(setSavingsData);
    }
  }, [sidebarView, sessionId]);

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
    fetchSessions().then(setSessionList);
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

    // 첫 메시지 전송 시 세션 목록 갱신 (서버에서 가져옴)
    fetchSessions().then(setSessionList);

    try {
      await sendQueryStream(activeSessionId, trimmed, {
        onSources: (sources) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === typingMsg.id ? { ...m, sources } : m
            )
          );
        },
        onMessage: (textChunk) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === typingMsg.id
                ? { ...m, text: m.text + textChunk, isTyping: false }
                : m
            )
          );
        },
        onQuickReplies: (replies) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === typingMsg.id ? { ...m, quickReplies: replies } : m
            )
          );
        },
        onError: (err) => {
          const errMsg: Message = {
            id: `err-${Date.now()}`,
            role: 'ai',
            text: `죄송합니다, 오류가 발생했습니다.\n${err}`,
          };
          setMessages((prev) => prev.filter((m) => m.id !== typingMsg.id).concat(errMsg));
        },
        onDone: () => {
          setLoading(false);
        }
      });
    } catch (e: unknown) {
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
    const nextSessionId = createSessionId(); // "session_${Date.now()}"
    window.localStorage.setItem(SESSION_STORAGE_KEY, nextSessionId);
    setSessionId(nextSessionId);             // useEffect가 자동으로 히스토리 재조회
    setMessages([]);                         // sessionId 변경 → useEffect에서 갱신됨
    setInput('');
    setSidebarView('chat');
    setSidebarOpen(false);
    // 목록 갱신
    fetchSessions().then(setSessionList);
  }, []);

  return (
    <div
      className="h-screen flex overflow-hidden"
      style={{ background: 'var(--color-surface-2)' }}
    >
      {/* ── Sidebar ── */}
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className="flex flex-col h-screen w-64 fixed left-0 top-0 z-40 transition-transform duration-300"
        style={{
          background: 'var(--color-surface)',
          borderRight: '1px solid var(--color-border)',
          transform: sidebarOpen ? 'translateX(0)' : undefined,
        }}
      >
        <style>{`
          @media (max-width: 767px) {
            aside { transform: ${sidebarOpen ? 'translateX(0)' : 'translateX(-100%)'}; }
          }
        `}</style>

        <div className="flex flex-col h-full py-6 px-4">
          {/* Brand Logo */}
          <div className="flex items-center gap-2.5 mb-8 px-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--color-primary)' }}
            >
              <span className="material-symbols-outlined text-white text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>local_taxi</span>
            </div>
            <span className="font-bold text-[16px] tracking-tight" style={{ color: 'var(--color-text-primary)' }}>절세택시</span>
          </div>

          {/* User Profile */}
          <div className="flex items-center gap-3 mb-6 px-2 py-3 rounded-xl" style={{ background: 'var(--color-surface-2)' }}>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--color-primary-light)', border: '1px solid var(--color-border)' }}
            >
              <span className="material-symbols-outlined text-[20px]" style={{ color: 'var(--color-primary)', fontVariationSettings: "'FILL' 1" }}>person</span>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>반갑습니다</p>
              <p className="font-semibold text-[14px] truncate" style={{ color: 'var(--color-text-primary)' }}>
                {isLoggedIn ? `${userName || '회원'} 손님` : '절세택시 손님'}
              </p>
            </div>
          </div>

          {/* Tax Schedule Card */}
          <div
            className="rounded-xl p-3.5 mb-6"
            style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold" style={{ color: 'var(--color-text-muted)' }}>세무 일정</span>
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}
              >
                {getUpcomingTaxEvent().dDay}
              </span>
            </div>
            <p className="text-[13px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{getUpcomingTaxEvent().title}</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{getUpcomingTaxEvent().desc}</p>
          </div>

          {/* Nav */}
          <nav className="flex-1 space-y-0.5 overflow-y-auto">
            {[
              { icon: 'add_comment', label: '새 상담', view: 'chat' as const, onClick: handleReset },
              { icon: 'receipt_long', label: '상담 기록', view: 'history' as const, onClick: () => { setSidebarView('history'); setSidebarOpen(false); } },
              { icon: 'savings', label: '저장된 절세 정보', view: 'savings' as const, onClick: () => { setSidebarView('savings'); setSidebarOpen(false); } },
            ].map(({ icon, label, view, onClick }) => {
              const active = sidebarView === view;
              return (
                <button
                  key={label}
                  onClick={onClick}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all text-[14px] font-medium"
                  style={{
                    background: active ? 'var(--color-primary-light)' : 'transparent',
                    color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  }}
                >
                  <span
                    className="material-symbols-outlined text-[20px]"
                    style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    {icon}
                  </span>
                  {label}
                </button>
              );
            })}
          </nav>

          {/* Bottom nav */}
          <div className="mt-auto pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex gap-2">
              <Link
                href="/diagnose"
                className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-lg text-[11px] font-semibold transition-colors hover:bg-gray-50"
                style={{ color: 'var(--color-text-muted)' }}
                title="진단으로 돌아가기"
              >
                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                진단
              </Link>
              <Link
                href="/"
                className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-lg text-[11px] font-semibold transition-colors hover:bg-gray-50"
                style={{ color: 'var(--color-text-muted)' }}
                title="홈으로"
              >
                <span className="material-symbols-outlined text-[20px]">home</span>
                <span className="text-[10px] font-semibold">홈</span>
              </Link>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div
        className="flex-1 flex flex-col md:ml-64 relative h-full min-w-0"
        style={{ background: 'var(--color-surface-2)' }}
      >

        <header
          className="flex justify-between items-center px-6 py-4 sticky top-0 z-20"
          style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-3">
            <button
              className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              onClick={() => setSidebarOpen(true)}
            >
              <span className="material-symbols-outlined text-[22px]" style={{ color: 'var(--color-text-muted)' }}>menu</span>
            </button>
            <div>
              <h1 className="font-semibold text-[17px] tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
                {sidebarView === 'history' ? '상담 기록' : sidebarView === 'savings' ? '저장된 절세 정보' : 'AI 세무 상담'}
              </h1>
              {sidebarView === 'chat' && (
                <p className="text-[12px]" style={{ color: 'var(--color-text-muted)' }}>Tax-i 기사님과 실시간으로 대화하세요</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {sidebarView === 'chat' && (
              <div
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={{ background: '#ECFDF5', border: '1px solid #A7F3D0' }}
              >
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#059669' }}></div>
                <span className="text-[11px] font-semibold" style={{ color: '#059669' }}>온라인</span>
              </div>
            )}
            <button
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              style={{ color: 'var(--color-text-muted)' }}
              onClick={handleReset}
              title="새 상담"
            >
              <span className="material-symbols-outlined text-[20px]">add_comment</span>
            </button>
          </div>
        </header>

        {/* ── 상담 기록 패널 ── */}
        {sidebarView === 'history' && (
          <main className="flex-1 overflow-y-auto px-4 md:px-10 py-8">
            <div className="max-w-2xl mx-auto">
              {!isAuthenticated() ? (
                <div className="text-center py-20">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 bg-gray-100">
                    <span className="material-symbols-outlined text-3xl" style={{ color: 'var(--color-on-surface-variant)' }}>history</span>
                  </div>
                  <h3 className="text-lg font-bold mb-2">로그인이 필요합니다</h3>
                  <p className="text-sm text-gray-500 mb-6">과거 상담 내역을 저장하고 언제든 다시 확인해보세요.</p>
                  <Link href="/login?redirect=/chat" className="px-6 py-3 rounded-xl font-semibold text-sm text-white" style={{ background: 'var(--color-primary)' }}>
                    로그인하러 가기
                  </Link>
                </div>
              ) : (
                <>
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
                    const isCurrent = sess.session_id === sessionId;
                    const date = new Date(sess.created_at);
                    const dateStr = date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
                    const timeStr = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

                    return (
                      <div
                        key={sess.session_id}
                        role="button"
                        tabIndex={0}
                        onClick={async () => {
                          // 해당 세션의 메시지를 백엔드에서 불러와 채팅 뷰로 전환
                          window.localStorage.setItem(SESSION_STORAGE_KEY, sess.session_id);
                          setSessionId(sess.session_id);
                          setSidebarView('chat');
                        }}
                        className="w-full text-left p-4 rounded-xl border transition-all relative group"
                        style={{
                          background: isCurrent ? 'rgba(53,37,205,0.05)' : 'white',
                          borderColor: isCurrent ? 'var(--color-primary)' : 'rgba(199,196,216,0.3)',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                        }}
                      >
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (window.confirm('이 상담 기록을 삭제하시겠습니까?')) {
                              const success = await deleteSession(sess.session_id);
                              if (success) {
                                if (isCurrent) {
                                  // 현재 세션 삭제 시 새 상담으로 초기화
                                  handleReset();
                                } else {
                                  fetchSessions().then(setSessionList);
                                }
                              }
                            }
                          }}
                          className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-full transition-opacity hover:bg-red-50 text-red-400"
                          title="상담 기록 삭제"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                        </button>

                        <div className="flex items-start justify-between gap-2 pr-8">
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
                      </div>
                    );
                  })}
                  <p className="text-center text-xs mt-4" style={{ color: 'var(--color-outline)' }}>
                    기록은 서버(SQLite DB)에 안전하게 보관됩니다.
                  </p>
                </div>
              )}
              </>
              )}
            </div>
          </main>
        )}


        {/* ── 저장된 절세 정보 패널 ── */}
        {sidebarView === 'savings' && (
          <main className="flex-1 overflow-y-auto" style={{ background: 'var(--color-surface-2)' }}>
            <div className="max-w-2xl mx-auto px-4 md:px-8 py-8">
              {!isAuthenticated() ? (
                <div className="text-center py-24">
                  <div
                    className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-6"
                    style={{ background: 'linear-gradient(135deg, rgba(90,50,250,0.12), rgba(139,92,246,0.08))', border: '1px solid rgba(90,50,250,0.15)' }}
                  >
                    <span className="material-symbols-outlined text-4xl" style={{ color: '#5A32FA', fontVariationSettings: "'FILL' 1" }}>lock</span>
                  </div>
                  <h3 className="text-xl font-bold mb-2" style={{ color: '#0f0f13' }}>로그인이 필요합니다</h3>
                  <p className="text-sm mb-8" style={{ color: '#64748b' }}>나만의 절세 진단 결과를 저장하고 관리하세요.</p>
                  <Link
                    href="/login?redirect=/chat"
                    className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl font-bold text-sm text-white transition-all hover:-translate-y-0.5"
                    style={{ background: 'linear-gradient(135deg, #5A32FA 0%, #7C3AED 100%)', boxShadow: '0 8px 24px rgba(90,50,250,0.35)' }}
                  >
                    로그인하러 가기
                  </Link>
                </div>
              ) : (
                <>
                  {/* Page Title */}
                  <div className="mb-6">
                    <h2 className="font-bold text-2xl tracking-tight" style={{ color: '#0f0f13' }}>나의 절세 정보</h2>
                    <p className="text-sm mt-1" style={{ color: '#94a3b8' }}>진단 결과를 바탕으로 예상 환급액을 확인하세요</p>
                  </div>

                  {savingsData ? (
                    <>
                      {/* Hero Refund Card – 화면에서 압도적으로 가장 크고 눈에 띄어야 함 */}
                      <div
                        className="rounded-2xl mb-5 relative overflow-hidden"
                        style={{
                          background: 'var(--color-primary)',
                          padding: '32px 28px',
                          boxShadow: '0 8px 24px rgba(79,70,229,0.22), 0 2px 8px rgba(79,70,229,0.1)',
                        }}
                      >
                        {/* subtle texture */}
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, white 0%, transparent 60%)' }} />

                        <p
                          className="text-[11px] font-semibold tracking-widest uppercase mb-3"
                          style={{ color: 'rgba(255,255,255,0.55)', letterSpacing: '0.12em' }}
                        >
                          예상 세액공제 환급액
                        </p>

                        {/* 핵심: 숫자와 단위 확실히 분리 */}
                        <div className="flex items-baseline gap-1.5 mb-1">
                          <span
                            className="font-bold tracking-tight"
                            style={{ fontSize: '52px', lineHeight: 1, color: 'white' }}
                          >
                            {Math.round(savingsData.estimated_refund / 10000 * 10) / 10 % 1 === 0
                              ? (savingsData.estimated_refund / 10000).toLocaleString()
                              : (savingsData.estimated_refund / 10000).toLocaleString()}
                          </span>
                          <span
                            className="font-semibold"
                            style={{ fontSize: '20px', color: 'rgba(255,255,255,0.6)', marginBottom: '4px' }}
                          >
                            만원
                          </span>
                        </div>

                        <p
                          className="text-[13px]"
                          style={{ color: 'rgba(255,255,255,0.5)' }}
                        >
                          세액공제율 {savingsData.income_range === 'over' ? '13.2%' : '16.5%'} 기준 —
                          {' '}
                          <span style={{ color: 'rgba(255,255,255,0.75)' }}>지방소득세 포함</span>
                        </p>
                      </div>

                      {/* Stats – 비대칭: 총납입액은 따로 크게, 세부는 작은 행 목록 */}
                      <div
                        className="rounded-xl p-5 mb-3"
                        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
                      >
                        {/* 총납입액 – 이 영역에서 가장 크게 */}
                        <div className="flex items-baseline justify-between mb-4 pb-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <span className="text-[13px] font-medium" style={{ color: 'var(--color-text-muted)' }}>총 납입액</span>
                          <div className="flex items-baseline gap-1">
                            <span className="font-bold" style={{ fontSize: '28px', color: 'var(--color-text-primary)', lineHeight: 1 }}>
                              {((savingsData.pension_savings_paid + savingsData.irp_paid) / 10000).toLocaleString()}
                            </span>
                            <span className="text-[15px] font-medium" style={{ color: 'var(--color-text-muted)' }}>만원</span>
                          </div>
                        </div>

                        {/* 세부항목 – 작고 질서정연한 행 목록 */}
                        <div className="space-y-3">
                          {[
                            { label: '총 급여 구간', value: savingsData.income_range === 'over' ? '5,500만원 초과' : '5,500만원 이하' },
                            { label: '연금저축 납입', value: `${(savingsData.pension_savings_paid / 10000).toLocaleString()}만원` },
                            { label: 'IRP 납입', value: `${(savingsData.irp_paid / 10000).toLocaleString()}만원` },
                            { label: '공제 대상 금액', value: `${(savingsData.deductible_amount / 10000).toLocaleString()}만원` },
                          ].map(({ label, value }) => (
                            <div key={label} className="flex items-center justify-between">
                              <span className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                              <span className="text-[14px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 세액공제율 텍스트 하이라이트 – 알약 태그 대신 inline highlight */}
                      <div
                        className="px-4 py-3 rounded-xl mb-5 flex items-center gap-3"
                        style={{ background: '#EEF2FF', border: '1px solid #C7D2FE' }}
                      >
                        <span className="text-[13px] font-medium" style={{ color: '#4338CA' }}>
                          적용 세액공제율 <strong style={{ fontSize: '15px' }}>{savingsData.income_range === 'over' ? '13.2%' : '16.5%'}</strong>
                          {' '}(총급여 {savingsData.income_range === 'over' ? '5,500만원 초과' : '5,500만원 이하'} 기준)
                        </span>
                      </div>

                      {/* 🧮 간이 연말정산 시뮬레이터 통합 섹션 */}
                      <div
                        className="rounded-xl p-5 mb-5"
                        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
                      >
                        <div className="mb-4 pb-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
                          <h3 className="font-bold text-[15px] flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
                            <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)', fontSize: '20px' }}>calculate</span>
                            간이 연말정산 시뮬레이터
                          </h3>
                          <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            기존에 진단 및 저장하신 연금저축/IRP 납입액이 자동으로 연동됩니다.
                          </p>
                        </div>

                        {/* 계산기 입력 폼 */}
                        <form onSubmit={handleCalculate} className="space-y-4">
                          {/* 세전 연봉 */}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                              세전 연봉 입력
                            </label>
                            <div className="relative flex items-center">
                              <input
                                type="text"
                                value={grossSalaryInput}
                                onChange={handleSalaryChange}
                                placeholder="예: 50,000,000"
                                required
                                className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-1 text-xs text-right pr-8"
                                style={{
                                  background: 'var(--color-surface)',
                                  borderColor: 'var(--color-border-strong)',
                                  color: 'var(--color-text-primary)',
                                }}
                              />
                              <span className="absolute right-3 font-semibold text-xs" style={{ color: 'var(--color-text-muted)' }}>원</span>
                            </div>
                          </div>

                          {/* 부양가족 수 */}
                          <div className="flex justify-between items-center py-2 border-b border-dashed" style={{ borderColor: 'var(--color-border)' }}>
                            <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                              부양가족 수 (본인 포함)
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setFamilyCount(prev => Math.max(1, prev - 1))}
                                className="w-6 h-6 rounded-full border flex items-center justify-center font-bold text-xs hover:bg-gray-100 transition-colors"
                                style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-text-primary)' }}
                              >
                                -
                              </button>
                              <span className="font-bold text-xs w-4 text-center">{familyCount}</span>
                              <button
                                type="button"
                                onClick={() => setFamilyCount(prev => prev + 1)}
                                className="w-6 h-6 rounded-full border flex items-center justify-center font-bold text-xs hover:bg-gray-100 transition-colors"
                                style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-text-primary)' }}
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {/* 아코디언 추가정보 */}
                          <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
                            <button
                              type="button"
                              onClick={() => setIsAccordionOpen(!isAccordionOpen)}
                              className="w-full px-3 py-1.5 flex justify-between items-center text-xs font-semibold hover:bg-gray-50 transition-colors"
                              style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }}
                            >
                              <span>추가 정보 입력 (선택)</span>
                              <span className="material-symbols-outlined transform transition-transform" style={{ transform: isAccordionOpen ? 'rotate(180deg)' : 'none', fontSize: '15px' }}>
                                expand_more
                              </span>
                            </button>
                            {isAccordionOpen && (
                              <div className="p-3 flex flex-col gap-2.5" style={{ background: 'var(--color-surface)' }}>
                                <div className="flex flex-col gap-1.5">
                                  <label className="text-[10px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                                    미리 낸 세금 (기납부세액)
                                  </label>
                                  <div className="relative flex items-center">
                                    <input
                                      type="text"
                                      value={prepaidTaxInput}
                                      onChange={handlePrepaidTaxChange}
                                      placeholder="원천징수영수증 소득세 결정세액"
                                      className="w-full px-3 py-1.5 rounded border focus:outline-none focus:ring-1 text-[11px] text-right pr-8"
                                      style={{
                                        background: 'var(--color-surface)',
                                        borderColor: 'var(--color-border-strong)',
                                        color: 'var(--color-text-primary)',
                                      }}
                                    />
                                    <span className="absolute right-3 font-semibold text-[10px]" style={{ color: 'var(--color-text-muted)' }}>원</span>
                                  </div>
                                  <p className="text-[9px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                                    ※ 미입력 시 결정세액의 1.05배를 자동 추정 적용합니다.
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>

                          <button
                            type="submit"
                            disabled={calcLoading}
                            className="w-full py-2.5 rounded-lg text-white font-bold text-xs transition-all hover:opacity-90 flex items-center justify-center cursor-pointer"
                            style={{
                              background: 'var(--color-primary)',
                              boxShadow: '0 2px 8px rgba(79,70,229,0.2)',
                            }}
                          >
                            {calcLoading ? '계산하는 중...' : '예상 연말정산 결과 보기'}
                          </button>
                        </form>

                        {/* 계산 결과 노출 */}
                        {calcResult && (
                          <div
                            className="mt-5 p-4 rounded-lg border text-xs"
                            style={{
                              background: 'var(--color-surface-2)',
                              borderColor: calcResult.status === 'REFUND' ? 'var(--color-secondary)' : 'var(--color-error)',
                            }}
                          >
                            <div className="text-center flex flex-col items-center gap-1.5">
                              <h4 className="font-extrabold text-[13px]">
                                {calcResult.status === 'REFUND' ? (
                                  <span style={{ color: 'var(--color-secondary)' }}>
                                    🎉 약 {Math.abs(calcResult.totalDifference).toLocaleString('ko-KR')}원 환급 예상!
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--color-error)' }}>
                                    ⚠️ 약 {calcResult.totalDifference.toLocaleString('ko-KR')}원 추가납부 예상
                                  </span>
                                )}
                              </h4>
                              <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                                (지방소득세 10% 포함 최종 차액)
                              </p>
                            </div>

                            {/* 상세 내역 아코디언 */}
                            <div className="mt-3 border-t pt-2.5" style={{ borderColor: 'var(--color-border)' }}>
                              <button
                                type="button"
                                onClick={() => setIsCalcResultOpen(!isCalcResultOpen)}
                                className="w-full flex justify-between items-center text-[11px] font-bold py-1"
                                style={{ color: 'var(--color-text-primary)' }}
                              >
                                <span>상세 정산 요약 내역</span>
                                <span className="material-symbols-outlined transform transition-transform" style={{ transform: isCalcResultOpen ? 'rotate(180deg)' : 'none', fontSize: '14px' }}>
                                  expand_more
                                </span>
                              </button>

                              {isCalcResultOpen && (
                                <div className="mt-2.5 flex flex-col gap-1.5 text-[11px]">
                                  <div className="flex justify-between py-1 border-b border-dashed" style={{ borderColor: 'var(--color-border)' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>세전 연봉 (총급여)</span>
                                    <span className="font-semibold">{calcResult.grossSalary.toLocaleString('ko-KR')}원</span>
                                  </div>
                                  <div className="flex justify-between py-1 border-b border-dashed" style={{ borderColor: 'var(--color-border)' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>과세표준</span>
                                    <span className="font-semibold">{calcResult.taxBase.toLocaleString('ko-KR')}원</span>
                                  </div>
                                  <div className="flex justify-between py-1 border-b border-dashed" style={{ borderColor: 'var(--color-border)' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>산출세액</span>
                                    <span className="font-semibold">{calcResult.calculatedTax.toLocaleString('ko-KR')}원</span>
                                  </div>
                                  <div className="flex justify-between py-1 border-b border-dashed text-[10px]" style={{ borderColor: 'var(--color-border)' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>└ 근로소득 세액공제</span>
                                    <span className="font-medium" style={{ color: 'var(--color-error)' }}>-{calcResult.earnedIncomeTaxCredit.toLocaleString('ko-KR')}원</span>
                                  </div>
                                  <div className="flex justify-between py-1 border-b border-dashed text-[10px]" style={{ borderColor: 'var(--color-border)' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>└ 연금계좌 세액공제</span>
                                    <span className="font-medium" style={{ color: 'var(--color-error)' }}>-{calcResult.pensionTaxCredit.toLocaleString('ko-KR')}원</span>
                                  </div>
                                  <div className="flex justify-between py-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
                                    <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>결정세액 (소득세)</span>
                                    <span className="font-bold" style={{ color: 'var(--color-text-primary)' }}>{calcResult.finalTax.toLocaleString('ko-KR')}원</span>
                                  </div>
                                  <div className="flex justify-between py-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
                                    <span style={{ color: 'var(--color-text-muted)' }}>기납부세액 (미리 낸 세금)</span>
                                    <span className="font-medium">{calcResult.estimatedPrepaidTax.toLocaleString('ko-KR')}원</span>
                                  </div>
                                  <div className="flex justify-between py-1.5 font-bold text-xs mt-0.5">
                                    <span style={{ color: 'var(--color-text-primary)' }}>최종 정산 예상액</span>
                                    <span style={{ color: calcResult.status === 'REFUND' ? 'var(--color-secondary)' : 'var(--color-error)' }}>
                                      {calcResult.status === 'REFUND' ? `환급 ${Math.abs(calcResult.totalDifference).toLocaleString('ko-KR')}원` : `추가납부 ${calcResult.totalDifference.toLocaleString('ko-KR')}원`}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* 법적 및 디펜스용 안내 문구 */}
                        <div className="mt-4 p-3 rounded border text-[9px] leading-relaxed" style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
                          <p className="font-bold mb-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                            ⚠️ 연말정산 간이 시뮬레이션 결과 안내
                          </p>
                          <ul className="list-disc pl-3 flex flex-col gap-0.5">
                            <li>기본 소득공제(식대, 4대보험, 인적공제) 및 연금 세액공제만을 반영한 시뮬레이터입니다.</li>
                            <li>실제 정산 결과는 개별 실증공제 항목(신용카드, 의료비, 월세 등)에 따라 크게 달라질 수 있습니다.</li>
                            <li>정확한 세액 확인은 국세청 홈택스 또는 세무사 상담을 통해 확인하시기 바랍니다.</li>
                          </ul>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div
                      className="rounded-3xl p-10 mb-4 text-center"
                      style={{ background: 'white', border: '2px dashed rgba(90,50,250,0.15)', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}
                    >
                      <span className="material-symbols-outlined text-5xl block mb-3" style={{ color: '#c4b5fd', fontVariationSettings: "'FILL' 1" }}>savings</span>
                      <p className="font-bold text-[16px] mb-1" style={{ color: '#0f0f13' }}>저장된 절세 정보가 없습니다</p>
                      <p className="text-sm" style={{ color: '#94a3b8' }}>진단 시뮬레이터를 통해 결과를 저장해보세요.</p>
                    </div>
                  )}

                  {/* CTA Card – 버튼에 hover/active 손맛 */}
                  <div
                    className="rounded-xl p-5 mb-4"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-sm)' }}
                  >
                    <div className="mb-4">
                      <p className="font-semibold text-[15px]" style={{ color: 'var(--color-text-primary)' }}>다시 진단해보기</p>
                      <p className="text-[13px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>납입액을 조정하면 환급액이 얼마나 달라지는지 확인하세요.</p>
                    </div>
                    <Link
                      href="/diagnose"
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-[14px] text-white"
                      style={{
                        background: 'var(--color-primary)',
                        boxShadow: '0 2px 8px rgba(79,70,229,0.25)',
                        transition: 'transform 0.12s ease, box-shadow 0.12s ease',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 16px rgba(79,70,229,0.35)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(79,70,229,0.25)'; }}
                      onMouseDown={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)'; }}
                      onMouseUp={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
                    >
                      진단 시뮬레이터 열기
                    </Link>
                  </div>

                  <p className="text-center text-[11px]" style={{ color: '#94a3b8', lineHeight: 1.7 }}>
                    실제 세액공제액은 결정세액 및 다른 공제 항목에 따라 달라질 수 있습니다.<br/>중요한 결정 전 세무 전문가와 상담하세요.
                  </p>
                </>
              )}
            </div>
          </main>
        )}

        {/* Chat area (sidebarView === 'chat'일 때만 표시) */}
        {sidebarView === 'chat' && (
        <main
          className="flex-1 overflow-y-auto relative"
          style={{ paddingBottom: '180px', background: 'var(--color-surface-2)' }}
        >
          <div className="px-4 md:px-8 py-8 space-y-5 max-w-3xl mx-auto">
            {messages.map((msg, idx) =>
              msg.role === 'ai' ? (
                <div key={msg.id} className="flex gap-3 max-w-[88%]" style={{ animation: `chatFadeIn 0.3s ease-out ${idx * 0.04}s both` }}>
                  <AiAvatar />
                  <div className="flex flex-col gap-1 min-w-0 mt-1">
                    <span className="text-[12px] ml-1 font-bold" style={{ color: '#64748b' }}>
                      Tax-i 기사님
                    </span>
                    <div
                      className="py-4 px-5 rounded-2xl rounded-tl-none text-[15px] leading-relaxed"
                      style={{
                        background: 'white',
                        color: '#1e293b',
                        whiteSpace: 'pre-wrap',
                        boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
                        border: '1px solid rgba(0,0,0,0.04)',
                      }}
                    >
                      {msg.isTyping ? <TypingDots /> : formatText(msg.text, msg.sources)}
                      {msg.sources && msg.sources.length > 0 && (
                        <div
                          className="mt-3 pt-3"
                          style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}
                        >
                          <div className="flex items-center gap-1.5 mb-2">
                            <span
                              className="material-symbols-outlined"
                              style={{ fontSize: '14px', color: '#94a3b8' }}
                            >
                              library_books
                            </span>
                            <span className="text-[12px] font-semibold" style={{ color: '#94a3b8' }}>
                              참조 자료
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            {groupSources(msg.sources).map((group) => (
                              <SourceChip key={group.key} group={group} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {msg.quickReplies && msg.quickReplies.length > 0 && !msg.isTyping && (
                      <div className="flex flex-wrap gap-2 mt-2 ml-1">
                        {msg.quickReplies.map((qr, i) => (
                          <button
                            key={i}
                            onClick={() => sendMessage(qr)}
                            disabled={loading}
                            className="text-[13px] px-3.5 py-1.5 rounded-lg font-medium transition-colors"
                            style={{
                              background: 'var(--color-surface)',
                              border: '1px solid var(--color-border)',
                              color: 'var(--color-primary)',
                            }}
                          >
                            {qr}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  key={msg.id}
                  className="flex gap-3 max-w-[78%] ml-auto justify-end"
                  style={{ animation: `chatFadeIn 0.3s ease-out both` }}
                >
                  <div className="flex flex-col gap-1 items-end min-w-0">
                  <div
                      className="py-3 px-4 rounded-xl rounded-tr-sm text-[15px] leading-relaxed"
                      style={{
                        background: 'var(--color-primary)',
                        color: 'white',
                        whiteSpace: 'pre-wrap',
                        boxShadow: '0 2px 8px rgba(79,70,229,0.25)',
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
        )}

        {/* ── Input Area (chat 뷰에서만 표시) ── */}
        {sidebarView === 'chat' && (
        <div
          className="absolute bottom-0 left-0 right-0 z-20"
          style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', paddingBottom: '16px' }}
        >
          <div className="max-w-3xl mx-auto px-4 md:px-6 pt-3">
            {/* Quick actions */}
            <div className="flex gap-2 mb-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action}
                  onClick={() => sendMessage(action)}
                  disabled={loading}
                  className="flex-shrink-0 px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors"
                  style={{
                    background: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {action}
                </button>
              ))}
            </div>

            {/* Textarea + Send Button */}
            <div
              className="flex items-end gap-3 px-4 py-3 rounded-xl transition-all"
              style={{
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
              }}
            >
              <textarea
                ref={textareaRef}
                className="flex-1 bg-transparent border-none outline-none resize-none text-[15px] leading-relaxed"
                style={{
                  minHeight: '24px',
                  maxHeight: '120px',
                  color: 'var(--color-text-primary)',
                }}
                placeholder="연금, 세액공제, IRP에 대해 편하게 질문해 주세요."
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
                className="flex items-center justify-center flex-shrink-0 rounded-lg transition-all"
                style={{
                  width: '36px',
                  height: '36px',
                  background: loading || !input.trim() ? 'var(--color-surface-3)' : 'var(--color-primary)',
                  color: loading || !input.trim() ? 'var(--color-text-muted)' : 'white',
                }}
              >
                {loading ? (
                  <span
                    className="w-4 h-4 border-2 rounded-full"
                    style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white', animation: 'spin 0.7s linear infinite' }}
                  />
                ) : (
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>send</span>
                )}
              </button>
            </div>

            <p className="text-center text-[11px] mt-2 font-medium" style={{ color: '#94a3b8' }}>
              Tax-i 기사님은 공식 자료 기반으로 안내드립니다. 최종 결정 전 세무 전문가 상담을 권장합니다.
            </p>
          </div>
        </div>
        )}
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
