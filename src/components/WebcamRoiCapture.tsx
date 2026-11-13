import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react';
import {
  Camera,
  Film,
  Pause,
  Play,
  Square,
  Video,
  VideoOff
} from 'lucide-react';
import { CartridgeStep } from '../types/cartridge';
import {
  CaptureSurfaceType,
  CapturedRoiFrame,
  ROI_CANVAS_SIZE,
  exportCanvasToJpegFrame
} from '../utils/canvasCapture';
import type { RoiCaptureHandle } from './InteractiveWorkbenchCanvas';

export interface WebcamRoiCaptureProps {
  step: CartridgeStep;
  onFrameCaptured?: (frame: CapturedRoiFrame) => void;
}

const PREVIEW_WIDTH = 640;
const PREVIEW_HEIGHT = 480;

export const WebcamRoiCapture = forwardRef<RoiCaptureHandle, WebcamRoiCaptureProps>(
  function WebcamRoiCapture({ step, onFrameCaptured }, ref) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const cropCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const objectUrlRef = useRef<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [activeSource, setActiveSource] = useState<'IDLE' | 'WEBCAM' | 'VIDEO_FILE'>(
      'IDLE'
    );
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [cropOffsetX, setCropOffsetX] = useState<number>(0);
    const [cropOffsetY, setCropOffsetY] = useState<number>(0);
    const [previewFrame, setPreviewFrame] = useState<CapturedRoiFrame | null>(null);
    const [videoDims, setVideoDims] = useState<{ w: number; h: number }>({
      w: PREVIEW_WIDTH,
      h: PREVIEW_HEIGHT
    });

    const stopMediaResources = useCallback(() => {
      if (mediaStreamRef.current) {
        for (const track of mediaStreamRef.current.getTracks()) {
          track.stop();
        }
        mediaStreamRef.current = null;
      }

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }

      const video = videoRef.current;
      if (video) {
        video.pause();
        video.srcObject = null;
        video.removeAttribute('src');
        video.load();
      }

      setIsPlaying(false);
      setActiveSource('IDLE');
    }, []);

    useEffect(() => {
      return () => {
        stopMediaResources();
      };
    }, [stopMediaResources]);

    const computeRoiCropRect = useCallback(
      (sourceWidth: number, sourceHeight: number) => {
        const safeW = Math.max(1, sourceWidth);
        const safeH = Math.max(1, sourceHeight);

        // Maintain exact 1:1 square ROI crop sized proportionally to 384/480 of shorter edge
        const cropSize = Math.min(
          safeW,
          safeH,
          Math.round(Math.min(safeW, safeH) * (ROI_CANVAS_SIZE / PREVIEW_HEIGHT))
        );

        const maxShiftX = Math.max(0, (safeW - cropSize) / 2);
        const maxShiftY = Math.max(0, (safeH - cropSize) / 2);

        const centerX = (safeW - cropSize) / 2 + (cropOffsetX / 100) * maxShiftX;
        const centerY = (safeH - cropSize) / 2 + (cropOffsetY / 100) * maxShiftY;

        return {
          sx: Math.max(0, Math.min(safeW - cropSize, Math.round(centerX))),
          sy: Math.max(0, Math.min(safeH - cropSize, Math.round(centerY))),
          sw: cropSize,
          sh: cropSize
        };
      },
      [cropOffsetX, cropOffsetY]
    );

    // Live preview render loop drawing video + glowing 384x384 ROI target reticle
    useEffect(() => {
      let animationId = 0;

      const renderFrame = () => {
        const previewCanvas = previewCanvasRef.current;
        const video = videoRef.current;
        if (previewCanvas) {
          const ctx = previewCanvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#020617';
            ctx.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);

            if (video && activeSource !== 'IDLE' && video.readyState >= 2) {
              ctx.drawImage(video, 0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
            } else {
              // Standby grid overlay
              ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
              ctx.lineWidth = 1;
              for (let x = 32; x < PREVIEW_WIDTH; x += 32) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, PREVIEW_HEIGHT);
                ctx.stroke();
              }
              for (let y = 32; y < PREVIEW_HEIGHT; y += 32) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(PREVIEW_WIDTH, y);
                ctx.stroke();
              }
              ctx.fillStyle = '#94a3b8';
              ctx.font = 'bold 14px ui-monospace, monospace';
              ctx.textAlign = 'center';
              ctx.fillText(
                'CAMERA STANDBY — START WEBCAM OR LOAD .MP4 BENCH VIDEO',
                PREVIEW_WIDTH / 2,
                PREVIEW_HEIGHT / 2 - 12
              );
            }

            // Draw glowing 384x384 target crop box on preview canvas
            const previewRect = computeRoiCropRect(PREVIEW_WIDTH, PREVIEW_HEIGHT);

            // Dim outer margin slightly
            ctx.fillStyle = 'rgba(2, 6, 23, 0.45)';
            ctx.fillRect(0, 0, PREVIEW_WIDTH, previewRect.sy);
            ctx.fillRect(
              0,
              previewRect.sy + previewRect.sh,
              PREVIEW_WIDTH,
              PREVIEW_HEIGHT - (previewRect.sy + previewRect.sh)
            );
            ctx.fillRect(0, previewRect.sy, previewRect.sx, previewRect.sh);
            ctx.fillRect(
              previewRect.sx + previewRect.sw,
              previewRect.sy,
              PREVIEW_WIDTH - (previewRect.sx + previewRect.sw),
              previewRect.sh
            );

            ctx.save();
            ctx.shadowColor = 'rgba(245, 158, 11, 0.75)';
            ctx.shadowBlur = 12;
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2.5;
            ctx.strokeRect(
              previewRect.sx,
              previewRect.sy,
              previewRect.sw,
              previewRect.sh
            );
            ctx.restore();

            // Corner reticles
            const c = 18;
            const { sx, sy, sw, sh } = previewRect;
            ctx.strokeStyle = '#fef08a';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.moveTo(sx, sy + c);
            ctx.lineTo(sx, sy);
            ctx.lineTo(sx + c, sy);
            ctx.moveTo(sx + sw - c, sy);
            ctx.lineTo(sx + sw, sy);
            ctx.lineTo(sx + sw, sy + c);
            ctx.moveTo(sx, sy + sh - c);
            ctx.lineTo(sx, sy + sh);
            ctx.lineTo(sx + c, sy + sh);
            ctx.moveTo(sx + sw - c, sy + sh);
            ctx.lineTo(sx + sw, sy + sh);
            ctx.lineTo(sx + sw, sy + sh - c);
            ctx.stroke();

            ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
            ctx.fillRect(sx + 8, sy + 8, 224, 22);
            ctx.fillStyle = '#fbbf24';
            ctx.font = 'bold 11px ui-monospace, monospace';
            ctx.textAlign = 'left';
            ctx.fillText(
              `384×384 ROI: ${step.roiLabel.slice(0, 18)}`,
              sx + 14,
              sy + 23
            );
          }
        }

        animationId = requestAnimationFrame(renderFrame);
      };

      animationId = requestAnimationFrame(renderFrame);
      return () => cancelAnimationFrame(animationId);
    }, [activeSource, computeRoiCropRect, step.roiLabel]);

    const startWebcam = useCallback(async () => {
      setErrorMessage(null);
      stopMediaResources();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setErrorMessage(
          'Webcam capture (navigator.mediaDevices.getUserMedia) is unavailable in this browser context.'
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: PREVIEW_WIDTH },
            height: { ideal: PREVIEW_HEIGHT },
            frameRate: { ideal: 15 }
          },
          audio: false
        });

        mediaStreamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          setVideoDims({
            w: video.videoWidth || PREVIEW_WIDTH,
            h: video.videoHeight || PREVIEW_HEIGHT
          });
        }
        setActiveSource('WEBCAM');
        setIsPlaying(true);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        setErrorMessage(`Unable to open webcam: ${msg}`);
      }
    }, [stopMediaResources]);

    const handleVideoFileSelected = useCallback(
      async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
          return;
        }
        setErrorMessage(null);
        stopMediaResources();

        const objectUrl = URL.createObjectURL(file);
        objectUrlRef.current = objectUrl;

        const video = videoRef.current;
        if (video) {
          video.src = objectUrl;
          video.loop = true;
          video.muted = true;
          try {
            await video.play();
            setVideoDims({
              w: video.videoWidth || PREVIEW_WIDTH,
              h: video.videoHeight || PREVIEW_HEIGHT
            });
            setActiveSource('VIDEO_FILE');
            setIsPlaying(true);
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            setErrorMessage(`Unable to play selected video file: ${msg}`);
          }
        }
      },
      [stopMediaResources]
    );

    const toggleVideoPlayback = useCallback(async () => {
      const video = videoRef.current;
      if (!video || activeSource !== 'VIDEO_FILE') {
        return;
      }
      if (video.paused) {
        await video.play();
        setIsPlaying(true);
      } else {
        video.pause();
        setIsPlaying(false);
      }
    }, [activeSource]);

    const captureFrame = useCallback(async (): Promise<CapturedRoiFrame> => {
      const video = videoRef.current;
      const cropCanvas = cropCanvasRef.current;
      if (!cropCanvas) {
        throw new Error('384x384 ROI crop canvas is not mounted.');
      }
      if (!video || activeSource === 'IDLE' || video.readyState < 2) {
        throw new Error(
          'No active webcam stream or loaded test video frame is ready to capture.'
        );
      }

      const sourceWidth = video.videoWidth || videoDims.w || PREVIEW_WIDTH;
      const sourceHeight = video.videoHeight || videoDims.h || PREVIEW_HEIGHT;
      const crop = computeRoiCropRect(sourceWidth, sourceHeight);

      const ctx = cropCanvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to acquire 2D context for 384x384 ROI crop canvas.');
      }

      ctx.clearRect(0, 0, ROI_CANVAS_SIZE, ROI_CANVAS_SIZE);
      ctx.drawImage(
        video,
        crop.sx,
        crop.sy,
        crop.sw,
        crop.sh,
        0,
        0,
        ROI_CANVAS_SIZE,
        ROI_CANVAS_SIZE
      );

      const surface: CaptureSurfaceType =
        activeSource === 'VIDEO_FILE' ? 'VIDEO_FILE' : 'WEBCAM';
      const frame = await exportCanvasToJpegFrame(cropCanvas, surface);
      setPreviewFrame(frame);
      onFrameCaptured?.(frame);
      return frame;
    }, [activeSource, computeRoiCropRect, onFrameCaptured, videoDims.h, videoDims.w]);

    useImperativeHandle(
      ref,
      () => ({
        captureFrame
      }),
      [captureFrame]
    );

    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
            <Video className="h-4 w-4 text-amber-400" />
            <span>LIVE WEBCAM / VIDEO STREAM (640×480 → 384×384 ROI CROP)</span>
          </div>
          <span className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 font-mono text-[11px] text-slate-300">
            SOURCE: {activeSource}
          </span>
        </div>

        {/* Hidden video & 384x384 crop export canvas */}
        <video
          ref={videoRef}
          playsInline
          muted
          className="hidden"
          onLoadedMetadata={() => {
            if (videoRef.current) {
              setVideoDims({
                w: videoRef.current.videoWidth || PREVIEW_WIDTH,
                h: videoRef.current.videoHeight || PREVIEW_HEIGHT
              });
            }
          }}
        />
        <canvas
          ref={cropCanvasRef}
          width={ROI_CANVAS_SIZE}
          height={ROI_CANVAS_SIZE}
          className="hidden"
        />

        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="flex-1 overflow-hidden rounded-lg border-2 border-slate-700 bg-slate-950 shadow-lg shadow-black/40">
            <canvas
              ref={previewCanvasRef}
              width={PREVIEW_WIDTH}
              height={PREVIEW_HEIGHT}
              className="block w-full aspect-[4/3]"
            />
          </div>

          <div className="flex w-full flex-col gap-2.5 lg:w-64">
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 flex flex-col gap-2">
              <p className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
                Video Input Source
              </p>

              {activeSource !== 'WEBCAM' ? (
                <button
                  type="button"
                  onClick={() => void startWebcam()}
                  className="flex items-center justify-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25 cursor-pointer"
                >
                  <Video className="h-4 w-4" />
                  Start Webcam (640×480)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopMediaResources}
                  className="flex items-center justify-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/25 cursor-pointer"
                >
                  <VideoOff className="h-4 w-4" />
                  Stop Webcam
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/*"
                onChange={(e) => void handleVideoFileSelected(e)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 cursor-pointer"
              >
                <Film className="h-4 w-4 text-amber-400" />
                Load Test Video (.mp4)
              </button>

              {activeSource === 'VIDEO_FILE' && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void toggleVideoPlayback()}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer"
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="h-3.5 w-3.5" /> Pause
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5" /> Play
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={stopMediaResources}
                    className="flex items-center justify-center gap-1 rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-rose-300 hover:bg-slate-800 cursor-pointer"
                  >
                    <Square className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-slate-400">
                <span>ROI Crop Aim</span>
                <button
                  type="button"
                  onClick={() => {
                    setCropOffsetX(0);
                    setCropOffsetY(0);
                  }}
                  className="text-amber-400 hover:underline cursor-pointer"
                >
                  Center
                </button>
              </div>
              <label className="flex flex-col gap-1 text-[11px] font-mono text-slate-300">
                <span>Horizontal ({cropOffsetX}%)</span>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={cropOffsetX}
                  onChange={(e) => setCropOffsetX(Number(e.target.value))}
                  className="accent-amber-400"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-mono text-slate-300">
                <span>Vertical ({cropOffsetY}%)</span>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={cropOffsetY}
                  onChange={(e) => setCropOffsetY(Number(e.target.value))}
                  className="accent-amber-400"
                />
              </label>
            </div>

            <button
              type="button"
              disabled={activeSource === 'IDLE'}
              onClick={() => void captureFrame()}
              className="flex items-center justify-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs font-mono font-semibold text-amber-200 transition hover:bg-amber-500/25 disabled:opacity-40 cursor-pointer"
            >
              <Camera className="h-3.5 w-3.5" />
              Crop 384×384 Snapshot
            </button>

            {errorMessage && (
              <div className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200">
                {errorMessage}
              </div>
            )}

            {previewFrame && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2">
                <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] text-slate-400">
                  <span>384×384 JPEG CROP</span>
                  <span>{(previewFrame.blob.size / 1024).toFixed(1)} KB</span>
                </div>
                <img
                  src={previewFrame.dataUrl}
                  alt="Cropped 384x384 webcam ROI preview"
                  className="h-24 w-24 rounded border border-amber-500/40 object-cover"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);
