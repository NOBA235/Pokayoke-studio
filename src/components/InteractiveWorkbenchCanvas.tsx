import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  EyeOff,
  MousePointerClick
} from 'lucide-react';
import { CartridgeStep, UNLISTED_ANOMALY_TOKEN } from '../types/cartridge';
import {
  CapturedRoiFrame,
  ROI_CANVAS_SIZE,
  exportCanvasToJpegFrame
} from '../utils/canvasCapture';
import {
  renderWorkbenchSceneToCanvas,
  resolveCanvasClickNextState
} from '../utils/workbenchRenderer';

export interface RoiCaptureHandle {
  captureFrame: () => Promise<CapturedRoiFrame>;
}

export interface InteractiveWorkbenchCanvasProps {
  step: CartridgeStep;
  onStateChange?: (stateToken: string) => void;
  onFrameCaptured?: (frame: CapturedRoiFrame) => void;
}

export const InteractiveWorkbenchCanvas = forwardRef<
  RoiCaptureHandle,
  InteractiveWorkbenchCanvasProps
>(function InteractiveWorkbenchCanvas({ step, onStateChange, onFrameCaptured }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeState, setActiveState] = useState<string>(step.expectedState);
  const [mistakeCycleIndex, setMistakeCycleIndex] = useState<number>(0);
  const [previewFrame, setPreviewFrame] = useState<CapturedRoiFrame | null>(null);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);

  // Reset simulated bench state when switching to a new SOP step
  useEffect(() => {
    setActiveState(step.expectedState);
    setMistakeCycleIndex(0);
    setPreviewFrame(null);
  }, [step.id, step.expectedState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    renderWorkbenchSceneToCanvas(ctx, step, activeState);
    onStateChange?.(activeState);
  }, [step, activeState, onStateChange]);

  const captureFrame = useCallback(async (): Promise<CapturedRoiFrame> => {
    const canvas = canvasRef.current;
    if (!canvas) {
      throw new Error('Interactive workbench canvas is not mounted.');
    }
    setIsCapturing(true);
    try {
      const frame = await exportCanvasToJpegFrame(canvas, 'WORKBENCH', activeState);
      setPreviewFrame(frame);
      onFrameCaptured?.(frame);
      return frame;
    } finally {
      setIsCapturing(false);
    }
  }, [activeState, onFrameCaptured]);

  useImperativeHandle(
    ref,
    () => ({
      captureFrame
    }),
    [captureFrame]
  );

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const scaleX = ROI_CANVAS_SIZE / rect.width;
      const scaleY = ROI_CANVAS_SIZE / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;

      const nextState = resolveCanvasClickNextState(step, activeState, x, y);
      setActiveState(nextState);
    },
    [step, activeState]
  );

  const handleInjectMistake = useCallback(() => {
    if (step.knownMistakeStates.length === 0) {
      return;
    }
    const isCurrentlyMistake = step.knownMistakeStates.includes(activeState);
    const nextIdx = isCurrentlyMistake
      ? (mistakeCycleIndex + 1) % step.knownMistakeStates.length
      : mistakeCycleIndex % step.knownMistakeStates.length;
    setMistakeCycleIndex(nextIdx);
    setActiveState(step.knownMistakeStates[nextIdx]);
  }, [step.knownMistakeStates, activeState, mistakeCycleIndex]);

  const stateBadge = useMemo(() => {
    if (activeState === step.expectedState) {
      return {
        label: 'VALID BENCH STATE',
        classes: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
      };
    }
    if (step.knownMistakeStates.includes(activeState)) {
      return {
        label: 'MISTAKE INJECTED',
        classes: 'border-rose-500/40 bg-rose-500/15 text-rose-300'
      };
    }
    return {
      label: 'ANOMALY / OBSTRUCTED',
      classes: 'border-amber-500/40 bg-amber-500/15 text-amber-300'
    };
  }, [activeState, step.expectedState, step.knownMistakeStates]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
          <MousePointerClick className="h-4 w-4 text-amber-400" />
          <span>384×384 DIGITAL WORKBENCH</span>
        </div>
        <span
          className={`rounded border px-2 py-0.5 text-[11px] font-mono font-semibold ${stateBadge.classes}`}
        >
          {stateBadge.label}: {activeState}
        </span>
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        <div className="relative overflow-hidden rounded-lg border-2 border-slate-700 bg-slate-950 shadow-lg shadow-black/40">
          <canvas
            ref={canvasRef}
            width={ROI_CANVAS_SIZE}
            height={ROI_CANVAS_SIZE}
            onClick={handleCanvasClick}
            role="img"
            aria-label={`Interactive hardware simulation for ${step.title}`}
            className="block h-[320px] w-[320px] cursor-pointer sm:h-[384px] sm:w-[384px]"
          />
          <div className="pointer-events-none absolute top-2 left-2 rounded bg-slate-950/85 px-2 py-0.5 font-mono text-[10px] text-amber-300 border border-amber-500/30">
            ROI: {step.roiLabel}
          </div>
        </div>

        <div className="flex w-full flex-1 flex-col gap-2">
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-slate-400">
              Bench State Controls
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setActiveState(step.expectedState)}
                className="flex items-center justify-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25 cursor-pointer"
              >
                <CheckCircle2 className="h-4 w-4" />
                Set Valid State
              </button>

              <button
                type="button"
                onClick={handleInjectMistake}
                disabled={step.knownMistakeStates.length === 0}
                className="flex items-center justify-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/25 disabled:opacity-40 cursor-pointer"
              >
                <AlertTriangle className="h-4 w-4" />
                Inject Mistake
                {step.knownMistakeStates.length > 1
                  ? ` (${(mistakeCycleIndex % step.knownMistakeStates.length) + 1}/${step.knownMistakeStates.length})`
                  : ''}
              </button>

              <button
                type="button"
                onClick={() => setActiveState(UNLISTED_ANOMALY_TOKEN)}
                className="flex items-center justify-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/25 cursor-pointer"
              >
                <EyeOff className="h-4 w-4" />
                Inject Unlisted Anomaly
              </button>
            </div>

            {step.knownMistakeStates.length > 1 && (
              <div className="mt-3 border-t border-slate-800 pt-2">
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  Specific Mistake Tokens
                </p>
                <div className="flex flex-col gap-1">
                  {step.knownMistakeStates.map((token, idx) => (
                    <button
                      key={token}
                      type="button"
                      onClick={() => {
                        setMistakeCycleIndex(idx);
                        setActiveState(token);
                      }}
                      className={`truncate rounded border px-2 py-1 text-left font-mono text-[10px] transition cursor-pointer ${
                        activeState === token
                          ? 'border-rose-400 bg-rose-500/20 text-rose-200'
                          : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      {token}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void captureFrame()}
            disabled={isCapturing}
            className="flex items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-mono text-slate-200 transition hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
          >
            <Camera className="h-3.5 w-3.5 text-amber-400" />
            {isCapturing ? 'Encoding JPEG...' : 'Snapshot 384×384 JPEG'}
          </button>

          {previewFrame && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2">
              <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] text-slate-400">
                <span>JPEG BLOB READY</span>
                <span>{(previewFrame.blob.size / 1024).toFixed(1)} KB</span>
              </div>
              <img
                src={previewFrame.dataUrl}
                alt="Captured 384x384 ROI preview"
                className="h-24 w-24 rounded border border-slate-700 object-cover"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
