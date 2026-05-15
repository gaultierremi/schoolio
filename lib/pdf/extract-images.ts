// Extraction locale des images embarquees dans un PDF via pdfjs-dist + canvas.
// Filtre les images decoratives (<100px ou >4000px ou ratio aberrant).
// Output : tableau d'objets PNG buffer + bounding box + page + hash SHA-256.
//
// Note Trigger.dev : pdfjs-dist + canvas necessitent native deps. Le runner
// cloud Trigger.dev a un Node 21 standard avec ces deps disponibles.

import { createHash } from "node:crypto";

export type ExtractedImage = {
  pageNumber: number;
  width: number;
  height: number;
  pngBuffer: Buffer;
  hash: string;
};

const MIN_DIMENSION = 100;
const MAX_DIMENSION = 4000;
const MAX_ASPECT_RATIO = 10;

function shouldKeepImage(width: number, height: number): boolean {
  if (width < MIN_DIMENSION || height < MIN_DIMENSION) return false;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) return false;
  const ratio = Math.max(width / height, height / width);
  if (ratio > MAX_ASPECT_RATIO) return false;
  return true;
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Extract embedded raster images from a PDF buffer using pdfjs-dist.
 * Filters out decorative images (too small, too large, weird aspect ratio).
 * Dedups by SHA-256 hash : same image used twice in PDF = 1 returned entry.
 */
export async function extractImagesFromPdf(pdfBuffer: Buffer): Promise<ExtractedImage[]> {
  // Dynamic imports : pdfjs-dist + canvas only loaded if pipeline B enabled.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjsLib: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canvasMod: any = await import("canvas");
  const createCanvas = canvasMod.createCanvas ?? canvasMod.default?.createCanvas;

  const data = new Uint8Array(pdfBuffer.buffer, pdfBuffer.byteOffset, pdfBuffer.byteLength);
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;

  const images: ExtractedImage[] = [];
  const seenHashes = new Set<string>();

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const ops = await page.getOperatorList();
    const objs = page.objs;

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fnId = ops.fnArray[i];
      const args = ops.argsArray[i];

      // paintImageXObject / paintInlineImageXObject opcodes
      if (
        fnId !== pdfjsLib.OPS.paintImageXObject &&
        fnId !== pdfjsLib.OPS.paintInlineImageXObject
      ) {
        continue;
      }

      const imgName = args[0];
      let img;
      try {
        img = objs.has(imgName) ? objs.get(imgName) : null;
      } catch {
        continue;
      }
      if (!img) continue;

      const width = img.width as number;
      const height = img.height as number;
      const imgData = img.data as Uint8Array | undefined;
      if (!imgData || !width || !height) continue;
      if (!shouldKeepImage(width, height)) continue;

      let pngBuffer: Buffer;
      try {
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext("2d");
        const imageData = ctx.createImageData(width, height);

        // imgData may be RGB (length = w*h*3) or RGBA (length = w*h*4)
        if (imgData.length === width * height * 3) {
          for (let p = 0, j = 0; p < imgData.length; p += 3, j += 4) {
            imageData.data[j] = imgData[p];
            imageData.data[j + 1] = imgData[p + 1];
            imageData.data[j + 2] = imgData[p + 2];
            imageData.data[j + 3] = 255;
          }
        } else if (imgData.length === width * height * 4) {
          imageData.data.set(imgData);
        } else {
          continue; // unsupported pixel format
        }
        ctx.putImageData(imageData, 0, 0);
        pngBuffer = canvas.toBuffer("image/png");
      } catch {
        continue; // canvas rendering failed (unsupported image format)
      }

      const hash = sha256(pngBuffer);
      if (seenHashes.has(hash)) continue; // dedup
      seenHashes.add(hash);

      images.push({ pageNumber: pageNum, width, height, pngBuffer, hash });
    }
  }

  return images;
}
