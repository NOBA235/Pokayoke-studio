import { BookOpen, Lock, ShieldAlert, Wrench } from 'lucide-react';
import { StepVerificationResult } from '../types/cartridge';

export interface MistakeLockOverlayProps {
  result: StepVerificationResult;
  onAcknowledgeToFix: () => void;
}

export function MistakeLockOverlay({
  result,
  onAcknowledgeToFix
}: MistakeLockOverlayProps) {
  const mistake = result.matchedMistake;
  const citationQuote = mistake?.sourceQuote || result.verbatimCitation.verbatimQuote;

  return (
    <div
      role="alertdialog"
      aria-modal="false"
      aria-labelledby="mistake-lock-heading"
      className="rounded-xl border-2 border-rose-500 bg-rose-950/90 p-5 shadow-2xl shadow-rose-950/60"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rose-500/30 pb-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-rose-400 bg-rose-500/20 text-rose-200">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded bg-rose-500 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-white">
                <Lock className="h-3 w-3" />
                POKA-YOKE MISTAKE LOCK
              </span>
              {mistake?.severity && (
                <span className="rounded border border-rose-400/50 bg-rose-900/80 px-2 py-0.5 font-mono text-[11px] font-semibold text-rose-200">
                  SEVERITY: {mistake.severity}
                </span>
              )}
            </div>
            <h3
              id="mistake-lock-heading"
              className="mt-1.5 text-base font-bold text-white"
            >
              {mistake?.label ?? `Detected Mistake State: ${result.observedState}`}
            </h3>
            <p className="font-mono text-xs text-rose-200">
              Observed Token: <code>{result.observedState}</code> • Source:{' '}
              {result.inferenceSource} ({result.latencyMs} ms)
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {/* Remediation Instruction */}
        <div className="rounded-lg border border-rose-500/40 bg-slate-950/75 p-3.5">
          <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-rose-300">
            <Wrench className="h-3.5 w-3.5" />
            Required Remediation
          </div>
          <p className="text-sm leading-relaxed text-slate-100">
            {mistake?.remediation ??
              'Correct the hardware fault shown in the ROI viewport before re-verifying this step.'}
          </p>
        </div>

        {/* Verbatim Manual Citation */}
        <div className="rounded-lg border border-rose-500/40 bg-slate-950/75 p-3.5">
          <div className="mb-1.5 flex items-center justify-between gap-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-amber-300">
            <span className="inline-flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              Verbatim Manual Citation
            </span>
            {result.verbatimCitation.pageOrRef && (
              <span className="text-[10px] text-slate-400">
                {result.verbatimCitation.pageOrRef}
              </span>
            )}
          </div>
          <p className="font-mono text-[11px] text-slate-400">
            {result.verbatimCitation.sectionTitle}
          </p>
          <blockquote className="mt-1.5 border-l-2 border-amber-400 pl-2.5 text-xs italic leading-relaxed text-slate-100">
            “{citationQuote}”
          </blockquote>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-rose-500/30 pt-3">
        <p className="font-mono text-xs text-rose-200">
          Step progression is <strong>LOCKED</strong> until Step {result.stepNumber}{' '}
          verifies as PASS.
        </p>
        <button
          type="button"
          onClick={onAcknowledgeToFix}
          className="rounded-md border border-rose-300 bg-rose-600 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow transition hover:bg-rose-500 cursor-pointer"
        >
          Fix Hardware &amp; Re-Verify Step
        </button>
      </div>
    </div>
  );
}
