import Link from "next/link";
import { ArrowRight, Calculator, Landmark, MessageSquare } from "lucide-react";

export default function Home() {
  return (
    <div className="bg-gray-50 text-gray-900 font-sans min-h-screen">
      {/* Hero Section */}
      <section className="mx-auto max-w-5xl px-5 py-24 md:py-32 flex flex-col items-center text-center">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-gray-900 leading-tight max-w-3xl">
          노후 준비와 세액공제를 <br className="sm:hidden" />한 번에 💰
        </h1>
        <p className="mt-6 text-lg md:text-xl text-gray-500 max-w-2xl font-medium leading-relaxed">
          어려운 연금저축과 IRP 세법 규정은 잊으세요. <br className="hidden md:block" />
          내 소득에 딱 맞는 최적의 공제율과 절세 납입 비율을 1분 만에 진단해 드립니다.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-4 w-full sm:w-auto justify-center">
          <Link
            href="/diagnose"
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl px-8 py-4 font-semibold text-lg transition-all shadow-sm active:scale-95"
          >
            <span>내 공제율 계산하기</span>
            <ArrowRight className="w-5 h-5" />
          </Link>
          <Link
            href="/chat"
            className="flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-2xl px-8 py-4 font-semibold text-lg transition-all active:scale-95"
          >
            연말정산 상담소 가기
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-white border-t border-gray-100 py-24 w-full">
        <div className="mx-auto max-w-5xl px-5">
          <div className="text-center md:text-left mb-16">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
              연금세금비서가 도와드릴게요 🤝
            </h2>
            <p className="mt-2 text-gray-500 font-medium">
              더 쉽고 명확하게 연금 세액공제 혜택을 챙겨보세요.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="border border-gray-100 bg-gray-50/50 rounded-3xl p-8 hover:border-gray-200 transition-all flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
                  <Calculator className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  📊 공제율 모의 계산
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed font-medium">
                  현재 소득과 연금 납입 현황을 입력하면, 본인에게 해당되는 세액공제율(13.2% 또는 16.5%)을 정확하게 진단해 드립니다.
                </p>
              </div>
              <Link href="/diagnose" className="mt-8 flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700">
                <span>지금 계산해보기</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Feature 2 */}
            <div className="border border-gray-100 bg-gray-50/50 rounded-3xl p-8 hover:border-gray-200 transition-all flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6">
                  <Landmark className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  💡 맞춤 납입 처방
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed font-medium">
                  연금저축(한도 600만원)과 IRP(합산 900만원)의 복잡한 한도 규정을 계산하여, 환급금을 극대화할 수 있는 최적의 납입 비율을 처방합니다.
                </p>
              </div>
              <Link href="/diagnose" className="mt-8 flex items-center gap-1 text-sm font-semibold text-emerald-600 hover:text-emerald-700">
                <span>처방 가이드 보기</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Feature 3 */}
            <div className="border border-gray-100 bg-gray-50/50 rounded-3xl p-8 hover:border-gray-200 transition-all flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-6">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  💬 1:1 연말정산 상담소
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed font-medium">
                  중도 해지 시 불이익, 연금 수령 시 세금 등 까다로운 국세청 FAQ를 가공해 만든 가이드에 따라 궁금한 질문들을 언제든지 바로 답해 드립니다.
                </p>
              </div>
              <Link href="/chat" className="mt-8 flex items-center gap-1 text-sm font-semibold text-amber-600 hover:text-amber-700">
                <span>상담하러 가기</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
