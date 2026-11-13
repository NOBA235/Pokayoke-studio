import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cloud,
  GitCompare,
  Inbox,
  Loader2,
  ShieldAlert,
  Trash2,
  X
} from 'lucide-react';
import {
  auditCompiledCartridge,
  incrementMinorVersion
} from '../services/compilerAudit';
import { resolveEscalationInCloud } from '../services/hybridAiService';
import {
  applyPatchedStepToCartridge,
  deleteEscalation,
  getCartridge,
  listEscalations,
  updateEscalation
} from '../services/storageService';
import {
  EscalationPatchProposal,
  HardwareInferenceSource,
  OfflineEscalationItem,
  ValidationReport,
  VisualCartridge
} from '../types/cartridge';
import { ModalDialog } from './ModalDialog';

export interface EscalationQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  isOnline: boolean;
  cartridges: VisualCartridge[];
  onCartridgePatched: (updatedCartridge: VisualCartridge) => void;
  onEscalationsChanged: () => void;
  onTelemetryEvent: (source: HardwareInferenceSource, latencyMs: number) => void;
}

interface ActiveProposalState {
  proposal: EscalationPatchProposal;
  targetCartridge: VisualCartridge;
  auditPreview: ValidationReport;
}

export function EscalationQueueModal({
  isOpen,
  onClose,
  isOnline,
  cartridges,
  onCartridgePatched,
  onEscalationsChanged,
  onTelemetryEvent
}: EscalationQueueModalProps) {
  const headingId = useId();
  const [escalations, setEscalations] = useState<OfflineEscalationItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [applyingPatch, setApplyingPatch] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeProposal, setActiveProposal] =
    useState<ActiveProposalState | null>(null);

  const refreshQueue = useCallback(async () => {
    setIsLoading(true);
    try {
      const items = await listEscalations();
      setEscalations(items);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setActiveProposal(null);
      void refreshQueue();
    }
  }, [isOpen, refreshQueue]);

  const pendingCount = useMemo(
    () => escalations.filter((item) => item.status === 'PENDING_SYNC').length,
    [escalations]
  );

  const handleResolveInCloud = async (item: OfflineEscalationItem) => {
    if (!isOnline) {
      setErrorMessage(
        'Cannot escalate queued snapshots to Cloud Gemini while offline / air-gapped.'
      );
      return;
    }

    setErrorMessage(null);
    setResolvingId(item.id);

    try {
      const cartridge =
        cartridges.find((c) => c.id === item.cartridgeId) ??
        (await getCartridge(item.cartridgeId));
      if (!cartridge) {
        throw new Error(
          `Target cartridge "${item.cartridgeId}" no longer exists in IndexedDB.`
        );
      }

      const currentStep = cartridge.steps.find((s) => s.id === item.stepId);
      if (!currentStep) {
        throw new Error(
          `Step "${item.stepId}" was not found in cartridge "${cartridge.name}".`
        );
      }

      const proposal = await resolveEscalationInCloud({
        escalation: item,
        currentStep,
        rawManualText: cartridge.rawManualText
      });

      onTelemetryEvent(proposal.inferenceSource, proposal.latencyMs);

      const auditPreview = auditCompiledCartridge({
        rawManualText: cartridge.rawManualText,
        steps: cartridge.steps.map((step) =>
          step.id === proposal.proposedStep.id ? proposal.proposedStep : step
        )
      });

      setActiveProposal({
        proposal,
        targetCartridge: cartridge,
        auditPreview
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setResolvingId(null);
    }
  };

  const handleApplyPatch = async () => {
    if (!activeProposal) {
      return;
    }

    const { proposal, targetCartridge } = activeProposal;
    const escalation = escalations.find((e) => e.id === proposal.escalationId);
    if (!escalation) {
      return;
    }

    setApplyingPatch(true);
    setErrorMessage(null);

    try {
      const updatedCartridge = await applyPatchedStepToCartridge({
        cartridgeId: targetCartridge.id,
        patchedStep: proposal.proposedStep,
        escalationId: escalation.id,
        summary: proposal.rationale
      });

      const resolvedItem: OfflineEscalationItem = {
        ...escalation,
        status: 'RESOLVED_PATCHED',
        proposedPatchedStep: proposal.proposedStep,
        resolutionNotes: proposal.rationale
      };
      await updateEscalation(resolvedItem);

      setActiveProposal(null);
      await refreshQueue();
      onCartridgePatched(updatedCartridge);
      onEscalationsChanged();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setApplyingPatch(false);
    }
  };

  const handleDismiss = async (item: OfflineEscalationItem) => {
    await updateEscalation({ ...item, status: 'DISMISSED' });
    await refreshQueue();
    onEscalationsChanged();
  };

  const handleDelete = async (id: string) => {
    await deleteEscalation(id);
    if (activeProposal?.proposal.escalationId === id) {
      setActiveProposal(null);
    }
    await refreshQueue();
    onEscalationsChanged();
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={onClose}
      labelledById={headingId}
      className="m-auto max-h-[92vh] w-[min(96vw,68rem)] overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-0 text-slate-100 shadow-2xl"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-950/95 px-5 py-4 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <Inbox className="h-5 w-5 text-amber-400" />
          <div>
            <h2 id={headingId} className="text-base font-bold text-white">
              Offline Escalation Queue &amp; Versioned Patch Diff
            </h2>
            <p className="font-mono text-[11px] text-slate-400">
              {pendingCount} pending anomaly snapshot(s) • Cloud Gemini ONLY_IN_CLOUD
              reconciliation
            </p>
          </div>
        </div>

        <button
          type="button"
          autoFocus
          onClick={onClose}
          aria-label="Close Offline Escalation Queue"
          className="rounded-md border border-slate-800 bg-slate-900 p-1.5 text-slate-400 hover:text-white cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-4 p-5">
        {errorMessage && (
          <div
            role="alert"
            className="rounded-lg border border-rose-500/50 bg-rose-950/60 p-3 text-xs text-rose-200"
          >
            {errorMessage}
          </div>
        )}

        {/* Active Side-by-Side Diff Viewer */}
        {activeProposal && (
          <div className="rounded-xl border-2 border-amber-500/60 bg-slate-900/90 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <GitCompare className="h-5 w-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Proposed Patch Diff — Step {activeProposal.proposal.originalStep.stepNumber}
                  </h3>
                  <p className="font-mono text-[11px] text-slate-400">
                    Version Bump: v{activeProposal.targetCartridge.version}{' '}
                    <ArrowRight className="inline h-3 w-3 text-amber-400" /> v
                    {incrementMinorVersion(activeProposal.targetCartridge.version)} •{' '}
                    IN_CLOUD ({activeProposal.proposal.latencyMs} ms)
                  </p>
                </div>
              </div>

              <span
                className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[11px] font-bold ${
                  activeProposal.auditPreview.status === 'READY'
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                    : 'border-rose-500/50 bg-rose-500/15 text-rose-300'
                }`}
              >
                {activeProposal.auditPreview.status === 'READY' ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <ShieldAlert className="h-3.5 w-3.5" />
                )}
                RE-AUDIT: {activeProposal.auditPreview.status} (Quotes{' '}
                {Math.round(activeProposal.auditPreview.quoteVerificationRate * 100)}% •
                Tests {Math.round(activeProposal.auditPreview.testPassRate * 100)}%)
              </span>
            </div>

            <p className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-200">
              <strong className="font-mono text-amber-300">Cloud Rationale:</strong>{' '}
              {activeProposal.proposal.rationale}
            </p>

            {activeProposal.auditPreview.blockingReasons.length > 0 && (
              <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-950/50 p-3 text-xs text-rose-200">
                <div className="flex items-center gap-1.5 font-mono font-bold text-rose-300">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Audit Warning
                </div>
                <ul className="mt-1 list-disc pl-4 text-[11px]">
                  {activeProposal.auditPreview.blockingReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {/* Old Step */}
              <div className="rounded-lg border border-rose-500/30 bg-slate-950/80 p-3 text-xs">
                <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-rose-300">
                  Old Step (v{activeProposal.targetCartridge.version})
                </p>
                <div className="space-y-2">
                  <div>
                    <span className="font-mono text-[10px] text-slate-500">TITLE</span>
                    <p className="font-semibold text-slate-200">
                      {activeProposal.proposal.originalStep.title}
                    </p>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] text-slate-500">
                      KNOWN MISTAKE TOKENS
                    </span>
                    <p className="font-mono text-[11px] text-rose-200">
                      {activeProposal.proposal.originalStep.knownMistakeStates.join(', ')}
                    </p>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] text-slate-500">
                      ANCHOR HINTS
                    </span>
                    <ul className="list-disc pl-4 text-[11px] text-slate-300">
                      {activeProposal.proposal.originalStep.anchorHints.map((hint) => (
                        <li key={hint}>{hint}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] text-slate-500">
                      VERBATIM QUOTE
                    </span>
                    <blockquote className="border-l-2 border-slate-700 pl-2 text-[11px] italic text-slate-400">
                      “{activeProposal.proposal.originalStep.source.verbatimQuote}”
                    </blockquote>
                  </div>
                </div>
              </div>

              {/* Patched Step */}
              <div className="rounded-lg border border-emerald-500/40 bg-slate-950/80 p-3 text-xs">
                <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                  Patched Step (v
                  {incrementMinorVersion(activeProposal.targetCartridge.version)})
                </p>
                <div className="space-y-2">
                  <div>
                    <span className="font-mono text-[10px] text-slate-500">TITLE</span>
                    <p className="font-semibold text-white">
                      {activeProposal.proposal.proposedStep.title}
                    </p>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] text-slate-500">
                      KNOWN MISTAKE TOKENS
                    </span>
                    <p className="font-mono text-[11px] text-emerald-200">
                      {activeProposal.proposal.proposedStep.knownMistakeStates.join(', ')}
                    </p>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] text-slate-500">
                      ANCHOR HINTS
                    </span>
                    <ul className="list-disc pl-4 text-[11px] text-emerald-100">
                      {activeProposal.proposal.proposedStep.anchorHints.map((hint) => (
                        <li key={hint}>{hint}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] text-slate-500">
                      VERBATIM QUOTE
                    </span>
                    <blockquote className="border-l-2 border-emerald-500/60 pl-2 text-[11px] italic text-slate-200">
                      “{activeProposal.proposal.proposedStep.source.verbatimQuote}”
                    </blockquote>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveProposal(null)}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Discard Proposal
              </button>
              <button
                type="button"
                disabled={
                  applyingPatch || activeProposal.auditPreview.status !== 'READY'
                }
                onClick={() => void handleApplyPatch()}
                className="flex items-center gap-1.5 rounded-md bg-emerald-500 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {applyingPatch ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving v
                    {incrementMinorVersion(activeProposal.targetCartridge.version)}...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Apply Patch &amp; Bump to v
                    {incrementMinorVersion(activeProposal.targetCartridge.version)}
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Queue List */}
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs font-mono text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading IndexedDB escalation queue...
          </div>
        ) : escalations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-10 text-center">
            <Inbox className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-2 text-sm font-semibold text-slate-300">
              No Queued Anomalies
            </p>
            <p className="mt-1 text-xs text-slate-500">
              When an assembly frame returns OUT_OF_SCOPE_OR_OBSTRUCTED, it queues here
              in IndexedDB until reconnected to Cloud Gemini.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {escalations.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 sm:flex-row sm:items-center"
              >
                {item.frameBase64Jpeg ? (
                  <img
                    src={item.frameBase64Jpeg}
                    alt={`Escalated 384x384 snapshot for step ${item.stepNumber}`}
                    className="h-24 w-24 shrink-0 rounded-lg border border-slate-700 object-cover"
                  />
                ) : (
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 font-mono text-[10px] text-slate-500">
                    NO IMAGE
                  </div>
                )}

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded border px-2 py-0.5 font-mono text-[10px] font-bold ${
                        item.status === 'PENDING_SYNC'
                          ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                          : item.status === 'RESOLVED_PATCHED'
                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                          : 'border-slate-700 bg-slate-800 text-slate-400'
                      }`}
                    >
                      {item.status}
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-100">
                      Step {item.stepNumber} • {item.roiLabel}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      v{item.cartridgeVersion} •{' '}
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <p className="font-mono text-[11px] text-amber-200">
                    Observed: {item.observedState}
                  </p>

                  {item.operatorNotes && (
                    <p className="text-xs text-slate-300">
                      Operator Note: “{item.operatorNotes}”
                    </p>
                  )}

                  {item.resolutionNotes && (
                    <p className="text-xs text-emerald-300">
                      Patch Applied: {item.resolutionNotes}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {item.status === 'PENDING_SYNC' && (
                    <>
                      <button
                        type="button"
                        disabled={!isOnline || resolvingId === item.id}
                        onClick={() => void handleResolveInCloud(item)}
                        className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                      >
                        {resolvingId === item.id ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Cloud className="h-3.5 w-3.5" />
                            Propose Patch
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDismiss(item)}
                        className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleDelete(item.id)}
                    aria-label={`Delete escalation ${item.id}`}
                    className="rounded-md border border-slate-800 bg-slate-950 p-1.5 text-slate-400 hover:border-rose-500/40 hover:text-rose-300 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalDialog>
  );
}
