import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Header />

      <main className="flex-grow flex flex-col items-center justify-center px-4 py-10 md:py-16">
        <div className="w-full max-w-[800px] flex flex-col items-center text-center gap-10">

          {/* ── Hero ── */}
          <div className="flex flex-col items-center gap-6">
            {/* Icon circle */}
            <div className="hero-icon-circle">
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: "80px",
                  color: "var(--color-primary)",
                  fontVariationSettings: "'FILL' 1, 'wght' 300",
                }}
              >
                local_taxi
              </span>
            </div>

            {/* Headline */}
            <h1 className="hero-headline">
              2026 연금 세액공제<br />
              AI 빠른 경로 안내<br />
              <span style={{ color: "var(--color-primary)" }}>절세택시</span>
              <br />
              <span className="hero-subheadline">
                (Tax-i : Tax + AI)
              </span>
            </h1>

            {/* Subtext */}
            <p className="hero-body">
              &ldquo;아저씨, 연금저축이랑 IRP로 세금 얼마나 아껴요?&rdquo;<br />
              돌아가시지 말고 1초 만에 최적의 절세 경로로 안내받으세요.
            </p>
          </div>

          {/* ── Action Cards ── */}
          <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">

            {/* Card 1 – 진단 */}
            <Link href="/diagnose" className="action-card action-card--primary">
              <div className="card-icon-wrap card-icon-wrap--primary">
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: "32px",
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
              <div className="card-cta card-cta--filled">바로 시작하기</div>
            </Link>

            {/* Card 2 – 챗봇 */}
            <Link href="/chat" className="action-card">
              <div className="card-icon-wrap card-icon-wrap--secondary">
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: "32px",
                    color: "var(--color-secondary)",
                    fontVariationSettings: "'FILL' 0, 'wght' 400",
                  }}
                >
                  smart_toy
                </span>
              </div>
              <h3 className="card-title">AI 기사님과 1:1 절세 상담</h3>
              <p className="card-body">
                궁금한 세금 질문, 미터기 올라갈 걱정 없이 물어보세요
              </p>
              <div className="card-cta card-cta--outlined">상담 시작하기</div>
            </Link>

          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
