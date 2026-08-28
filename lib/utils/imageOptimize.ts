/**
 * Client-side image optimisation, run before anything is uploaded.
 *
 * The handoff calls this the highest-leverage code in the build, and the reason
 * is that one change cuts four costs at once: storage, upload bandwidth on a
 * Caribbean mobile connection, latency before the tutor sees "Optimising… done",
 * and the token cost of every vision call that reads the image afterwards. A
 * modern phone camera produces 4000×3000 at 6MB; nothing in marking a script
 * benefits from that over 1600px.
 *
 * Browser-only. It uses canvas and createImageBitmap, so it must not be
 * imported from a Server Component or an API route.
 */

/** Long edge in pixels. Handwriting stays legible well below this. */
const DEFAULT_MAX_EDGE = 1600;

/** WebP quality. 0.82 is where the artefacts stop being visible on text. */
const DEFAULT_QUALITY = 0.82;

export interface OptimizeOptions {
  maxEdge?: number;
  quality?: number;
  /**
   * WebP is much smaller, and every browser that can run this app supports it.
   * The option exists for the rare case where a downstream consumer cannot.
   */
  mimeType?: 'image/webp' | 'image/jpeg';
}

export interface OptimizedImage {
  blob: Blob;
  fileName: string;
  width: number;
  height: number;
  originalBytes: number;
  optimizedBytes: number;
}

/**
 * Fit within maxEdge without enlarging.
 *
 * Scaling a small photo UP would add bytes and no detail, so an image already
 * within bounds is returned at its own size.
 */
function fitWithin(
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };

  const scale = maxEdge / longest;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function swapExtension(fileName: string, mimeType: string): string {
  const extension = mimeType === 'image/jpeg' ? 'jpg' : 'webp';
  const stem = fileName.replace(/\.[^.]+$/, '');
  return `${stem}.${extension}`;
}

/**
 * Resize and re-encode one image.
 *
 * Returns the original untouched when it is already smaller than the result
 * would be — re-encoding an optimised image is a way to make it bigger.
 */
export async function optimizeImage(
  file: File,
  options: OptimizeOptions = {}
): Promise<OptimizedImage> {
  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const mimeType = options.mimeType ?? 'image/webp';

  const bitmap = await createImageBitmap(file);
  // Captured before close(): an ImageBitmap reports 0x0 once released.
  const sourceWidth = bitmap.width;
  const sourceHeight = bitmap.height;
  const { width, height } = fitWithin(sourceWidth, sourceHeight, maxEdge);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Could not get a 2D canvas context to optimise the image');
  }

  // Matters for photographs of handwriting, where nearest-neighbour scaling
  // turns thin pencil strokes into broken dots.
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mimeType, quality)
  );

  if (!blob) {
    throw new Error('Canvas produced no image data while optimising');
  }

  // Re-encoding made it worse. Keep what we started with.
  if (blob.size >= file.size) {
    return {
      blob: file,
      fileName: file.name,
      width: sourceWidth,
      height: sourceHeight,
      originalBytes: file.size,
      optimizedBytes: file.size,
    };
  }

  return {
    blob,
    fileName: swapExtension(file.name, mimeType),
    width,
    height,
    originalBytes: file.size,
    optimizedBytes: blob.size,
  };
}

/**
 * Optimise a set of images, keeping the caller informed.
 *
 * Sequential rather than parallel: each pass allocates a full-resolution
 * bitmap, and decoding twenty phone photographs at once is how a mid-range
 * Android tab runs out of memory. The progress callback is what drives the
 * "Optimising…" state in the upload step.
 */
export async function optimizeImages(
  files: File[],
  options: OptimizeOptions = {},
  onProgress?: (done: number, total: number) => void
): Promise<OptimizedImage[]> {
  const results: OptimizedImage[] = [];

  for (const [index, file] of files.entries()) {
    results.push(await optimizeImage(file, options));
    onProgress?.(index + 1, files.length);
  }

  return results;
}
