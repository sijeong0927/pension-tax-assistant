export default function Footer() {
  return (
    <footer
      className="w-full py-10 mt-auto"
      style={{
        borderTop: "1px solid rgba(199,196,216,0.3)",
        background: "rgba(248,249,255,0.5)",
      }}
    >
      <div className="max-w-[1200px] mx-auto px-4 text-center flex flex-col items-center gap-1">
        <p
          className="text-xs"
          style={{ color: "var(--color-on-surface-variant)" }}
        >
          © 2026 절세택시. All rights reserved.
        </p>
        <p
          className="text-xs"
          style={{ color: "var(--color-outline)" }}
        >
          본 서비스는 국세청 홈택스 자료를 기반으로 제공됩니다.
        </p>
      </div>
    </footer>
  );
}
