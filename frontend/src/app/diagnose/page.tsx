'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Footer from '@/components/Footer';
import { isAuthenticated } from '@/lib/auth';
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
  // 초기값: API 결과 기반
  const [salary, setSalary] = useState<number>(
    initialSalaryRange === 'over' ? 70_000_000 : 40_000_000,
  );
  const [pension, setPension] = useState<number>(result.pension_savings_paid);
  const [irp, setIrp] = useState<number>(result.irp_paid);
  const [sim, setSim] = useState<DiagnosisResult>(result);
  const [simError, setSimError] = useState<string | null>(null);
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const router = useRouter();

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
        income_range: sim.income_range, // Save the latest simulated result
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
  const recommendedAdditional =
    sim.recommended_additional_allocation.pension_savings +
    sim.recommended_additional_allocation.irp;

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch('http://localhost:8000/api/v1/tax/diagnose', {
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
    setPension(v);
    const nextIrp = clampIrpToCombinedLimit(v, irp);
    if (irp !== nextIrp) setIrp(nextIrp);
  };

  const handleIrpChange = (v: number) => {
    setIrp(clampIrpToCombinedLimit(pension, v));
  };

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
          절세택시 도착! 진단 결과예요 🚕
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--color-on-surface-variant)' }}>
          슬라이더로 조건을 바꾸면 결과가 실시간으로 바뀌어요
        </p>
      </div>

      <div className="flex flex-col gap-5 w-full max-w-xl mx-auto">

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
            min={0}
            max={SALARY_MAX}
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

        {/* ── 핵심 세액공제 효과 카드 (슬라이더 연동) ── */}
        <div className="result-highlight">
          <div className="result-badge">
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}
            >
              local_taxi
            </span>
            {isNoBenefit
              ? '세액공제 실현 가능성 안내'
              : isHighRate
                ? '우대 공제율 16.5% 적용'
                : '기본 공제율 13.2% 적용'}
          </div>
          {isNoBenefit ? (
            <p className="text-lg font-bold leading-relaxed">
              현재 소득 기준으로는 세액공제 실현 가능성이 낮습니다
            </p>
          ) : (
            <>
              <p className="text-sm font-medium opacity-80 mb-1">적용 세액공제율</p>
              <p
                className="font-bold"
                style={{
                  fontFamily: "'Hanken Grotesk', sans-serif",
                  fontSize: '56px',
                  lineHeight: 1.1,
                  letterSpacing: '-0.03em',
                  transition: 'all 0.2s ease',
                }}
              >
                {(sim.deduction_rate * 100).toFixed(1)}%
              </p>
              <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                <p className="text-sm opacity-75 mb-1">예상 세액 공제 효과</p>
                <p
                  className="font-bold"
                  style={{
                    fontFamily: "'Hanken Grotesk', sans-serif",
                    fontSize: '28px',
                    letterSpacing: '-0.02em',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {formatWon(sim.estimated_refund)}
                </p>
              </div>
            </>
          )}
        </div>

        {/* ── 납입 상세 (슬라이더 연동) ── */}
        <div className="result-card">
          <p className="font-semibold text-sm mb-3" style={{ color: 'var(--color-on-surface-variant)' }}>
            납입 상세
          </p>
          <div className="result-metric">
            <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '14px' }}>
              공제 대상 연금저축
            </span>
            <span className="font-semibold" style={{ color: 'var(--color-on-surface)', fontSize: '15px' }}>
              {formatWon(sim.deductible_pension_savings)}
            </span>
          </div>
          <div className="result-metric">
            <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '14px' }}>
              공제 대상 IRP
            </span>
            <span className="font-semibold" style={{ color: 'var(--color-on-surface)', fontSize: '15px' }}>
              {formatWon(sim.deductible_irp)}
            </span>
          </div>
          <div className="result-metric">
            <span className="font-bold" style={{ color: 'var(--color-on-surface)', fontSize: '14px' }}>
              총 공제 대상 납입액
            </span>
            <span className="font-bold" style={{ color: 'var(--color-primary)', fontSize: '16px' }}>
              {formatWon(sim.deductible_amount)}
            </span>
          </div>
        </div>

        {/* ── 추가 납입 여력 ── */}
        {sim.additional_refund_available > 0 && (
          <div
            className="result-card"
            style={{ borderColor: 'rgba(108,248,187,0.4)', background: 'rgba(108,248,187,0.04)' }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: 'rgba(0,108,73,0.1)' }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '18px', color: 'var(--color-secondary)', fontVariationSettings: "'FILL' 1" }}
                >
                  tips_and_updates
                </span>
              </div>
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--color-secondary)' }}>
                  추가 납입 여력이 있어요!
                </p>
                <p className="text-sm mt-1" style={{ color: 'var(--color-on-surface-variant)' }}>
                  {formatWon(recommendedAdditional)} 더 납입하면{' '}
                  <strong style={{ color: 'var(--color-on-surface)' }}>
                    {formatWon(sim.additional_refund_available)}
                  </strong>{' '}
                  예상 세액 공제 효과가 추가됩니다.
                </p>
              </div>
            </div>
          </div>
        )}

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
        <button
          onClick={handleSave}
          disabled={isSaving || saveSuccess}
          className="cta-btn flex justify-center mb-3"
          style={{
            background: saveSuccess ? 'var(--color-secondary)' : 'var(--color-primary)',
            color: 'white',
            boxShadow: '0 4px 12px rgba(53,37,205,0.2)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            {saveSuccess ? 'check_circle' : 'save'}
          </span>
          {saveSuccess ? '저장 완료!' : isSaving ? '저장 중...' : '결과 저장하기'}
        </button>

        <Link
          href="/chat"
          className="cta-btn mb-3"
          style={{ textDecoration: 'none', justifyContent: 'center', background: 'var(--color-surface)', color: 'var(--color-on-surface)', border: '1px solid rgba(199,196,216,0.5)' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>smart_toy</span>
          AI 기사님과 세부 상담하기
        </Link>
        <button className="cta-btn cta-btn--secondary" onClick={onReset}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>refresh</span>
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
