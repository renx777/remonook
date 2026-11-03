import { openPdf } from "./pdf-runtime";
import { positionedLines } from "./workday-holidays.mjs";
export const OCR_BASE = "/ocr/workdays-v1/";
export async function extractHolidayPdf(
  file: File,
  pages: number[],
  ocr: boolean,
  signal: AbortSignal,
  onProgress: (text: string) => void,
) {
  if (file.size > 10 * 1024 * 1024) throw Error("Choose a PDF under 10 MB.");
  if (!pages.length || pages.length > 10)
    throw Error("Select one to ten PDF pages.");
  const task = await openPdf(new Uint8Array(await file.arrayBuffer()));
  let worker: Awaited<
    ReturnType<(typeof import("tesseract.js"))["createWorker"]>
  > | null = null;
  const cancelPdf = () => {
    void task.destroy();
    if (worker) {
      void worker.terminate();
      worker = null;
    }
  };
  signal.addEventListener("abort", cancelPdf, { once: true });
  try {
    const pdf = await task.promise;
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    if (pages.some((p) => !Number.isInteger(p) || p < 1 || p > pdf.numPages))
      throw Error(`Choose pages between 1 and ${pdf.numPages}.`);
    const out = [];
    for (const pageNumber of pages) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      onProgress(`Reading page ${pageNumber}…`);
      const page = await pdf.getPage(pageNumber),
        text = await page.getTextContent();
      let content = positionedLines(
        text.items
          .filter((i: any) => "str" in i)
          .map((i: any) => ({
            text: i.str,
            x: i.transform[4],
            y: -i.transform[5],
            height: i.height,
          })),
      );
      if (ocr) {
        if (!worker) {
          onProgress("Loading on-device text recognition…");
          const { createWorker } = await import("tesseract.js");
          worker = await createWorker("eng", 1, {
            workerPath: OCR_BASE + "worker.min.js",
            corePath: OCR_BASE,
            langPath: OCR_BASE + "lang",
            workerBlobURL: false,
            logger: (m) => {
              if (m.status === "recognizing text")
                onProgress(
                  `Recognizing page ${pageNumber} · ${Math.round(m.progress * 100)}%`,
                );
            },
          });
        }
        const view = page.getViewport({ scale: 1 }),
          scale = Math.min(2, Math.sqrt(2000000 / (view.width * view.height))),
          viewport = page.getViewport({ scale }),
          canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const render = page.render({
          canvas,
          canvasContext: canvas.getContext("2d")!,
          viewport,
        });
        try {
          await render.promise;
          if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
          const result = await abortable(
            worker.recognize(canvas, {}, { blocks: true, text: true }),
            signal,
          );
          content =
            positionedLines(
              (result.data.blocks || []).flatMap((b: any) =>
                b.paragraphs.flatMap((p: any) =>
                  p.lines.flatMap((l: any) =>
                    l.words.map((word: any) => ({
                      text: word.text,
                      x: word.bbox.x0,
                      y: word.bbox.y0,
                      height: word.bbox.y1 - word.bbox.y0,
                    })),
                  ),
                ),
              ),
            ) || result.data.text;
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      }
      out.push({ page: pageNumber, text: content });
      page.cleanup();
    }
    return out;
  } catch (e) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    throw e;
  } finally {
    signal.removeEventListener("abort", cancelPdf);
    await worker?.terminate();
    await task.destroy();
  }
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("Cancelled", "AbortError"));
    if (signal.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
