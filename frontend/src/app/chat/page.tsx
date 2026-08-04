'use client';

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Source {
  question?: string;
  answer?: string;
  source_title?: string;
  source_url?: string;
  effective_date?: string;
  category?: string;
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
  '연말정산 환급 방법',
  '퇴직연금 전환 방법',
];

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'ai',
  text: '안녕하세요! 절세택시의 AI 기사입니다 🚕\n\n고객님의 연금 및 ISA 계좌 현황을 바탕으로 최적의 절세 경로를 안내해 드릴게요. 무엇이든 물어보세요!',
};

// ─── Component helpers ────────────────────────────────────────────────────────
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  const handleTextareaInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', text: trimmed };
    const typingMsg: Message = { id: `typing-${Date.now()}`, role: 'ai', text: '', isTyping: true };

    setMessages((prev) => [...prev, userMsg, typingMsg]);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '40px';
    }
    setLoading(true);

    try {
      const res = await fetch('http://localhost:8000/api/v1/chat/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `서버 오류 (${res.status})`);
      }

      const json = await res.json();
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
  }, [loading]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleReset = useCallback(() => {
    setMessages([WELCOME_MESSAGE]);
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
              { icon: 'verified_user', label: '프리미엄 지원', active: false },
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
            <button
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border-2 transition-colors"
              style={{ borderColor: 'var(--color-secondary)', color: 'var(--color-secondary)' }}
            >
              프로로 업그레이드
            </button>
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
                        <div
                          className="mt-3 pt-3 space-y-2"
                          style={{ borderTop: '1px solid rgba(199,196,216,0.25)' }}
                        >
                          <p className="text-xs font-semibold" style={{ color: 'var(--color-on-surface-variant)' }}>
                            참조 자료
                          </p>
                          {msg.sources.slice(0, 3).map((src, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-2 text-xs p-2 rounded-lg"
                              style={{ background: 'rgba(229,238,255,0.5)' }}
                            >
                              <span
                                className="material-symbols-outlined flex-shrink-0 mt-0.5"
                                style={{ fontSize: '14px', color: 'var(--color-primary)' }}
                              >
                                description
                              </span>
                              <div className="min-w-0">
                                {src.question && (
                                  <p className="font-medium truncate" style={{ color: 'var(--color-on-surface)' }}>
                                    {src.question}
                                  </p>
                                )}
                                {src.source_title && (
                                  <p style={{ color: 'var(--color-on-surface-variant)' }}>{src.source_title}</p>
                                )}
                                {src.effective_date && (
                                  <p style={{ color: 'var(--color-outline)' }}>기준일: {src.effective_date}</p>
                                )}
                              </div>
                            </div>
                          ))}
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
