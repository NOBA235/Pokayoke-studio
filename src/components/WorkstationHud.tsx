import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertOctagon,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  Inbox,
  Loader2,
  Lock,
  Monitor,
  RotateCcw,
  ShieldCheck,
  Video
} from 'lucide-react';
import { evaluateStepVerdict } from '../services/compilerAudit';
import { verifyWorkstationStep } from '../services/hybridAiService';
import { enqueueEscalation, updateEscalation } from '../services/storageService';
import {
  HardwareInferenceSource,
  HybridExecutionMode,
  OfflineEscalationItem,
  StepVerificationResult,
  UNLISTED_ANOMALY_TOKEN,
  VisualCartridge
} from '../types/cartridge';
import {
  InteractiveWorkbenchCanvas,
  RoiCaptureHandle
} from './InteractiveWorkbenchCanvas';
import { MistakeLockOverlay } from './MistakeLockOverlay';
import { WebcamRoiCapture } from './WebcamRoiCapture';

export interface WorkstationHudProps {
  cartridge: VisualCartridge;
  executionMode: HybridExecutionMode;
  isOnline: boolean;
  disableHotkeys?: boolean;
  onTelemetryEvent: (source: HardwareInferenceSource, latencyMs: number) => void;
  onEscalationQueued: () => void;
}

function isInteractiveTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    tag === 'button' ||
    target.isContentEditable
  );
}

export function WorkstationHud({
  cartridge,
  executionMode,
  isOnline,
  disableHotkeys = false,
  onTelemetryEvent,
  onEscalationQueued
}: WorkstationHudProps) {
  const surfaceRef = useRef<RoiCaptureHandle | null>(null);

  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [completedStepIds, setCompletedStepIds] = useState<string[]>([]);
  const [stepResults, setStepResults] = useState<Record<string, StepVerificationResult>>(
    {}
  );
  const [surfaceMode, setSurfaceMode] = useState<'WORKBENCH' | 'WEBCAM'>('WORKBENCH');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [mistakeLockResult, setMistakeLockResult] =
    useState<StepVerificationResult | null>(null);
  const [queuedEscalation, setQueuedEscalation] =
    useState<OfflineEscalationItem | null>(null);
  const [escalationNotes, setEscalationNotes] = useState<string>('');
  const [escalationNoteSaved, setEscalationNoteSaved] = useState<boolean>(false);

  // Field observation state (used for FIELD_OBSERVATION steps or optional manual check)
  const [fieldObservedToken, setFieldObservedToken] = useState<string>('');
  const [fieldMeasurementNote, setFieldMeasurementNote] = useState<string>('');

  // Reset assembly run when cartridge ID or version changes
  useEffect(() => {
    setActiveStepIndex(0);
    setCompletedStepIds([]);
    setStepResults({});
    setMistakeLockResult(null);
    setQueuedEscalation(null);
    setVerifyError(null);
  }, [cartridge.id, cartridge.version]);

  const activeStep = cartridge.steps[activeStepIndex];

  useEffect(() => {
    if (activeStep) {
      setFieldObservedToken(activeStep.expectedState);
      setFieldMeasurementNote('');
      setMistakeLockResult(null);
      setQueuedEscalation(null);
      setVerifyError(null);
    }
  }, [activeStep?.id]);

  const highestUnlockedIndex = useMemo(() => {
    let unlocked = 0;
    for (let i = 0; i < cartridge.steps.length; i += 1) {
      if (completedStepIds.includes(cartridge.steps[i].id)) {
        unlocked = Math.min(cartridge.steps.length - 1, i + 1);
      } else {
        break;
      }
    }
    return unlocked;
  }, [cartridge.steps, completedStepIds]);

  const isAllComplete =
    cartridge.steps.length > 0 &&
    cartridge.steps.every((step) => completedStepIds.includes(step.id));

  const handleResetRun = useCallback(() => {
    setActiveStepIndex(0);
    setCompletedStepIds([]);
    setStepResults({});
    setMistakeLockResult(null);
    setQueuedEscalation(null);
    setVerifyError(null);
  }, []);

  const processVerificationResult = useCallback(
    async (
      result: StepVerificationResult,
      frameDataUrl?: string
    ): Promise<void> => {
      if (!activeStep) {
        return;
      }

      setStepResults((prev) => ({
        ...prev,
        [activeStep.id]: result
      }));

      if (result.verdict === 'PASS') {
        setMistakeLockResult(null);
        setQueuedEscalation(null);
        setCompletedStepIds((prev) =>
          prev.includes(activeStep.id) ? prev : [...prev, activeStep.id]
        );
        return;
      }

      if (result.verdict === 'MISTAKE_LOCK') {
        setQueuedEscalation(null);
        setMistakeLockResult(result);
        // Relock this step if previously passed
        setCompletedStepIds((prev) => prev.filter((id) => id !== activeStep.id));
        return;
      }

      // ESCALATE (OUT_OF_SCOPE_OR_OBSTRUCTED or unlisted token)
      setMistakeLockResult(null);
      const escalationItem: OfflineEscalationItem = {
        id: `esc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        cartridgeId: cartridge.id,
        cartridgeVersion: cartridge.version,
        stepId: activeStep.id,
        stepNumber: activeStep.stepNumber,
        roiLabel: activeStep.roiLabel,
        observedState: result.observedState || UNLISTED_ANOMALY_TOKEN,
        operatorNotes: '',
        frameBase64Jpeg: frameDataUrl || result.capturedFrameDataUrl || '',
        createdAt: new Date().toISOString(),
        status: 'PENDING_SYNC'
      };

      await enqueueEscalation(escalationItem);
      setQueuedEscalation(escalationItem);
      setEscalationNotes('');
      setEscalationNoteSaved(false);
      onEscalationQueued();
    },
    [activeStep, cartridge.id, cartridge.version, onEscalationQueued]
  );

  const handleVerifyStep = useCallback(async () => {
    if (!activeStep || isVerifying) {
      return;
    }
    if (cartridge.status === 'BLOCKED_FAILED_CHECKS') {
      setVerifyError(
        'This cartridge failed compile-time quote/test checks and is blocked from execution.'
      );
      return;
    }

    setVerifyError(null);
    setIsVerifying(true);

    try {
      if (!surfaceRef.current) {
        throw new Error('Active 384×384 ROI surface is not ready.');
      }

      const frame = await surfaceRef.current.captureFrame();
      const result = await verifyWorkstationStep({
        step: activeStep,
        frameBlob: frame.blob,
        executionMode,
        capturedFrameDataUrl: frame.dataUrl
      });

      if (
        result.inferenceSource === 'ON_DEVICE' ||
        result.inferenceSource === 'IN_CLOUD'
      ) {
        onTelemetryEvent(result.inferenceSource, result.latencyMs);
      }
      await processVerificationResult(result, frame.dataUrl);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setVerifyError(msg);
    } finally {
      setIsVerifying(false);
    }
  }, [
    activeStep,
    cartridge.status,
    executionMode,
    isVerifying,
    onTelemetryEvent,
    processVerificationResult
  ]);

  const handleFieldObservationSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!activeStep || cartridge.status === 'BLOCKED_FAILED_CHECKS') {
        return;
      }

      const evaluation = evaluateStepVerdict(activeStep, fieldObservedToken);
      const result: StepVerificationResult = {
        stepId: activeStep.id,
        stepNumber: activeStep.stepNumber,
        observedState: fieldObservedToken,
        verdict: evaluation.verdict,
        inferenceSource: 'FIELD_MANUAL',
        latencyMs: 0,
        timestamp: new Date().toISOString(),
        matchedMistake: evaluation.matchedMistake,
        verbatimCitation: activeStep.source,
        rawModelText: fieldMeasurementNote.trim() || undefined
      };

      let frameDataUrl = '';
      if (surfaceRef.current && evaluation.verdict === 'ESCALATE') {
        try {
          const captured = await surfaceRef.current.captureFrame();
          frameDataUrl = captured.dataUrl;
        } catch {
          // Optional visual snapshot if webcam is idle
        }
      }

      await processVerificationResult(result, frameDataUrl);
    },
    [
      activeStep,
      cartridge.status,
      fieldMeasurementNote,
      fieldObservedToken,
      processVerificationResult
    ]
  );

  const handleSaveEscalationNotes = useCallback(async () => {
    if (!queuedEscalation) {
      return;
    }
    const updated: OfflineEscalationItem = {
      ...queuedEscalation,
      operatorNotes: escalationNotes.trim()
    };
    await updateEscalation(updated);
    setQueuedEscalation(updated);
    setEscalationNoteSaved(true);
  }, [escalationNotes, queuedEscalation]);

  // Spacebar shortcut for rapid hands-busy verification
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        disableHotkeys ||
        event.code !== 'Space' ||
        event.repeat ||
        isInteractiveTextTarget(event.target)
      ) {
        return;
      }
      if (activeStep?.verificationMode === 'VISION_ROI') {
        event.preventDefault();
        void handleVerifyStep();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeStep?.verificationMode, disableHotkeys, handleVerifyStep]);

  if (!activeStep) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">
        No assembly steps found in this cartridge.
      </div>
    );
  }

  const currentStepResult = stepResults[activeStep.id];
  const isCurrentStepPassed = completedStepIds.includes(activeStep.id);
  const canAdvance =
    isCurrentStepPassed && activeStepIndex < cartridge.steps.length - 1;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4">
      {/* Compile-Time Block Banner */}
      {cartridge.status === 'BLOCKED_FAILED_CHECKS' && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/60 bg-rose-950/60 p-4 text-sm text-rose-100"
        >
          <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase text-rose-300">
            <AlertOctagon className="h-4 w-4" />
            Cartridge Execution Blocked — Failed Compile-Time Audit
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-rose-200">
            {cartridge.validationReport.blockingReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Completion Banner */}
      {isAllComplete && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/50 bg-emerald-950/50 px-4 py-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-emerald-400" />
            <div>
              <p className="text-sm font-bold text-emerald-200">
                Assembly Verified — All {cartridge.steps.length} Poka-Yoke Steps Passed
              </p>
              <p className="font-mono text-xs text-emerald-300/80">
                {cartridge.equipmentModel} • Cartridge v{cartridge.version}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetRun}
            className="flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Assembly Run
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Left Sidebar: Sequential Step Tracker */}
        <aside className="lg:col-span-4 flex flex-col gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-amber-400">
                  Sequential SOP Gate
                </p>
                <h2 className="text-sm font-bold text-slate-100">
                  {cartridge.equipmentModel}
                </h2>
              </div>
              <span className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 font-mono text-xs text-slate-300">
                {completedStepIds.length}/{cartridge.steps.length}
              </span>
            </div>

            <ol className="flex flex-col gap-2">
              {cartridge.steps.map((step, index) => {
                const isDone = completedStepIds.includes(step.id);
                const isActive = index === activeStepIndex;
                const isLocked = index > highestUnlockedIndex;

                return (
                  <li key={step.id}>
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={() => setActiveStepIndex(index)}
                      className={`flex w-full items-start gap-3 rounded-lg border p-2.5 text-left transition ${
                        isActive
                          ? 'border-amber-500/70 bg-amber-500/10'
                          : isDone
                          ? 'border-emerald-500/35 bg-emerald-500/10 hover:border-emerald-500/60'
                          : 'border-slate-800 bg-slate-950/60 opacity-60'
                      } ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isDone ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        ) : isLocked ? (
                          <Lock className="h-4 w-4 text-slate-500" />
                        ) : (
                          <span className="flex h-4 w-4 items-center justify-center rounded-full border border-amber-400 font-mono text-[10px] font-bold text-amber-300">
                            {step.stepNumber}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-100">
                          {step.stepNumber}. {step.title}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400">
                          {step.verificationMode} • {step.roiLabel}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Active Step Citation & Anchor Hints */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 flex flex-col gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                Anchor Verification Hints
              </p>
              <ul className="mt-1.5 space-y-1 text-xs text-slate-300">
                {activeStep.anchorHints.map((hint) => (
                  <li key={hint} className="flex items-start gap-2">
                    <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                    <span>{hint}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-slate-800 pt-3">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-amber-300">
                <span className="inline-flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5" />
                  Manual Source Citation
                </span>
                {activeStep.source.pageOrRef && (
                  <span className="text-slate-400">{activeStep.source.pageOrRef}</span>
                )}
              </div>
              <p className="mt-1 font-mono text-[10px] text-slate-400">
                {activeStep.source.sectionTitle}
              </p>
              <blockquote className="mt-1.5 border-l-2 border-amber-500/60 pl-2.5 text-xs italic text-slate-200">
                “{activeStep.source.verbatimQuote}”
              </blockquote>
            </div>
          </div>
        </aside>

        {/* Main Right Workspace: Active Step HUD + Dual-Surface 384x384 Viewport */}
        <section className="lg:col-span-8 flex flex-col gap-4">
          {/* Active Instruction Card */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-amber-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-300">
                    STEP {activeStep.stepNumber} OF {cartridge.steps.length}
                  </span>
                  <span className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 font-mono text-[10px] text-slate-300">
                    EXPECTED: {activeStep.expectedState}
                  </span>
                </div>
                <h2 className="mt-2 text-lg font-bold text-white">
                  {activeStep.title}
                </h2>
                <p className="mt-1 text-sm text-slate-300">{activeStep.instruction}</p>
              </div>

              {/* Dual-Surface Switcher */}
              <div
                role="group"
                aria-label="ROI input surface selector"
                className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-1"
              >
                <button
                  type="button"
                  onClick={() => setSurfaceMode('WORKBENCH')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                    surfaceMode === 'WORKBENCH'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Monitor className="h-3.5 w-3.5" />
                  Digital Workbench
                </button>
                <button
                  type="button"
                  onClick={() => setSurfaceMode('WEBCAM')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                    surfaceMode === 'WEBCAM'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Video className="h-3.5 w-3.5" />
                  Live Webcam / Video
                </button>
              </div>
            </div>

            {/* Verify Bar */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={
                    isVerifying || cartridge.status === 'BLOCKED_FAILED_CHECKS'
                  }
                  onClick={() => void handleVerifyStep()}
                  className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  {isVerifying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verifying 384×384 ROI...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      Verify Step [Spacebar]
                    </>
                  )}
                </button>

                {canAdvance && (
                  <button
                    type="button"
                    onClick={() => setActiveStepIndex((idx) => idx + 1)}
                    className="flex items-center gap-2 rounded-lg border border-emerald-400/50 bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/25 cursor-pointer"
                  >
                    Next Step
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>

              {currentStepResult && (
                <div className="font-mono text-xs">
                  <span
                    className={`rounded border px-2.5 py-1 font-semibold ${
                      currentStepResult.verdict === 'PASS'
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                        : currentStepResult.verdict === 'MISTAKE_LOCK'
                        ? 'border-rose-500/50 bg-rose-500/15 text-rose-300'
                        : 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                    }`}
                  >
                    {currentStepResult.verdict}: {currentStepResult.observedState} (
                    {currentStepResult.inferenceSource} • {currentStepResult.latencyMs}ms)
                  </span>
                </div>
              )}
            </div>

            {verifyError && (
              <div
                role="alert"
                className="mt-3 rounded-lg border border-rose-500/50 bg-rose-950/60 px-3 py-2 text-xs text-rose-200"
              >
                <strong>Verification Error:</strong> {verifyError}
              </div>
            )}
          </div>

          {/* Mistake Lock Overlay */}
          {mistakeLockResult && (
            <MistakeLockOverlay
              result={mistakeLockResult}
              onAcknowledgeToFix={() => setMistakeLockResult(null)}
            />
          )}

          {/* Unlisted Anomaly / Offline Escalation Banner */}
          {queuedEscalation && (
            <div
              role="status"
              className="rounded-xl border border-amber-500/60 bg-amber-950/50 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Inbox className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                  <div>
                    <p className="font-mono text-xs font-bold uppercase text-amber-300">
                      Out-of-Scope / Obstructed — Queued to IndexedDB ({isOnline ? 'Online Ready to Patch' : 'Offline Queue'})
                    </p>
                    <p className="mt-1 text-xs text-amber-100">
                      PokaYoke never guesses on unlisted anomalies. Snapshot{' '}
                      <code className="font-mono">{queuedEscalation.id}</code> was saved
                      for Cloud Gemini rule escalation.
                    </p>
                  </div>
                </div>
                {queuedEscalation.frameBase64Jpeg && (
                  <img
                    src={queuedEscalation.frameBase64Jpeg}
                    alt="Queued anomaly 384x384 snapshot"
                    className="h-16 w-16 rounded border border-amber-500/50 object-cover"
                  />
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={escalationNotes}
                  onChange={(e) => {
                    setEscalationNotes(e.target.value);
                    setEscalationNoteSaved(false);
                  }}
                  placeholder="Optional operator note (e.g., glare on silkscreen, damaged clip)..."
                  className="flex-1 rounded-md border border-amber-500/30 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleSaveEscalationNotes()}
                  className="rounded-md border border-amber-400/50 bg-amber-500/20 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/30 cursor-pointer"
                >
                  {escalationNoteSaved ? 'Note Saved' : 'Attach Note'}
                </button>
              </div>
            </div>
          )}

          {/* Dual-Surface 384x384 Viewport */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4">
            {surfaceMode === 'WORKBENCH' ? (
              <InteractiveWorkbenchCanvas ref={surfaceRef} step={activeStep} />
            ) : (
              <WebcamRoiCapture ref={surfaceRef} step={activeStep} />
            )}
          </div>

          {/* Field Observation Fallback / Non-Visual Check Input */}
          <form
            onSubmit={(e) => void handleFieldObservationSubmit(e)}
            className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-sky-400" />
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-200">
                  Field Observation{' '}
                  {activeStep.verificationMode === 'FIELD_OBSERVATION'
                    ? '(Required Non-Visual Check)'
                    : '(Manual Fallback Input)'}
                </h3>
              </div>
              {activeStep.expectedFieldNote && (
                <span className="font-mono text-[11px] text-sky-300">
                  Target: {activeStep.expectedFieldNote}
                </span>
              )}
            </div>

            {activeStep.fieldCheckPrompt && (
              <p className="mt-1.5 text-xs text-slate-300">
                {activeStep.fieldCheckPrompt}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                aria-label="Observed field state token"
                value={fieldObservedToken}
                onChange={(e) => setFieldObservedToken(e.target.value)}
                className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-slate-100 focus:border-sky-400 focus:outline-none cursor-pointer"
              >
                <option value={activeStep.expectedState}>
                  {activeStep.expectedState} (PASS)
                </option>
                {activeStep.knownMistakeStates.map((token) => (
                  <option key={token} value={token}>
                    {token} (MISTAKE)
                  </option>
                ))}
                <option value={UNLISTED_ANOMALY_TOKEN}>
                  {UNLISTED_ANOMALY_TOKEN} (ESCALATE)
                </option>
              </select>

              <input
                type="text"
                value={fieldMeasurementNote}
                onChange={(e) => setFieldMeasurementNote(e.target.value)}
                placeholder="Measurement / meter reading (e.g., 0.0V AC verified, 1.8 Nm)..."
                className="min-w-[220px] flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
              />

              <button
                type="submit"
                disabled={cartridge.status === 'BLOCKED_FAILED_CHECKS'}
                className="rounded-md border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/25 disabled:opacity-40 cursor-pointer"
              >
                Log Field Observation
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
