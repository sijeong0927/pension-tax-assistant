'use client';

import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useState, useEffect } from "react";
import { isAuthenticated } from "@/lib/auth";
import { fetchMe } from "@/lib/api";

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const auth = isAuthenticated();
    setLoggedIn(auth);
    if (auth) {
      fetchMe().then((data) => {
        if (data?.name) {
          setUserName(data.name);
        }
      });
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-transparent">

      <Header />

      <main className="flex-grow flex flex-col items-center justify-center px-4 md:px-8 py-6 md:py-16 z-10">
        <div className="w-full max-w-[800px] flex flex-col items-center text-center gap-6 md:gap-10">

          {/* ── Hero ── */}
          <div className="flex flex-col items-center gap-4 md:gap-6 w-full">
            {/* Icon circle - Responsive Size */}
            <div className="hero-icon-circle shadow-xl md:shadow-2xl animate-in fade-in zoom-in duration-700 ease-out fill-mode-both hover:scale-105 transition-transform">
              <span
                className="material-symbols-outlined text-5xl md:text-7xl"
                style={{
                  color: "var(--color-primary)",
                  fontVariationSettings: "'FILL' 1, 'wght' 300",
                }}
              >
                local_taxi
              </span>
            </div>

            {/* Headline */}
            <h1 className="hero-headline px-2 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150 fill-mode-both ease-out">
              {mounted && userName && (
                <span className="block mb-1 md:mb-2 text-xl sm:text-2xl md:text-3xl font-bold" style={{ color: "var(--color-on-surface)" }}>
                  {userName}님!
                </span>
              )}
              <span className="inline-block">2026 연금 세액공제</span>{' '}
              <span className="inline-block">AI 빠른 경로 안내</span><br />
              <span style={{ color: "var(--color-primary)", display: "inline-block" }}>절세택시</span>
              <br />
              <span className="hero-subheadline">
                (Tax-i : Tax + AI)
              </span>
            </h1>

            {/* Subtext */}
            <p className="hero-body px-2 leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300 fill-mode-both ease-out">
              &ldquo;기사님, 연금저축이랑 IRP로 세금 얼마나 아껴요?&rdquo;<br className="hidden sm:inline" />
              {' '}돌아가시지 말고 1초 만에 최적의 절세 경로로 안내받으세요.
            </p>
          </div>

          {/* ── Action Cards ── */}
          <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mt-2 md:mt-4">
            
            {/* Card 1 – 진단 */}
            <Link href="/diagnose" className="action-card action-card--primary shadow-premium hover:shadow-premium-hover transition-all duration-300 group glass-panel rounded-2xl md:rounded-3xl animate-in fade-in slide-in-from-bottom-12 duration-700 delay-500 fill-mode-both ease-out">
              <div className="card-icon-wrap card-icon-wrap--primary group-hover:scale-110 transition-transform duration-300">
                <span
                  className="material-symbols-outlined text-2xl md:text-3xl"
                  style={{
                    color: "var(--color-primary)",
                    fontVariationSettings: "'FILL' 0, 'wght' 400",
                  }}
                >
                  query_stats
                </span>
              </div>
              <h3 className="card-title">1초 만에 절세택시 탑승하기</h3>
              <p className="card-body">
                몇 가지 질문으로 예상 세액 공제 효과를 빠르게 확인하세요.
              </p>
              <div className="card-cta card-cta--filled group-hover:-translate-y-1 transition-transform duration-300">바로 진단하기</div>
            </Link>

            {/* Card 2 – 챗봇 */}
            <Link href="/chat" className="action-card shadow-premium hover:shadow-premium-hover transition-all duration-300 group glass-panel rounded-2xl md:rounded-3xl animate-in fade-in slide-in-from-bottom-12 duration-700 delay-700 fill-mode-both ease-out">
              <div className="card-icon-wrap card-icon-wrap--secondary group-hover:scale-110 transition-transform duration-300">
                <span
                  className="material-symbols-outlined text-2xl md:text-3xl"
                  style={{
                    color: "var(--color-secondary)",
                    fontVariationSettings: "'FILL' 0, 'wght' 400",
                  }}
                >
                  smart_toy
                </span>
              </div>
              <h3 className="card-title">AI 기사님과 1:1 절세 상담</h3>
              <p className="card-body">
                궁금한 세금 질문, 미터기 올라갈 걱정 없이 물어보세요.
              </p>
              <div className="card-cta card-cta--outlined group-hover:-translate-y-1 transition-transform duration-300 bg-white">상담 시작하기</div>
            </Link>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
