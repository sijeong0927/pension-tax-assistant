'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Footer from '@/components/Footer';
import { isAuthenticated } from '@/lib/auth';
import { getApiBaseUrl } from '@/lib/config';
import {
  PENSION_SAVINGS_MAX,
  PENSION_STEP,
  SALARY_MAX,
  SALARY_STEP,
  SALARY_THRESHOLD,
  TOTAL_PENSION_ACCOUNT_MAX,
  clampIrpToCombinedLimit,
  getSliderFillPercent,
} from '@/lib/diagnoseSimulator';

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
  gross_tax_credit: number;
  estimated_tax_liability: number;
  estimated_refund: number;
  remaining_limit: number;
  additional_refund_available: number;
  recommended_additional_allocation: { pension_savings: number; irp: number };
  message: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const formatWon = (n: number) =>
  n === 0 ? '0원' : `${n.toLocaleString('ko-KR')}원`;

// ─── Custom Hook: Count-Up Animation ──────────────────────────────────────────
function useCountUp(target: number, duration: number = 550) {
  const [count, setCount] = useState(target);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const startValue = count;
    const endValue = target;

    if (startValue === endValue) return;

    let animationFrameId: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // Ease-out cubic
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startValue + (endValue - startValue) * easeProgress);

      setCount(current);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      }
    };

    animationFrameId = requestAnimationFrame(step);

    return () => cancelAnimationFrame(animationFrameId);
  }, [target, duration]);

  return count;
}


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
        <div className={`account-row transition-all duration-300 ${formData.hasPensionSavings ? 'border-indigo-600 shadow-md' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between gap-4">
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
            
            <div className="flex bg-gray-100/80 rounded-full p-1 border border-gray-200/60 shadow-inner shrink-0">
              <button
                type="button"
                onClick={() => onUpdate({ hasPensionSavings: false })}
                className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
                  !formData.hasPensionSavings
                    ? 'bg-white text-gray-800 shadow-sm ring-1 ring-gray-200/50'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                없음
              </button>
              <button
                type="button"
                onClick={() => onUpdate({ hasPensionSavings: true })}
                className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
                  formData.hasPensionSavings
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                있음
              </button>
            </div>
          </div>
        </div>

        {/* IRP */}
        <div className={`account-row transition-all duration-300 ${formData.hasIRP ? 'border-indigo-600 shadow-md' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between gap-4">
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
            
            <div className="flex bg-gray-100/80 rounded-full p-1 border border-gray-200/60 shadow-inner shrink-0">
              <button
                type="button"
                onClick={() => onUpdate({ hasIRP: false })}
                className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
                  !formData.hasIRP
                    ? 'bg-white text-gray-800 shadow-sm ring-1 ring-gray-200/50'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                없음
              </button>
              <button
                type="button"
                onClick={() => onUpdate({ hasIRP: true })}
                className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
                  formData.hasIRP
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                있음
              </button>
            </div>
          </div>
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

// ── Step 3: 결과 리포트 + 시뮬레이터 ─────────────────────────────────────────
function SimSlider({
  label,
  value,
  min,
  max,
  step,
  colorClass,
  onChange,
  formatVal,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  colorClass?: string;
  onChange: (v: number) => void;
  formatVal: (v: number) => string;
  hint?: string;
}) {
  return (
    <div className="sim-slider-row">
      <div className="sim-slider-labels">
        <span className="text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>
          {label}
        </span>
        <span
          className="text-sm font-bold tabular-nums"
          style={{ color: colorClass ? 'var(--color-secondary)' : 'var(--color-primary)' }}
        >
          {formatVal(value)}
        </span>
      </div>
      <input
        type="range"
        className={`sim-range${colorClass ? ` sim-range--${colorClass}` : ''}`}
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--fill': getSliderFillPercent(value, min, max) } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="flex justify-between text-xs" style={{ color: 'rgba(70,69,85,0.45)' }}>
        <span>{formatVal(min)}</span>
        {hint && <span style={{ color: 'rgba(70,69,85,0.6)' }}>{hint}</span>}
        <span>{formatVal(max)}</span>
      </div>
    </div>
  );
}

function Step3({
  animClass,
  result,
  initialSalaryRange,
  onReset,
}: {
  animClass: string;
  result: DiagnosisResult;
  initialSalaryRange: SalaryRange;
  onReset: () => void;
}) {
  // 연봉 구간 선택에 따른 슬라이더 min, max 지정
  const isOver55 = initialSalaryRange === 'over';
  const minSalary = isOver55 ? 55_000_000 : 0;
  const maxSalary = isOver55 ? SALARY_MAX : 55_000_000;

  // 초기값: 가장 왼쪽 (최솟값 minSalary)으로 세팅
  const [salary, setSalary] = useState<number>(minSalary);
  const [pension, setPension] = useState<number>(result.pension_savings_paid);
  const [irp, setIrp] = useState<number>(result.irp_paid);
  const [sim, setSim] = useState<DiagnosisResult>(result);
  const [simError, setSimError] = useState<string | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<number | null>(null);
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const router = useRouter();

  // ── 1. Count-up Animation ──
  const animatedRefund = useCountUp(sim.estimated_refund);
  const animatedDeductible = useCountUp(sim.deductible_amount);

  // ── 3. Max Limit (900만원) Detection ──
  const isMaxLimit = sim.deductible_amount >= 9_000_000;

  const handleSave = async () => {
    if (!isAuthenticated()) {
      router.push('/login?redirect=/diagnose');
      return;
    }

    setIsSaving(true);
    try {
      const SESSION_STORAGE_KEY = 'taxi_chat_session_id';
      let sessionId = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (!sessionId) {
        sessionId = `session_${Date.now()}`;
        window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
      }
      
      const { saveTaxSavings } = await import('@/lib/api');
      const success = await saveTaxSavings({
        session_id: sessionId,
        income_range: sim.income_range,
        total_salary: salary,
        pension_savings_paid: sim.pension_savings_paid,
        irp_paid: sim.irp_paid,
        deductible_pension_savings: sim.deductible_pension_savings,
        deductible_irp: sim.deductible_irp,
        deductible_amount: sim.deductible_amount,
        gross_tax_credit: sim.gross_tax_credit,
        estimated_refund: sim.estimated_refund
      });
      if (success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert('저장에 실패했습니다.');
      }
    } catch (e) {
      alert('오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const isNoBenefit = sim.income_range === 'no_benefit';
  const isHighRate = sim.deduction_rate > 0.14;

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/v1/tax/diagnose`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            total_salary: salary,
            pension_savings: pension,
            irp,
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('계산 결과를 불러오지 못했습니다.');
        const json = await response.json();
        setSim(json.data);
        setSimError(null);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setSimError(error instanceof Error ? error.message : '계산 중 오류가 발생했습니다.');
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [salary, pension, irp]);

  const handlePensionChange = (v: number) => {
    setSelectedGoal(null);
    setPension(v);
    const nextIrp = clampIrpToCombinedLimit(v, irp);
    if (irp !== nextIrp) setIrp(nextIrp);
  };

  const handleIrpChange = (v: number) => {
    setSelectedGoal(null);
    setIrp(clampIrpToCombinedLimit(pension, v));
  };

  // ── 2. Limit & Rate Fill Percentages ──
  const totalLimitPercent = Math.min((sim.deductible_amount / 9_000_000) * 100, 100);
  const rateGaugePercent = Math.min((sim.deduction_rate / 0.165) * 100, 100);

  return (
    <div className={animClass}>
      {/* Headline */}
      <div className="text-center mb-6">
        <h2
          className="font-bold"
          style={{
            fontFamily: "'Hanken Grotesk', sans-serif",
            fontSize: 'clamp(22px, 4vw, 28px)',
            letterSpacing: '-0.01em',
            color: 'var(--color-on-surface)',
          }}
        >
          절세택시 미터기 동작 중! 실시간 절세 진단 🚕
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--color-on-surface-variant)' }}>
          슬라이더를 움직여 나의 올해 목표 납입액과 예상 환급액을 맞춰보세요.
        </p>
      </div>

      <div className="flex flex-col gap-5 w-full max-w-xl mx-auto">

        {/* ── 목표별 최적 절세 가이드 ── */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl p-5 border border-indigo-100 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full mix-blend-multiply blur-2xl opacity-60 pointer-events-none translate-x-1/3 -translate-y-1/3"></div>
          
          <div className="flex items-center gap-2 mb-4 relative z-10">
            <span className="material-symbols-outlined text-indigo-600" style={{ fontVariationSettings: "'FILL' 1" }}>
              target
            </span>
            <h3 className="font-bold text-gray-800">목표 납입액을 선택해보세요</h3>
          </div>
          
          <div className="relative z-10">
            <select
              value={selectedGoal || ""}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (val) {
                  setSelectedGoal(val);
                  setPension(Math.min(val, 6_000_000));
                  setIrp(Math.max(0, val - 6_000_000));
                } else {
                  setSelectedGoal(null);
                  setPension(0);
                  setIrp(0);
                }
              }}
              className="w-full appearance-none bg-white/90 border border-indigo-200 text-gray-800 font-semibold text-[15px] py-3.5 px-4 pr-10 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm transition-all cursor-pointer hover:bg-white"
            >
              <option value="" disabled>원하는 목표 납입액을 선택하세요</option>
              {Array.from({ length: 9 }, (_, i) => (i + 1) * 100_0000).map(amt => (
                <option key={amt} value={amt}>
                  연 {amt / 10000}만 원 (월 약 {Math.round(amt / 10000 / 12)}만 원)
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-indigo-500">
              <span className="material-symbols-outlined text-[20px]">expand_more</span>
            </div>
          </div>

          {selectedGoal && (
            <div className="mt-3 p-3 bg-indigo-50/80 rounded-xl border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 relative z-10 animate-in fade-in slide-in-from-top-1">
              <span className="text-[13px] font-semibold text-indigo-800 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">tips_and_updates</span>
                최적의 계좌 배분
              </span>
              <div className="flex items-center gap-1.5 text-[14px] font-bold text-indigo-600 bg-white px-3 py-1.5 rounded-lg border border-indigo-100 shadow-sm">
                <span className="material-symbols-outlined text-[16px]">
                  {selectedGoal > 6_000_000 ? 'account_balance' : 'savings'}
                </span>
                {selectedGoal > 6_000_000 
                  ? `연금저축 600만 원 + IRP ${(selectedGoal - 6_000_000) / 10000}만 원`
                  : `연금저축 ${selectedGoal / 10000}만 원`}
              </div>
            </div>
          )}
          <p className="text-xs text-gray-500 mt-4 text-center">
            목표를 선택하면 아래 슬라이더에 추천 금액이 바로 세팅됩니다!
          </p>
        </div>

        {/* ── 시뮬레이터 패널 ── */}
        <div className="sim-panel">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="material-symbols-outlined text-lg"
              style={{ color: 'var(--color-primary)', fontVariationSettings: "'FILL' 1" }}
            >
              tune
            </span>
            <p
              className="font-semibold text-sm"
              style={{ color: 'var(--color-primary)' }}
            >
              조건 시뮬레이터
            </p>
          </div>

          <SimSlider
            label="총급여"
            value={salary}
            min={minSalary}
            max={maxSalary}
            step={SALARY_STEP}
            onChange={setSalary}
            formatVal={(v) => `${(v / 10_000).toLocaleString('ko-KR')}만원`}
            hint={
              salary <= 15_000_000
                ? '결정세액이 적어 세액공제 실익이 없습니다'
                : salary <= SALARY_THRESHOLD
                  ? '우대 공제율 16.5%'
                  : '기본 공제율 13.2%'
            }
          />
          <SimSlider
            label="연금저축 납입액"
            value={pension}
            min={0}
            max={PENSION_SAVINGS_MAX}
            step={PENSION_STEP}
            onChange={handlePensionChange}
            formatVal={formatWon}
          />
          <p className="text-xs leading-relaxed" style={{ color: 'rgba(70,69,85,0.62)' }}>
            세액공제 인정 한도 600만원 (초과분은 공제 대상 아님)
          </p>
          <SimSlider
            label="IRP(퇴직연금) 납입액"
            value={irp}
            min={0}
            max={TOTAL_PENSION_ACCOUNT_MAX}
            step={PENSION_STEP}
            colorClass="secondary"
            onChange={handleIrpChange}
            formatVal={formatWon}
          />
          <div className="text-xs leading-relaxed" style={{ color: 'rgba(70,69,85,0.62)' }}>
            <p>IRP만 보유 시 최대 900만원까지 인정</p>
            <p>연금저축과 함께 보유 시, 합산 900만원 한도 내에서 연금저축은 최대 600만원까지만 인정됩니다</p>
          </div>
        </div>

        {/* ── 4. Hero 카드 Soft Glow & Breathing Pulse (+ 3. Sparkle & Pop 효과) ── */}
        <div
          className="relative overflow-hidden rounded-3xl p-8 text-white hero-pulse-glow transition-all duration-300"
          style={{
            background: 'linear-gradient(135deg, #3730A3 0%, #4F46E5 50%, #7C3AED 100%)',
            boxShadow: '0 0 35px rgba(99, 102, 241, 0.18), 0 12px 36px rgba(79, 70, 229, 0.25)',
          }}
        >
          {/* Subtle glow/pattern behind */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-white opacity-10 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-indigo-300 opacity-20 rounded-full blur-3xl"></div>
          
          <div className="relative z-10">
            <div className="flex items-center justify-between gap-2 mb-6">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[13px] font-semibold shadow-sm border border-white/10">
                <span className="material-symbols-outlined text-[16px]">local_taxi</span>
                {isNoBenefit ? '세액공제 실현 가능성 안내' : isHighRate ? '우대 공제율 16.5% 적용' : '기본 공제율 13.2% 적용'}
              </div>

              {/* ── 3. Sparkle Pop Badge (900만원 달성 시) ── */}
              {isMaxLimit && (
                <div className="sparkle-pop-anim inline-flex items-center gap-1.5 px-3 py-1 bg-amber-400 text-indigo-950 rounded-full text-[12px] font-extrabold shadow-md border border-amber-300">
                  <span>✨ 최대 한도 달성!</span>
                </div>
              )}
            </div>
            
            {isNoBenefit ? (
              <p className="text-xl font-bold leading-relaxed pb-4">
                현재 소득 기준으로는<br/>세액공제 실현 가능성이 낮습니다
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-indigo-100 drop-shadow-sm flex items-center gap-1.5">
                  예상 세액 공제 효과
                  {isMaxLimit && <span className="text-amber-300 text-xs">🎉 최대 환급액 달성</span>}
                </p>
                
                {/* ── 1. Count-up Animated Refund Number ── */}
                <p className="font-extrabold text-[42px] leading-tight tracking-tight drop-shadow-md">
                  {formatWon(animatedRefund)}
                </p>
                
                {/* ── 2. Visual Indicator (세액공제율 / 한도 충전 게이지 바) ── */}
                <div className="mt-6 pt-5 border-t border-white/20 space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-indigo-100">총 납입 한도 충전율 (900만원)</span>
                    <span className="text-white font-bold">{totalLimitPercent.toFixed(0)}%</span>
                  </div>
                  {/* Gauge Bar */}
                  <div className="w-full bg-white/20 rounded-full h-2.5 overflow-hidden p-0.5 backdrop-blur-sm">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ease-out ${
                        isMaxLimit ? 'bg-gradient-to-r from-amber-300 to-yellow-400 shadow-sm' : 'bg-gradient-to-r from-emerald-400 to-teal-300'
                      }`}
                      style={{ width: `${totalLimitPercent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-indigo-200">적용 공제율 게이지</span>
                    <span className="font-bold text-sm bg-white/20 px-2.5 py-0.5 rounded-lg backdrop-blur-md">
                      {(sim.deduction_rate * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── 납입 상세 (슬라이더 연동) ── */}
        <div className="bg-white/80 backdrop-blur-md rounded-3xl p-6 border border-gray-100 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-5 flex items-center gap-2">
            <span className="material-symbols-outlined text-indigo-500">analytics</span>
            납입 상세 내역
          </h3>
          
          <div className="space-y-4">
            {/* 연금저축 */}
            <div>
              <div className="flex justify-between text-[13px] mb-2">
                <span className="text-gray-600 font-medium">연금저축 (공제대상)</span>
                <span className="font-bold text-gray-900">{formatWon(sim.deductible_pension_savings)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div className="bg-indigo-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${Math.min((sim.deductible_pension_savings / 6000000) * 100, 100)}%` }}></div>
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5 text-right font-medium">한도 600만 원</p>
            </div>
            
            {/* IRP */}
            <div>
              <div className="flex justify-between text-[13px] mb-2">
                <span className="text-gray-600 font-medium">IRP (공제대상)</span>
                <span className="font-bold text-gray-900">{formatWon(sim.deductible_irp)}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${Math.min((sim.deductible_irp / 9000000) * 100, 100)}%` }}></div>
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5 text-right font-medium">합산 한도 900만 원</p>
            </div>
          </div>
          
          <div className="mt-6 pt-5 border-t border-gray-100/80 flex justify-between items-center">
            <span className="font-bold text-gray-700">총 공제 대상 납입액</span>
            <span className="font-extrabold text-indigo-600 text-[18px] tracking-tight">{formatWon(sim.deductible_amount)}</span>
          </div>
        </div>


        {simError && (
          <p className="text-center text-sm" style={{ color: '#ba1a1a' }}>
            {simError}
          </p>
        )}

        {/* 면책 */}
        <p
          className="text-center text-xs"
          style={{ color: 'rgba(70,69,85,0.55)', lineHeight: 1.6 }}
        >
          본 결과는 입력 정보 기반 단순 참고용이며, 실제 결정 세액은 다를 수 있습니다.
        </p>

        {/* CTA buttons */}
        <div className="mt-6 space-y-3 pb-8">
          <Link
            href="/chat"
            className="w-full flex items-center justify-center gap-2 py-4 px-6 rounded-2xl font-bold text-white transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-indigo-200"
            style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)' }}
          >
            <span className="material-symbols-outlined text-[20px]">smart_toy</span>
            AI 기사님과 세부 상담하기
          </Link>

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={isSaving || saveSuccess}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl font-semibold transition-all border-2 ${
                saveSuccess 
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-600'
                  : 'bg-white border-indigo-100 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 shadow-sm'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {saveSuccess ? 'check_circle' : 'save'}
              </span>
              {saveSuccess ? '저장 완료!' : isSaving ? '저장 중...' : '결과 저장하기'}
            </button>
            <button 
              onClick={onReset}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl font-semibold bg-gray-50 text-gray-600 border-2 border-transparent hover:bg-gray-100 transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
              다시 진단하기
            </button>
          </div>
        </div>
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
          예상 세액 공제 효과를 계산하고 있어요.
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
  const router = useRouter();
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
    router.push('/');
  }, [router]);

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
    // 계좌 보유 시 한도액 기준으로 최대 예상 세액 공제 효과 계산
    const pensionSavings = formData.hasPensionSavings ? 6_000_000 : 0;
    const irp = formData.hasIRP ? 3_000_000 : 0;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/tax/diagnose`, {
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
            <Step3
              animClass={animClass}
              result={result}
              initialSalaryRange={formData.salaryRange}
              onReset={handleReset}
            />
          ) : null}
        </div>
      </main>

      <Footer />
    </>
  );
}
