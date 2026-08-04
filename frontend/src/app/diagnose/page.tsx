'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import Footer from '@/components/Footer';

// ─── Types ───────────────────────────────────────────────────────────────────
type SalaryRange = 'over' | 'under' | null;
type Step = 1 | 2 | 3;
type Direction = 'forward' | 'back';

interface FormData {
  salaryRange: SalaryRange;
  hasPensionSavings: boolean;
  hasIRP: boolean;
}

interface DiagnosisResult {
  income_range: string;
  deduction_rate: number;
  pension_savings_limit: number;
  total_pension_limit: number;
  pension_savings_paid: number;
  irp_paid: number;
  deductible_pension_savings: number;
  deductible_irp: number;
  deductible_amount: number;
  estimated_refund: number;
  remaining_limit: number;
  additional_refund_available: number;
  recommended_additional_allocation: { pension_savings: number; irp: number };
  message: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const formatWon = (n: number) =>
  n === 0 ? '0원' : `${n.toLocaleString('ko-KR')}원`;

const parseWon = (s: string): number => {
  const parsed = parseInt(s.replace(/[^0-9]/g, ''), 10);
  return isNaN(parsed) ? 0 : parsed;
};

const rateLabel = (rate: number) =>
  `${(rate * 100).toFixed(1)}%`;

// ─── Sub-components ──────────────────────────────────────────────────────────

function DiagnoseHeader({
  step,
  total,
  onBack,
  onClose,
}: {
  step: number;
  total: number;
  onBack: () => void;
  onClose: () => void;
}) {
  const progress = ((step - 1) / total) * 100;
  const showProgress = step <= total;

  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-xl"
      style={{
        background: 'rgba(248,249,255,0.85)',
        borderBottom: '1px solid rgba(199,196,216,0.3)',
        boxShadow: '0 1px 8px rgba(0,0,0,0.04)',
      }}
    >
      <div className="max-w-[720px] mx-auto px-5 h-16 flex items-center justify-between gap-3">
        {/* Back / Logo */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
            style={{ color: 'var(--color-on-surface-variant)' }}
            aria-label="뒤로"
          >
            <span className="material-symbols-outlined text-2xl">arrow_back</span>
          </button>
          <div className="flex items-center gap-2">
            <span
              className="material-symbols-outlined text-2xl"
              style={{
                color: 'var(--color-primary)',
                fontVariationSettings: "'FILL' 1, 'wght' 500",
              }}
            >
              local_taxi
            </span>
            <span
              className="font-bold text-lg"
              style={{
                fontFamily: "'Hanken Grotesk', sans-serif",
                color: 'var(--color-primary)',
              }}
            >
              절세택시
            </span>
          </div>
        </div>

        {/* Step badge + close */}
        <div className="flex items-center gap-3">
          {showProgress && (
            <div
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{
                background: 'rgba(229,238,255,0.9)',
                color: 'var(--color-primary)',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '14px' }}
              >
                timelapse
              </span>
              Step {step}/{total}
            </div>
          )}
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
            style={{ color: 'var(--color-on-surface-variant)' }}
            aria-label="닫기"
          >
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {showProgress && (
        <div
          className="h-1 w-full"
          style={{ background: 'rgba(199,196,216,0.3)' }}
        >
          <div
            className="h-full rounded-full relative overflow-hidden transition-all duration-500"
            style={{
              width: `${progress}%`,
              background: 'var(--color-secondary-container)',
            }}
          >
            <div
              className="absolute right-0 top-0 bottom-0 w-6 progress-pulse"
              style={{ background: 'rgba(255,255,255,0.4)' }}
            />
          </div>
        </div>
      )}
    </header>
  );
}

// ── Step 1: 총급여 선택 ────────────────────────────────────────────────────────
function Step1({
  animClass,
  onSelect,
}: {
  animClass: string;
  onSelect: (v: SalaryRange) => void;
}) {
  const [selected, setSelected] = useState<SalaryRange>(null);

  const pick = (v: SalaryRange) => {
    setSelected(v);
    setTimeout(() => onSelect(v), 380);
  };

  return (
    <div className={animClass}>
      {/* Title */}
      <div className="text-center mb-10">
        <h1
          className="font-bold mb-3"
          style={{
            fontFamily: "'Hanken Grotesk', sans-serif",
            fontSize: 'clamp(28px, 5vw, 36px)',
            letterSpacing: '-0.01em',
            color: 'var(--color-on-surface)',
          }}
        >
          당신의 총 급여는?
        </h1>
        <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '17px' }}>
          정확한 세액공제율 계산을 위해 꼭 필요한 정보입니다.
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-xl mx-auto">
        <button
          className={`salary-card${selected === 'over' ? ' selected' : ''}`}
          onClick={() => pick('over')}
        >
          <div className="card-icon">
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: '36px',
                color: 'var(--color-primary)',
                fontVariationSettings: "'FILL' 0",
              }}
            >
              trending_up
            </span>
          </div>
          <div>
            <span
              className="block font-semibold text-xl"
              style={{
                fontFamily: "'Hanken Grotesk', sans-serif",
                color: 'var(--color-on-surface)',
              }}
            >
              5,500만 원 초과
            </span>
            <span
              className="text-sm mt-1 block"
              style={{ color: 'var(--color-on-surface-variant)' }}
            >
              공제율 13.2%
            </span>
          </div>
          {selected === 'over' && (
            <div
              className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: 'var(--color-primary)', color: 'white' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                check
              </span>
            </div>
          )}
        </button>

        <button
          className={`salary-card${selected === 'under' ? ' selected' : ''}`}
          onClick={() => pick('under')}
        >
          <div className="badge">
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '12px' }}
            >
              check_circle
            </span>
            일반적
          </div>
          <div className="card-icon">
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: '36px',
                color: 'var(--color-primary)',
                fontVariationSettings: "'FILL' 0",
              }}
            >
              trending_down
            </span>
          </div>
          <div>
            <span
              className="block font-semibold text-xl"
              style={{
                fontFamily: "'Hanken Grotesk', sans-serif",
                color: 'var(--color-on-surface)',
              }}
            >
              5,500만 원 이하
            </span>
            <span
              className="text-sm mt-1 block"
              style={{ color: 'var(--color-on-surface-variant)' }}
            >
              공제율 16.5%
            </span>
          </div>
          {selected === 'under' && (
            <div
              className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: 'var(--color-primary)', color: 'white' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                check
              </span>
            </div>
          )}
        </button>
      </div>

      {/* Privacy note */}
      <div
        className="mt-8 flex items-center justify-center gap-2 text-xs"
        style={{ color: 'rgba(70,69,85,0.6)' }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
          lock
        </span>
        입력하신 정보는 진단 목적 외에 저장되지 않으며 안전하게 보호됩니다.
      </div>
    </div>
  );
}

// ── Step 2: 계좌 납입액 입력 ──────────────────────────────────────────────────
function Step2({
  animClass,
  formData,
  onUpdate,
  onNext,
}: {
  animClass: string;
  formData: FormData;
  onUpdate: (patch: Partial<FormData>) => void;
  onNext: () => void;
}) {
  return (
    <div className={animClass}>
      {/* Title */}
      <div className="text-center mb-8">
        <h2
          className="font-bold mb-2"
          style={{
            fontFamily: "'Hanken Grotesk', sans-serif",
            fontSize: 'clamp(24px, 4vw, 32px)',
            letterSpacing: '-0.01em',
            color: 'var(--color-on-surface)',
          }}
        >
          연금 납입 현황을 알려주세요
        </h2>
        <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '16px' }}>
          계좌가 없거나 납입하지 않으신 경우 0원으로 진단합니다.
        </p>
      </div>

      {/* Account rows */}
      <div className="flex flex-col gap-4 w-full max-w-xl mx-auto">

        {/* 연금저축 */}
        <div className={`account-row${formData.hasPensionSavings ? ' active' : ''}`}>
          <label className="flex items-center justify-between cursor-pointer gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(79,70,229,0.08)' }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: '20px',
                    color: 'var(--color-primary)',
                    fontVariationSettings: "'FILL' 1",
                  }}
                >
                  savings
                </span>
              </div>
              <div className="min-w-0">
                <p
                  className="font-semibold text-base leading-tight"
                  style={{ color: 'var(--color-on-surface)' }}
                >
                  연금저축
                </p>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: 'var(--color-on-surface-variant)' }}
                >
                  한도 600만 원 / 연
                </p>
              </div>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={formData.hasPensionSavings}
                onChange={(e) => onUpdate({ hasPensionSavings: e.target.checked })}
              />
              <div className="toggle-track" />
              <div className="toggle-thumb" />
            </label>
          </label>
        </div>

        {/* IRP */}
        <div className={`account-row${formData.hasIRP ? ' active' : ''}`}>
          <label className="flex items-center justify-between cursor-pointer gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(0,108,73,0.08)' }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: '20px',
                    color: 'var(--color-secondary)',
                    fontVariationSettings: "'FILL' 1",
                  }}
                >
                  account_balance
                </span>
              </div>
              <div className="min-w-0">
                <p
                  className="font-semibold text-base leading-tight"
                  style={{ color: 'var(--color-on-surface)' }}
                >
                  IRP (개인형 퇴직연금)
                </p>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: 'var(--color-on-surface-variant)' }}
                >
                  연금저축 포함 합산 한도 900만 원 / 연
                </p>
              </div>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={formData.hasIRP}
                onChange={(e) => onUpdate({ hasIRP: e.target.checked })}
              />
              <div className="toggle-track" />
              <div className="toggle-thumb" />
            </label>
          </label>
        </div>

        {/* 아직 없는 경우 안내 */}
        {!formData.hasPensionSavings && !formData.hasIRP && (
          <p
            className="text-xs text-center py-2"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            계좌가 없으신 경우에도 진단 가능합니다. 추천 납입 비율을 알려드려요.
          </p>
        )}
      </div>

      {/* CTA */}
      <div className="w-full max-w-xl mx-auto mt-8">
        <button className="cta-btn" onClick={onNext}>
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
            search
          </span>
          세액공제 효과 진단하기
        </button>
      </div>
    </div>
  );
}

// ── Step 3: 결과 리포트 ──────────────────────────────────────────────────────
function Step3({
  animClass,
  result,
  onReset,
}: {
  animClass: string;
  result: DiagnosisResult;
  onReset: () => void;
}) {
  const rate = result.deduction_rate;
  const ratePercent = rateLabel(rate);
  const isHighRate = rate > 0.14;

  return (
    <div className={animClass}>
      {/* Headline */}
      <div className="text-center mb-8">
        <h2
          className="font-bold"
          style={{
            fontFamily: "'Hanken Grotesk', sans-serif",
            fontSize: 'clamp(24px, 4vw, 30px)',
            letterSpacing: '-0.01em',
            color: 'var(--color-on-surface)',
          }}
        >
          절세택시 도착! 진단 결과예요 🚕
        </h2>
      </div>

      <div className="flex flex-col gap-5 w-full max-w-xl mx-auto">

        {/* 핵심 환급 카드 */}
        <div className="result-highlight">
          <div className="result-badge">
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}
            >
              local_taxi
            </span>
            {isHighRate ? '우대 공제율 적용' : '기본 공제율 적용'}
          </div>
          <p className="text-sm font-medium opacity-80 mb-1">적용 세액공제율</p>
          <p
            className="font-bold"
            style={{
              fontFamily: "'Hanken Grotesk', sans-serif",
              fontSize: '56px',
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
            }}
          >
            {ratePercent}
          </p>
          <div
            className="mt-4 pt-4"
            style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }}
          >
            <p className="text-sm opacity-75 mb-1">예상 세액공제 효과</p>
            <p
              className="font-bold"
              style={{
                fontFamily: "'Hanken Grotesk', sans-serif",
                fontSize: '28px',
                letterSpacing: '-0.02em',
              }}
            >
              {formatWon(result.estimated_refund)}
            </p>
          </div>
        </div>

        {/* 상세 내역 */}
        <div className="result-card">
          <p
            className="font-semibold text-sm mb-3"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            납입 상세
          </p>
          <div className="result-metric">
            <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '14px' }}>
              공제 대상 연금저축
            </span>
            <span
              className="font-semibold"
              style={{ color: 'var(--color-on-surface)', fontSize: '15px' }}
            >
              {formatWon(result.deductible_pension_savings)}
            </span>
          </div>
          <div className="result-metric">
            <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '14px' }}>
              공제 대상 IRP
            </span>
            <span
              className="font-semibold"
              style={{ color: 'var(--color-on-surface)', fontSize: '15px' }}
            >
              {formatWon(result.deductible_irp)}
            </span>
          </div>
          <div className="result-metric">
            <span
              className="font-bold"
              style={{ color: 'var(--color-on-surface)', fontSize: '14px' }}
            >
              총 공제 대상 납입액
            </span>
            <span
              className="font-bold"
              style={{ color: 'var(--color-primary)', fontSize: '16px' }}
            >
              {formatWon(result.deductible_amount)}
            </span>
          </div>
        </div>

        {/* 추가 납입 여력 */}
        {result.remaining_limit > 0 && (
          <div
            className="result-card"
            style={{
              borderColor: 'rgba(108,248,187,0.4)',
              background: 'rgba(108,248,187,0.04)',
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: 'rgba(0,108,73,0.1)' }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: '18px',
                    color: 'var(--color-secondary)',
                    fontVariationSettings: "'FILL' 1",
                  }}
                >
                  tips_and_updates
                </span>
              </div>
              <div>
                <p
                  className="font-semibold text-sm"
                  style={{ color: 'var(--color-secondary)' }}
                >
                  추가 납입 여력이 있어요!
                </p>
                <p
                  className="text-sm mt-1"
                  style={{ color: 'var(--color-on-surface-variant)' }}
                >
                  {formatWon(result.remaining_limit)} 더 납입하면{' '}
                  <strong style={{ color: 'var(--color-on-surface)' }}>
                    {formatWon(result.additional_refund_available)}
                  </strong>{' '}
                  추가 공제 가능합니다.
                </p>
                {(result.recommended_additional_allocation.pension_savings > 0 ||
                  result.recommended_additional_allocation.irp > 0) && (
                  <div
                    className="mt-3 pt-3 flex gap-4 text-xs"
                    style={{ borderTop: '1px solid rgba(0,108,73,0.12)' }}
                  >
                    {result.recommended_additional_allocation.pension_savings > 0 && (
                      <div>
                        <p style={{ color: 'var(--color-on-surface-variant)' }}>추천 연금저축</p>
                        <p
                          className="font-bold"
                          style={{ color: 'var(--color-secondary)', fontSize: '15px' }}
                        >
                          {formatWon(result.recommended_additional_allocation.pension_savings)}
                        </p>
                      </div>
                    )}
                    {result.recommended_additional_allocation.irp > 0 && (
                      <div>
                        <p style={{ color: 'var(--color-on-surface-variant)' }}>추천 IRP</p>
                        <p
                          className="font-bold"
                          style={{ color: 'var(--color-secondary)', fontSize: '15px' }}
                        >
                          {formatWon(result.recommended_additional_allocation.irp)}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 면책 */}
        <p
          className="text-center text-xs"
          style={{ color: 'rgba(70,69,85,0.55)', lineHeight: 1.6 }}
        >
          본 결과는 입력 정보 기반 단순 참고용이며, 실제 결정 세액은 다를 수 있습니다.
        </p>

        {/* CTA buttons */}
        <Link
          href="/chat"
          className="cta-btn"
          style={{ textDecoration: 'none', justifyContent: 'center' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
            smart_toy
          </span>
          AI 기사님과 세부 상담하기
        </Link>
        <button className="cta-btn cta-btn--secondary" onClick={onReset}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            refresh
          </span>
          다시 진단하기
        </button>
      </div>
    </div>
  );
}

// ─── Loading Screen ──────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-20 step-enter">
      <div className="spinner" />
      <div className="text-center">
        <p
          className="font-semibold text-lg"
          style={{ fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--color-on-surface)' }}
        >
          절세 경로 탐색 중…
        </p>
        <p className="text-sm mt-1" style={{ color: 'var(--color-on-surface-variant)' }}>
          최적의 세액공제 경로를 계산하고 있어요.
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
const TOTAL_STEPS = 2; // step 1, step 2 (step 3 is result, not counted in progress)

const initialForm: FormData = {
  salaryRange: null,
  hasPensionSavings: false,
  hasIRP: false,
};

export default function DiagnosePage() {
  const [step, setStep] = useState<Step>(1);
  const [direction, setDirection] = useState<Direction>('forward');
  const [formData, setFormData] = useState<FormData>(initialForm);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const animClass =
    direction === 'forward' ? 'step-enter' : 'step-back';

  const goForward = useCallback((nextStep: Step) => {
    setDirection('forward');
    setStep(nextStep);
  }, []);

  const goBack = useCallback(() => {
    setDirection('back');
    if (step === 3) { setStep(2); return; }
    if (step === 2) { setStep(1); return; }
    // step 1 → back to home (handled by close button)
  }, [step]);

  const handleClose = useCallback(() => {
    window.location.href = '/';
  }, []);

  const handleSalarySelect = useCallback(
    (range: SalaryRange) => {
      setFormData((f) => ({ ...f, salaryRange: range }));
      goForward(2);
    },
    [goForward],
  );

  const handleFormUpdate = useCallback((patch: Partial<FormData>) => {
    setFormData((f) => ({ ...f, ...patch }));
  }, []);

  const handleDiagnose = useCallback(async () => {
    if (!formData.salaryRange) return;

    const totalSalary = formData.salaryRange === 'over' ? 70_000_000 : 40_000_000;
    // 계좌 보유 시 한도액 기준으로 최대 세액공제 효과 계산
    const pensionSavings = formData.hasPensionSavings ? 6_000_000 : 0;
    const irp = formData.hasIRP ? 3_000_000 : 0;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('http://localhost:8000/api/v1/tax/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ total_salary: totalSalary, pension_savings: pensionSavings, irp }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || '서버 오류가 발생했습니다.');
      }

      const json = await res.json();
      setResult(json.data);
      setDirection('forward');
      setStep(3);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [formData]);

  const handleReset = useCallback(() => {
    setFormData(initialForm);
    setResult(null);
    setError(null);
    setDirection('back');
    setStep(1);
  }, []);

  const progressStep = step === 3 ? TOTAL_STEPS + 1 : step;

  return (
    <>
      <DiagnoseHeader
        step={progressStep}
        total={TOTAL_STEPS}
        onBack={step === 1 ? handleClose : goBack}
        onClose={handleClose}
      />

      <main className="flex-grow flex flex-col items-center justify-center px-5 py-12">
        <div className="w-full max-w-2xl">
          {loading ? (
            <LoadingScreen />
          ) : error ? (
            <div className="step-enter text-center py-16">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(186,26,26,0.08)' }}
              >
                <span
                  className="material-symbols-outlined text-4xl"
                  style={{ color: '#ba1a1a' }}
                >
                  error
                </span>
              </div>
              <p
                className="font-semibold text-lg mb-2"
                style={{ color: 'var(--color-on-surface)' }}
              >
                오류가 발생했습니다
              </p>
              <p
                className="text-sm mb-6"
                style={{ color: 'var(--color-on-surface-variant)' }}
              >
                {error}
              </p>
              <button className="cta-btn" style={{ maxWidth: '200px', margin: '0 auto' }} onClick={() => setError(null)}>
                다시 시도하기
              </button>
            </div>
          ) : step === 1 ? (
            <Step1 animClass={animClass} onSelect={handleSalarySelect} />
          ) : step === 2 ? (
            <Step2
              animClass={animClass}
              formData={formData}
              onUpdate={handleFormUpdate}
              onNext={handleDiagnose}
            />
          ) : result ? (
            <Step3 animClass={animClass} result={result} onReset={handleReset} />
          ) : null}
        </div>
      </main>

      <Footer />
    </>
  );
}
