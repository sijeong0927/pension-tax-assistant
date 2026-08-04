'use client';

import Link from "next/link";
import { useState } from "react";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      className="w-full h-20 flex items-center px-10 glass-panel sticky top-0 z-50"
      style={{ borderBottom: "1px solid rgba(199,196,216,0.3)" }}
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
          <a
            href="#"
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
          </a>
          <a
            href="#"
            className="text-sm font-semibold transition-colors"
            style={{ color: "var(--color-on-surface-variant)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--color-primary)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--color-on-surface-variant)")
            }
          >
            Manual
          </a>
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
          <a
            href="#"
            className="text-sm font-semibold py-2"
            style={{ color: "var(--color-on-surface-variant)" }}
            onClick={() => setMenuOpen(false)}
          >
            About
          </a>
          <a
            href="#"
            className="text-sm font-semibold py-2"
            style={{ color: "var(--color-on-surface-variant)" }}
            onClick={() => setMenuOpen(false)}
          >
            Manual
          </a>
        </div>
      )}
    </header>
  );
}
