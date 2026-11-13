export type CaptureSurfaceType = 'WORKBENCH' | 'WEBCAM' | 'VIDEO_FILE';

export interface CapturedRoiFrame {
  blob: Blob;
  dataUrl: string;
  width: 384;
  height: 384;
  sourceSurface: CaptureSurfaceType;
  simulatedStateToken?: string;
}

export const ROI_CANVAS_SIZE = 384;

export async function exportCanvasToJpegFrame(
  canvas: HTMLCanvasElement,
  sourceSurface: CaptureSurfaceType,
  simulatedStateToken?: string,
  quality = 0.92
): Promise<CapturedRoiFrame> {
  if (canvas.width !== ROI_CANVAS_SIZE || canvas.height !== ROI_CANVAS_SIZE) {
    throw new Error(
      `Expected ${ROI_CANVAS_SIZE}x${ROI_CANVAS_SIZE} ROI canvas, got ${canvas.width}x${canvas.height}.`
    );
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error('Failed to encode 384x384 canvas to JPEG Blob.'));
        }
      },
      'image/jpeg',
      quality
    );
  });

  const dataUrl = canvas.toDataURL('image/jpeg', quality);

  return {
    blob,
    dataUrl,
    width: ROI_CANVAS_SIZE,
    height: ROI_CANVAS_SIZE,
    sourceSurface,
    simulatedStateToken
  };
}
