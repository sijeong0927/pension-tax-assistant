import Link from "next/link";

export default function Footer() {
  return (
    <footer className="w-full border-t border-gray-100 bg-white py-12 text-gray-500">
      <div className="mx-auto max-w-5xl px-5 flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-bold text-gray-800">
            <span>🏦</span>
            <span>연금세금비서</span>
          </div>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/privacy" className="hover:text-gray-900 transition-colors">개인정보처리방침</Link>
            <Link href="/terms" className="hover:text-gray-900 transition-colors">이용약관</Link>
            <Link href="/contact" className="hover:text-gray-900 transition-colors">문의하기</Link>
          </nav>
        </div>

        <div className="text-xs text-gray-400 leading-relaxed flex flex-col gap-2 max-w-3xl">
          <p>
            [안내사항] 본 서비스에서 제공하는 연금저축 및 IRP 세액공제 모의 계산 결과는 입력된 데이터를 기반으로 산출된 단순 참고용 자료입니다. 개개인의 소득 증빙 서류, 추가 공제 항목, 연도별 세법 개정 사양에 따라 실제 결정 세액과는 차이가 발생할 수 있습니다.
          </p>
          <p>
            정확한 연말정산 결정 세액은 매년 1월 국세청 홈택스 연말정산 간소화 서비스 및 관할 세무서를 통해 최종 확인하시기 바랍니다.
          </p>
          <p className="mt-2">
            © {new Date().getFullYear()} 연금세금비서. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
