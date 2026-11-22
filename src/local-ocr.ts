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

export type ImageCrop = {left:number;top:number;right:number;bottom:number};
export const fullImage:ImageCrop = {left:0,top:0,right:1,bottom:1};
export type OcrLayout = 'auto' | 'block' | 'sparse';
export type OcrOptions = {rotation:number;crop:ImageCrop;layout:OcrLayout;invert:boolean};

export async function decodeOcrImage(blob:Blob,signal:AbortSignal) {
  const url=URL.createObjectURL(blob);
  try {
    const image=new Image();
    await abortable(new Promise<void>((resolve,reject)=>{
      image.onload=()=>resolve();
      image.onerror=()=>reject(Error('This device could not read the image.'));
      image.src=url;
    }),signal);
    return image;
  } finally { URL.revokeObjectURL(url); }
}

/** Crop coordinates apply in the rotated view. Draw directly at the requested output size. */
export function drawOcrImage(canvas:HTMLCanvasElement,image:HTMLImageElement,
    rotation:number,crop:ImageCrop,invert:boolean,maxSide:number,maxPixels:number) {
  const {naturalWidth:w,naturalHeight:h}=image;
  const [width,height]=rotation%2?[h,w]:[w,h];
  const x=Math.floor(crop.left*width),y=Math.floor(crop.top*height);
  const cropWidth=Math.ceil(crop.right*width)-x,cropHeight=Math.ceil(crop.bottom*height)-y;
  if(cropWidth<1||cropHeight<1)throw Error('Choose a larger area.');
  const scale=Math.min(1,maxSide/Math.max(cropWidth,cropHeight),Math.sqrt(maxPixels/(cropWidth*cropHeight)));
  canvas.width=Math.max(1,Math.round(cropWidth*scale));
  canvas.height=Math.max(1,Math.round(cropHeight*scale));
  const context=canvas.getContext('2d',{willReadFrequently:invert});
  if(!context)throw Error('This device could not read the image.');
  context.fillStyle='#fff';
  context.fillRect(0,0,canvas.width,canvas.height);
  context.save();
  context.scale(canvas.width/cropWidth,canvas.height/cropHeight);
  context.translate(-x,-y);
  if(rotation===1)context.translate(h,0);
  else if(rotation===2)context.translate(w,h);
  else if(rotation===3)context.translate(0,w);
  context.rotate(rotation*Math.PI/2);
  context.drawImage(image,0,0);
  context.restore();
  if(invert){
    const pixels=context.getImageData(0,0,canvas.width,canvas.height);
    for(let i=0;i<pixels.data.length;i+=4)for(let channel=0;channel<3;channel++)
      pixels.data[i+channel]=255-pixels.data[i+channel];
    context.putImageData(pixels,0,0);
  }
}

export async function recognizeImageText(image: HTMLImageElement, options:OcrOptions,
    signal: AbortSignal, onProgress: (value: number) => void) {
  let worker: Worker | undefined;
  const canvas=document.createElement('canvas');
  try {
    drawOcrImage(canvas,image,options.rotation,options.crop,options.invert,3500,4_000_000);
    const starting=createLocalOcrWorker(onProgress);
    void starting.then(created=>{if(signal.aborted)void created.terminate();},()=>{});
    worker=await abortable(starting,signal);
    const {PSM}=await abortable(import('tesseract.js'),signal);
    const pageMode={auto:PSM.AUTO,block:PSM.SINGLE_BLOCK,sparse:PSM.SPARSE_TEXT};
    await abortable(worker.setParameters({tessedit_pageseg_mode:pageMode[options.layout]}),signal);
    const result=await abortable(worker.recognize(canvas),signal);
    return result.data.text.trim();
  } finally {
    canvas.width=canvas.height=0;
    await worker?.terminate();
  }
}
