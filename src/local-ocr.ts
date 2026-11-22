export const OCR_BASE = '/ocr/workdays-v1/';
type Worker = Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>>;

export async function createLocalOcrWorker(onProgress: (value: number) => void) {
  const {createWorker} = await import('tesseract.js');
  return createWorker('eng', 1, {
    workerPath: OCR_BASE+'worker.min.js',
    corePath: OCR_BASE,
    langPath: OCR_BASE+'lang',
    workerBlobURL: false,
    logger: message => {
      if (message.status === 'recognizing text') onProgress(message.progress);
    },
  });
}

export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Cancelled','AbortError'));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, {once:true});
    void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort',abort));
  });
}

export async function recognizeImageText(blob: Blob, signal: AbortSignal, onProgress: (value: number) => void) {
  let worker: Worker | undefined;
  const canvas = document.createElement('canvas');
  try {
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      await abortable(new Promise<void>((resolve,reject)=>{
        image.onload = () => resolve();
        image.onerror = () => reject(Error('This device could not read the image.'));
        image.src = url;
      }),signal);
      const {naturalWidth:width,naturalHeight:height}=image;
      const scale = Math.min(1, 3000 / Math.max(width,height), Math.sqrt(4_000_000 / (width*height)));
      canvas.width = Math.max(1, Math.round(width*scale));
      canvas.height = Math.max(1, Math.round(height*scale));
      const context = canvas.getContext('2d');
      if (!context) throw Error('This device could not read the image.');
      context.fillStyle = '#fff';
      context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(image,0,0,canvas.width,canvas.height);
    } finally { URL.revokeObjectURL(url); }
    const starting = createLocalOcrWorker(onProgress);
    // Worker creation may finish after the user has already closed the dialog.
    void starting.then(created => { if (signal.aborted) void created.terminate(); }, () => {});
    worker = await abortable(starting, signal);
    const result = await abortable(worker.recognize(canvas), signal);
    return result.data.text.trim();
  } finally {
    canvas.width = canvas.height = 0;
    await worker?.terminate();
  }
}
