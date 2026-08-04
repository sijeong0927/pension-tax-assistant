'use client';

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-100 bg-white/80 backdrop-blur-md">
      <div className="mx-auto max-w-5xl px-5 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-lg text-gray-900 tracking-tight hover:opacity-80 transition-opacity">
          <span>🏦</span>
          <span>연금세금비서</span>
        </Link>

        {/* Desktop Menu */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-gray-600">
          <Link href="/diagnose" className="hover:text-blue-600 transition-colors">공제율 진단</Link>
          <Link href="/chat" className="hover:text-blue-600 transition-colors">연말정산 상담소</Link>
          <Link href="/faq" className="hover:text-blue-600 transition-colors">이용 안내</Link>
        </nav>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden p-1 text-gray-500 hover:text-gray-900 transition-colors"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="메뉴 열기"
        >
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <div className="md:hidden border-b border-gray-100 bg-white px-5 py-4 flex flex-col gap-4 text-sm font-semibold text-gray-600">
          <Link
            href="/diagnose"
            className="py-2 hover:text-blue-600 transition-colors"
            onClick={() => setIsOpen(false)}
          >
            공제율 진단
          </Link>
          <Link
            href="/chat"
            className="py-2 hover:text-blue-600 transition-colors"
            onClick={() => setIsOpen(false)}
          >
            연말정산 상담소
          </Link>
          <Link
            href="/faq"
            className="py-2 hover:text-blue-600 transition-colors"
            onClick={() => setIsOpen(false)}
          >
            이용 안내
          </Link>
        </div>
      )}
    </header>
  );
}
