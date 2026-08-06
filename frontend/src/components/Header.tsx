'use client';

import Link from "next/link";
import { useState, useEffect } from "react";
import { isAuthenticated, removeAuthToken } from "@/lib/auth";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  useEffect(() => {
    setLoggedIn(isAuthenticated());
  }, []);

  const handleLogout = () => {
    removeAuthToken();
    setLoggedIn(false);
    window.location.reload();
  };

  return (
    <header
      className="w-full flex items-center px-8 sticky top-0 z-50"
      style={{
        height: '60px',
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <div className="max-w-[1200px] mx-auto w-full flex justify-between items-center">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <span
            className="material-symbols-outlined text-[32px]"
            style={{
              color: "var(--color-primary)",
              fontVariationSettings: "'FILL' 1, 'wght' 500",
            }}
          >
            manage_search
          </span>
          <span
            className="text-2xl font-bold tracking-tight"
            style={{
              fontFamily: "'Hanken Grotesk', sans-serif",
              color: "var(--color-primary)",
            }}
          >
            절세택시
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex gap-10">
          <button
            title="절세택시는 2026 연금 세액공제 한도를 계산하고 AI와 상담할 수 있는 빠른 경로 안내 서비스입니다."
            onClick={() => setIsAboutOpen(true)}
            className="text-sm font-semibold transition-colors"
            style={{ color: "var(--color-on-surface-variant)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--color-primary)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--color-on-surface-variant)")
            }
          >
            About
          </button>
          
          {loggedIn ? (
            <button
              onClick={handleLogout}
              className="text-sm font-medium transition-colors px-4 py-1.5 rounded-lg"
              style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
            >
              로그아웃
            </button>
          ) : (
            <Link
              href="/login"
              className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition-all"
              style={{ background: 'var(--color-primary)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.9'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
            >
              로그인 / 회원가입
            </Link>
          )}
        </nav>

        {/* Mobile menu button */}
        <button
          className="md:hidden p-2 rounded-lg"
          style={{ color: "var(--color-on-surface-variant)" }}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="메뉴 열기"
        >
          <span className="material-symbols-outlined text-2xl">
            {menuOpen ? "close" : "menu"}
          </span>
        </button>
      </div>

      {/* Mobile Dropdown */}
      {menuOpen && (
        <div
          className="absolute top-20 left-0 w-full glass-panel border-t px-10 py-4 flex flex-col gap-4 md:hidden"
          style={{ borderColor: "rgba(199,196,216,0.3)" }}
        >
          <button
            title="절세택시는 2026 연금 세액공제 한도를 계산하고 AI와 상담할 수 있는 빠른 경로 안내 서비스입니다."
            className="text-sm font-semibold py-2 text-left"
            style={{ color: "var(--color-on-surface-variant)" }}
            onClick={() => {
              setIsAboutOpen(true);
              setMenuOpen(false);
            }}
          >
            About
          </button>

          
          {loggedIn ? (
            <button
              onClick={() => { handleLogout(); setMenuOpen(false); }}
              className="text-sm font-semibold py-2 text-left"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              로그아웃
            </button>
          ) : (
            <Link
              href="/login"
              className="text-sm font-semibold py-2"
              style={{ color: "var(--color-primary)" }}
              onClick={() => setMenuOpen(false)}
            >
              로그인 / 회원가입
            </Link>
          )}
        </div>
      )}

      {/* About Modal */}
      {isAboutOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm transition-all">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <button
              onClick={() => setIsAboutOpen(false)}
              className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
            <div className="flex flex-col items-center text-center gap-4 mt-2">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "rgba(53,37,205,0.1)" }}>
                <span className="material-symbols-outlined text-3xl bg-transparent" style={{ color: "var(--color-primary)", fontVariationSettings: "'FILL' 1" }}>local_taxi</span>
              </div>
              <h3 className="text-xl font-bold tracking-tight" style={{ color: "var(--color-on-surface)" }}>절세택시 소개</h3>
              <p className="text-sm leading-relaxed break-keep" style={{ color: "var(--color-on-surface-variant)", wordBreak: "keep-all" }}>
                절세택시는 복잡한 2026년 연금 세액공제 한도를 <span className="whitespace-nowrap">1초 만에</span> 계산하고, 전문 AI와 실시간으로 맞춤형 상담을 진행할 수 있는 <strong style={{ color: "var(--color-primary)" }}>빠른 경로 안내 서비스</strong>입니다.
              </p>
              <button
                onClick={() => setIsAboutOpen(false)}
                className="mt-4 w-full py-3.5 rounded-xl font-semibold text-white transition-transform hover:-translate-y-0.5 shadow-lg"
                style={{ background: "var(--color-primary)" }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
