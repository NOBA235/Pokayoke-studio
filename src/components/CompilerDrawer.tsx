import { useId, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookCheck,
  CheckCircle2,
  Cloud,
  Download,
  FileText,
  Loader2,
  Save,
  ShieldAlert,
  Upload,
  X
} from 'lucide-react';
import { RAW_ROUTER_MANUAL_TEXT } from '../fixtures/defaultRouterCartridge';
import { compileManualInCloud } from '../services/hybridAiService';
import {
  exportCartridgeJson,
  importCartridgeJson,
  saveCartridge
} from '../services/storageService';
import { HardwareInferenceSource, VisualCartridge } from '../types/cartridge';
import { ModalDialog } from './ModalDialog';

export interface CompilerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  isOnline: boolean;
  activeCartridge: VisualCartridge;
  onCartridgeSaved: (cartridge: VisualCartridge) => void;
  onTelemetryEvent: (source: HardwareInferenceSource, latencyMs: number) => void;
}

const SAMPLE_PDU_MANUAL = `VERTIV RACK PDU-2400 COMMISSIONING SOP (REV 1.3)

SECTION 1: INPUT FEED ISOLATION
1.1 Verify the primary 30A Twist-Lock Breaker handle is switched to OFF (0) and the yellow "LOCKED OUT" collar is snapped around the toggle guard before connecting load whips.

SECTION 2: GROUNDING BOND LUG
2.1 Fasten the green-and-yellow 10 AWG protective earth ground strap to the chassis stud labeled "PE GROUND" using the M6 serrated flange nut. Do not leave the stud bare or use the adjacent painted rail screw.

SECTION 3: OUTLET BANK SEATING
3.1 Insert the primary server PSU C14 cord into Bank A Outlet "A1 (PRIMARY)" and engage the red retention clip across the plug collar.

SECTION 4: TORQUE VERIFICATION
4.1 Using a calibrated torque driver, tighten the PE GROUND flange nut to 4.5 Nm (+/- 0.2 Nm) and record the final reading on the commissioning sheet.`;

export function CompilerDrawer({
  isOpen,
  onClose,
  isOnline,
  activeCartridge,
  onCartridgeSaved,
  onTelemetryEvent
}: CompilerDrawerProps) {
  const headingId = useId();
  const manualFileInputRef = useRef<HTMLInputElement | null>(null);
  const jsonFileInputRef = useRef<HTMLInputElement | null>(null);

  const [equipmentModel, setEquipmentModel] = useState<string>(
    'Vertiv Rack PDU-2400'
  );
  const [cartridgeName, setCartridgeName] = useState<string>(
    'PDU-2400 Commissioning SOP'
  );
  const [manualText, setManualText] = useState<string>(SAMPLE_PDU_MANUAL);
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [compiledResult, setCompiledResult] = useState<{
    cartridge: VisualCartridge;
    latencyMs: number;
  } | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const handleManualFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    setManualText(text);
    if (!cartridgeName.trim()) {
      setCartridgeName(file.name.replace(/\.[^.]+$/, ''));
    }
  };

  const handleImportJson = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setCompileError(null);
    try {
      const text = await file.text();
      const imported = await importCartridgeJson(text);
      onCartridgeSaved(imported);
      onClose();
    } catch (error) {
      setCompileError(
        error instanceof Error ? error.message : 'Failed to import cartridge JSON.'
      );
    } finally {
      event.target.value = '';
    }
  };

  const handleExportActive = () => {
    const json = exportCartridgeJson(activeCartridge);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeCartridge.id}-v${activeCartridge.version}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleCompile = async (event: React.FormEvent) => {
    event.preventDefault();
    setCompileError(null);
    setCompiledResult(null);

    if (!isOnline) {
      setCompileError(
        'Cannot compile manual in Cloud Gemini while offline / air-gapped.'
      );
      return;
    }

    setIsCompiling(true);
    try {
      const response = await compileManualInCloud({
        manualText,
        equipmentModel,
        cartridgeName
      });
      onTelemetryEvent(response.inferenceSource, response.latencyMs);
      setCompiledResult({
        cartridge: response.cartridge,
        latencyMs: response.latencyMs
      });
    } catch (error) {
      setCompileError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCompiling(false);
    }
  };

  const handleSaveAndActivate = async () => {
    if (!compiledResult) {
      return;
    }
    setIsSaving(true);
    try {
      const saved = await saveCartridge(compiledResult.cartridge, true);
      onCartridgeSaved(saved);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const previewReport = compiledResult?.cartridge.validationReport;

  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={onClose}
      labelledById={headingId}
      className="m-auto max-h-[92vh] w-[min(96vw,64rem)] overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-0 text-slate-100 shadow-2xl"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-950/95 px-5 py-4 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <Cloud className="h-5 w-5 text-amber-400" />
          <div>
            <h2 id={headingId} className="text-base font-bold text-white">
              Cloud Manual Compiler &amp; Audit Gate
            </h2>
            <p className="font-mono text-[11px] text-slate-400">
              InferenceMode.ONLY_IN_CLOUD • Deterministic Verbatim Quote &amp; Rule Audit
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={jsonFileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={(e) => void handleImportJson(e)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => jsonFileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5 text-sky-400" />
            Import JSON
          </button>
          <button
            type="button"
            onClick={handleExportActive}
            className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-emerald-400" />
            Export Active
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Cloud Manual Compiler"
            className="rounded-md border border-slate-800 bg-slate-900 p-1.5 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-12">
        {/* Left Form: Manual Input */}
        <form
          onSubmit={(e) => void handleCompile(e)}
          className="lg:col-span-6 flex flex-col gap-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-mono text-[11px] text-slate-400">
                Equipment Model *
              </span>
              <input
                type="text"
                required
                autoFocus
                value={equipmentModel}
                onChange={(e) => setEquipmentModel(e.target.value)}
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-mono text-[11px] text-slate-400">
                Cartridge Name
              </span>
              <input
                type="text"
                value={cartridgeName}
                onChange={(e) => setCartridgeName(e.target.value)}
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-slate-400">
              Raw Equipment Manual / SOP Text
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setEquipmentModel('Vertiv Rack PDU-2400');
                  setCartridgeName('PDU-2400 Commissioning SOP');
                  setManualText(SAMPLE_PDU_MANUAL);
                }}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[10px] text-amber-300 hover:bg-slate-800 cursor-pointer"
              >
                Sample PDU SOP
              </button>
              <button
                type="button"
                onClick={() => {
                  setEquipmentModel('EdgeCore XR-400 Industrial Rack Router');
                  setCartridgeName('EdgeCore XR-400 Custom Compile');
                  setManualText(RAW_ROUTER_MANUAL_TEXT);
                }}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[10px] text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Sample Router SOP
              </button>
              <input
                ref={manualFileInputRef}
                type="file"
                accept=".txt,.md,text/plain,text/markdown"
                onChange={(e) => void handleManualFileUpload(e)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => manualFileInputRef.current?.click()}
                className="flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[10px] text-slate-200 hover:bg-slate-800 cursor-pointer"
              >
                <FileText className="h-3 w-3" /> Upload .txt/.md
              </button>
            </div>
          </div>

          <textarea
            rows={14}
            required
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="Paste raw equipment commissioning manual text here..."
            className="w-full rounded-lg border border-slate-700 bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100 focus:border-amber-400 focus:outline-none"
          />

          {compileError && (
            <div
              role="alert"
              className="rounded-lg border border-rose-500/50 bg-rose-950/60 p-3 text-xs text-rose-200"
            >
              {compileError}
            </div>
          )}

          <button
            type="submit"
            disabled={isCompiling || !isOnline}
            className="flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {isCompiling ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Compiling SOP in Cloud Gemini...
              </>
            ) : (
              <>
                <Cloud className="h-4 w-4" />
                Compile Cartridge (ONLY_IN_CLOUD)
              </>
            )}
          </button>
        </form>

        {/* Right Panel: Compile-Time Audit Scoreboard */}
        <div className="lg:col-span-6 flex flex-col gap-3">
          {!compiledResult || !previewReport ? (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-6 text-center">
              <BookCheck className="h-8 w-8 text-slate-600" />
              <p className="mt-2 text-sm font-semibold text-slate-300">
                Compile-Time Audit Scoreboard
              </p>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                Compiled cartridges are audited deterministically in plain TypeScript:
                every verbatim quote must match the source manual and all critical
                synthetic rule tests must pass before reaching READY status.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/75 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[11px] font-bold ${
                      previewReport.status === 'READY'
                        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                        : 'border-rose-500/50 bg-rose-500/15 text-rose-300'
                    }`}
                  >
                    {previewReport.status === 'READY' ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <ShieldAlert className="h-3.5 w-3.5" />
                    )}
                    {previewReport.status}
                  </span>
                  <h3 className="mt-1 text-sm font-bold text-white">
                    {compiledResult.cartridge.name} (v{compiledResult.cartridge.version})
                  </h3>
                </div>
                <span className="font-mono text-[11px] text-slate-400">
                  IN_CLOUD • {compiledResult.latencyMs} ms
                </span>
              </div>

              {/* Scoreboard Metrics */}
              <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                  <p className="text-[10px] text-slate-400">QUOTE VERIFICATION</p>
                  <p className="mt-1 text-sm font-bold text-emerald-300">
                    {previewReport.quotesVerified}/{previewReport.totalQuotesChecked} (
                    {Math.round(previewReport.quoteVerificationRate * 100)}%)
                  </p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                  <p className="text-[10px] text-slate-400">TEST PASS RATE</p>
                  <p className="mt-1 text-sm font-bold text-sky-300">
                    {previewReport.testsPassed}/{previewReport.totalTests} (
                    {Math.round(previewReport.testPassRate * 100)}%)
                  </p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                  <p className="text-[10px] text-slate-400">CRITICAL FAILURES</p>
                  <p
                    className={`mt-1 text-sm font-bold ${
                      previewReport.criticalFailures === 0
                        ? 'text-emerald-300'
                        : 'text-rose-400'
                    }`}
                  >
                    {previewReport.criticalFailures}
                  </p>
                </div>
              </div>

              {previewReport.blockingReasons.length > 0 && (
                <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 p-2.5 text-xs text-rose-200">
                  <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-rose-300">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Blocking Audit Findings
                  </div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px]">
                    {previewReport.blockingReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Step Breakdown */}
              <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                {compiledResult.cartridge.steps.map((step, idx) => {
                  const detail = previewReport.stepDetails[idx];
                  return (
                    <div
                      key={step.id}
                      className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-100">
                          {step.stepNumber}. {step.title}
                        </span>
                        <span
                          className={`font-mono text-[10px] font-bold ${
                            detail?.stepPassed ? 'text-emerald-300' : 'text-rose-300'
                          }`}
                        >
                          {detail?.quoteVerified ? 'QUOTE OK' : 'QUOTE FAIL'} •{' '}
                          {step.verificationMode}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-[10px] text-slate-400">
                        EXPECTED: {step.expectedState} | MISTAKES:{' '}
                        {step.knownMistakeStates.join(', ')}
                      </p>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                disabled={isSaving}
                onClick={() => void handleSaveAndActivate()}
                className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50 cursor-pointer"
              >
                <Save className="h-4 w-4" />
                {isSaving
                  ? 'Saving to IndexedDB...'
                  : 'Save Cartridge to IndexedDB & Activate'}
              </button>
            </div>
          )}
        </div>
      </div>
    </ModalDialog>
  );
}
