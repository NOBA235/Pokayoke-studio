import { useId, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FlaskConical,
  Loader2,
  Play,
  Square,
  X,
  XCircle
} from 'lucide-react';
import { evaluateStepVerdict } from '../services/compilerAudit';
import { verifyWorkstationStep } from '../services/hybridAiService';
import {
  CartridgeStep,
  HardwareInferenceSource,
  HybridExecutionMode,
  UNLISTED_ANOMALY_TOKEN,
  VerificationVerdict,
  VisualCartridge
} from '../types/cartridge';
import {
  ROI_CANVAS_SIZE,
  exportCanvasToJpegFrame
} from '../utils/canvasCapture';
import { renderWorkbenchSceneToCanvas } from '../utils/workbenchRenderer';
import { ModalDialog } from './ModalDialog';

export interface BenchmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  cartridge: VisualCartridge;
  executionMode: HybridExecutionMode;
  onTelemetryEvent: (source: HardwareInferenceSource, latencyMs: number) => void;
}

interface BenchmarkCaseSpec {
  id: string;
  step: CartridgeStep;
  groundTruthState: string;
  expectedVerdict: VerificationVerdict;
}

interface BenchmarkCaseResult {
  caseId: string;
  stepNumber: number;
  roiLabel: string;
  groundTruthState: string;
  expectedVerdict: VerificationVerdict;
  observedState: string;
  actualVerdict: VerificationVerdict;
  passed: boolean;
  inferenceSource: HardwareInferenceSource;
  latencyMs: number;
  thumbnailDataUrl: string;
}

function buildBenchmarkSuite(
  cartridge: VisualCartridge,
  targetCount: number
): BenchmarkCaseSpec[] {
  const basePool: BenchmarkCaseSpec[] = [];

  for (const step of cartridge.steps) {
    if (step.verificationMode !== 'VISION_ROI') {
      continue;
    }

    basePool.push({
      id: `s${step.stepNumber}-valid`,
      step,
      groundTruthState: step.expectedState,
      expectedVerdict: evaluateStepVerdict(step, step.expectedState).verdict
    });

    for (const mistake of step.knownMistakeStates) {
      basePool.push({
        id: `s${step.stepNumber}-mistake-${mistake.toLowerCase()}`,
        step,
        groundTruthState: mistake,
        expectedVerdict: evaluateStepVerdict(step, mistake).verdict
      });
    }

    basePool.push({
      id: `s${step.stepNumber}-obstructed`,
      step,
      groundTruthState: UNLISTED_ANOMALY_TOKEN,
      expectedVerdict: 'ESCALATE'
    });
  }

  if (basePool.length === 0) {
    return [];
  }

  const suite: BenchmarkCaseSpec[] = [];
  for (let i = 0; i < targetCount; i += 1) {
    const template = basePool[i % basePool.length];
    suite.push({
      ...template,
      id: `crop-${String(i + 1).padStart(2, '0')}-${template.id}`
    });
  }
  return suite;
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1)
  );
  return sortedValues[index];
}

export function BenchmarkModal({
  isOpen,
  onClose,
  cartridge,
  executionMode,
  onTelemetryEvent
}: BenchmarkModalProps) {
  const headingId = useId();
  const abortControllerRef = useRef<AbortController | null>(null);

  const [batchSize, setBatchSize] = useState<number>(8);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [results, setResults] = useState<BenchmarkCaseResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(null);

  const suitePreview = useMemo(
    () => buildBenchmarkSuite(cartridge, batchSize),
    [cartridge, batchSize]
  );

  const metrics = useMemo(() => {
    const total = results.length;
    const passed = results.filter((r) => r.passed).length;
    const onDevice = results.filter((r) => r.inferenceSource === 'ON_DEVICE').length;
    const inCloud = results.filter((r) => r.inferenceSource === 'IN_CLOUD').length;
    const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
    const meanLatencyMs =
      total > 0
        ? Math.round(latencies.reduce((sum, val) => sum + val, 0) / total)
        : 0;

    return {
      total,
      passed,
      passRate: total > 0 ? passed / total : 0,
      onDevice,
      inCloud,
      meanLatencyMs,
      p50LatencyMs: percentile(latencies, 50),
      p95LatencyMs: percentile(latencies, 95)
    };
  }, [results]);

  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  const handleRunBatch = async () => {
    if (isRunning || suitePreview.length === 0) {
      return;
    }

    setErrorMessage(null);
    setResults([]);
    setCompletedAt(null);
    setIsRunning(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const canvas = document.createElement('canvas');
    canvas.width = ROI_CANVAS_SIZE;
    canvas.height = ROI_CANVAS_SIZE;
    const ctx = canvas.getContext('2d');

    try {
      if (!ctx) {
        throw new Error('Could not initialize offscreen 384x384 canvas context.');
      }

      for (const testCase of suitePreview) {
        if (controller.signal.aborted) {
          break;
        }

        renderWorkbenchSceneToCanvas(ctx, testCase.step, testCase.groundTruthState);
        const frame = await exportCanvasToJpegFrame(
          canvas,
          'WORKBENCH',
          testCase.groundTruthState
        );

        const verification = await verifyWorkstationStep({
          step: testCase.step,
          frameBlob: frame.blob,
          executionMode,
          capturedFrameDataUrl: frame.dataUrl,
          signal: controller.signal
        });

        const inferenceSource: HardwareInferenceSource =
          verification.inferenceSource === 'ON_DEVICE' ? 'ON_DEVICE' : 'IN_CLOUD';

        onTelemetryEvent(inferenceSource, verification.latencyMs);

        const passed =
          verification.verdict === testCase.expectedVerdict &&
          verification.observedState === testCase.groundTruthState;

        setResults((prev) => [
          ...prev,
          {
            caseId: testCase.id,
            stepNumber: testCase.step.stepNumber,
            roiLabel: testCase.step.roiLabel,
            groundTruthState: testCase.groundTruthState,
            expectedVerdict: testCase.expectedVerdict,
            observedState: verification.observedState,
            actualVerdict: verification.verdict,
            passed,
            inferenceSource,
            latencyMs: verification.latencyMs,
            thumbnailDataUrl: frame.dataUrl
          }
        ]);
      }

      setCompletedAt(new Date().toISOString());
    } catch (error) {
      if (!controller.signal.aborted) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    } finally {
      abortControllerRef.current = null;
      setIsRunning(false);
    }
  };

  const handleExportReport = () => {
    const payload = {
      schema: 'pokayoke-studio/benchmark-report@1',
      generatedAt: completedAt ?? new Date().toISOString(),
      cartridgeId: cartridge.id,
      cartridgeVersion: cartridge.version,
      executionMode,
      summary: {
        totalCrops: metrics.total,
        passedCrops: metrics.passed,
        empiricalTestPassRate: metrics.passRate,
        onDeviceCount: metrics.onDevice,
        inCloudCount: metrics.inCloud,
        meanLatencyMs: metrics.meanLatencyMs,
        p50LatencyMs: metrics.p50LatencyMs,
        p95LatencyMs: metrics.p95LatencyMs
      },
      results: results.map(({ thumbnailDataUrl: _omitted, ...rest }) => rest)
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `pokayoke-benchmark-${cartridge.id}-v${cartridge.version}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={() => {
        if (!isRunning) {
          onClose();
        }
      }}
      labelledById={headingId}
      className="m-auto max-h-[92vh] w-[min(96vw,68rem)] overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-0 text-slate-100 shadow-2xl"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-950/95 px-5 py-4 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <FlaskConical className="h-5 w-5 text-emerald-400" />
          <div>
            <h2 id={headingId} className="text-base font-bold text-white">
              Day-1 Empirical Benchmark Runner
            </h2>
            <p className="font-mono text-[11px] text-slate-400">
              Sequential 384×384 ROI Crop Evaluation • Mode: {executionMode}
            </p>
          </div>
        </div>

        <button
          type="button"
          autoFocus
          disabled={isRunning}
          onClick={onClose}
          aria-label="Close Benchmark Modal"
          className="rounded-md border border-slate-800 bg-slate-900 p-1.5 text-slate-400 hover:text-white disabled:opacity-40 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-4 p-5">
        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/75 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-mono text-slate-300">
              <span>Crop Batch Size:</span>
              <select
                disabled={isRunning}
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-100 cursor-pointer"
              >
                <option value={6}>6 crops</option>
                <option value={8}>8 crops</option>
                <option value={12}>12 crops</option>
                <option value={16}>16 crops</option>
                <option value={20}>20 crops</option>
              </select>
            </label>

            <span className="font-mono text-xs text-slate-400">
              Progress: {results.length}/{suitePreview.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isRunning ? (
              <button
                type="button"
                disabled={suitePreview.length === 0}
                onClick={() => void handleRunBatch()}
                className="flex items-center gap-1.5 rounded-md bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-40 cursor-pointer"
              >
                <Play className="h-3.5 w-3.5" />
                Run {batchSize}-Crop Benchmark
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStop}
                className="flex items-center gap-1.5 rounded-md border border-rose-500/50 bg-rose-500/20 px-4 py-2 text-xs font-bold text-rose-200 hover:bg-rose-500/30 cursor-pointer"
              >
                <Square className="h-3.5 w-3.5" />
                Abort Run
              </button>
            )}

            <button
              type="button"
              disabled={results.length === 0 || isRunning}
              onClick={handleExportReport}
              className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-amber-400" />
              Export JSON Report
            </button>
          </div>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="rounded-lg border border-rose-500/50 bg-rose-950/60 p-3 text-xs text-rose-200"
          >
            <strong>Benchmark Stopped:</strong> {errorMessage}
          </div>
        )}

        {/* Empirical Summary Metrics */}
        <div className="grid grid-cols-2 gap-2 font-mono text-xs sm:grid-cols-5">
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
            <p className="text-[10px] text-slate-400">TEST PASS RATE</p>
            <p className="mt-1 text-base font-bold text-emerald-300">
              {metrics.total > 0
                ? `${Math.round(metrics.passRate * 100)}% (${metrics.passed}/${metrics.total})`
                : '—'}
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
            <p className="text-[10px] text-slate-400">ON_DEVICE CROPS</p>
            <p className="mt-1 text-base font-bold text-emerald-300">
              {metrics.onDevice}
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
            <p className="text-[10px] text-slate-400">IN_CLOUD CROPS</p>
            <p className="mt-1 text-base font-bold text-sky-300">{metrics.inCloud}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
            <p className="text-[10px] text-slate-400">MEAN / P50 LATENCY</p>
            <p className="mt-1 text-base font-bold text-amber-300">
              {metrics.total > 0
                ? `${metrics.meanLatencyMs} / ${metrics.p50LatencyMs} ms`
                : '—'}
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
            <p className="text-[10px] text-slate-400">P95 LATENCY</p>
            <p className="mt-1 text-base font-bold text-slate-200">
              {metrics.total > 0 ? `${metrics.p95LatencyMs} ms` : '—'}
            </p>
          </div>
        </div>

        {/* Results Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60">
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-xs text-slate-400">
              {isRunning ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
                  <span className="font-mono">
                    Executing Concurrency-1 FIFO crop #1...
                  </span>
                </>
              ) : (
                <span>
                  Click <strong>Run {batchSize}-Crop Benchmark</strong> to evaluate
                  real 384×384 workbench crops through the hybrid inference pipeline.
                </span>
              )}
            </div>
          ) : (
            <table className="w-full border-collapse text-left font-mono text-[11px]">
              <thead className="border-b border-slate-800 bg-slate-950 text-slate-400">
                <tr>
                  <th className="px-3 py-2">Crop</th>
                  <th className="px-3 py-2">Step / ROI</th>
                  <th className="px-3 py-2">Ground Truth</th>
                  <th className="px-3 py-2">Observed</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Latency</th>
                  <th className="px-3 py-2">Match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {results.map((row) => (
                  <tr key={row.caseId} className="hover:bg-slate-800/40">
                    <td className="px-3 py-2">
                      <img
                        src={row.thumbnailDataUrl}
                        alt={row.caseId}
                        className="h-10 w-10 rounded border border-slate-700 object-cover"
                      />
                    </td>
                    <td className="px-3 py-2 text-slate-200">
                      S{row.stepNumber} • {row.roiLabel}
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {row.groundTruthState}
                    </td>
                    <td className="px-3 py-2 text-slate-100">{row.observedState}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] ${
                          row.inferenceSource === 'ON_DEVICE'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-sky-500/20 text-sky-300'
                        }`}
                      >
                        {row.inferenceSource}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-300">{row.latencyMs} ms</td>
                    <td className="px-3 py-2">
                      {row.passed ? (
                        <span className="inline-flex items-center gap-1 text-emerald-300">
                          <CheckCircle2 className="h-3.5 w-3.5" /> PASS
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-300">
                          <XCircle className="h-3.5 w-3.5" /> FAIL
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </ModalDialog>
  );
}
