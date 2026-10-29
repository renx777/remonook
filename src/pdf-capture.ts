import {MAX_UPLOAD_BYTES} from './upload-limits.mjs';
export type CaptureRect={x:number;y:number;w:number;h:number};
export function capturePixels(rect:CaptureRect,width:number,height:number){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||![rect.x,rect.y,rect.w,rect.h].every(Number.isFinite)||rect.x<0||rect.y<0||rect.w<=0||rect.h<=0||rect.x+rect.w>1.00001||rect.y+rect.h>1.00001)throw Error('Choose an area inside one PDF page.');
 const x=Math.floor(rect.x*width+1e-7),y=Math.floor(rect.y*height+1e-7),right=Math.min(width,Math.ceil((rect.x+rect.w)*width-1e-7)),bottom=Math.min(height,Math.ceil((rect.y+rect.h)*height-1e-7));
 if(right-x<2||bottom-y<2)throw Error('Choose a larger area to capture.');return {x,y,width:right-x,height:bottom-y};
}
export async function capturePdfCanvas(source:HTMLCanvasElement,rect:CaptureRect={x:0,y:0,w:1,h:1}){
 const pixels=capturePixels(rect,source.width,source.height),canvas=document.createElement('canvas');canvas.width=pixels.width;canvas.height=pixels.height;
 const context=canvas.getContext('2d');if(!context)throw Error('Image capture is unavailable in this browser.');
 // Copy synchronously: later zoom/navigation may reuse or detach the PDF canvas.
 context.drawImage(source,pixels.x,pixels.y,pixels.width,pixels.height,0,0,pixels.width,pixels.height);
 const encode=(value:HTMLCanvasElement,type:string,quality?:number)=>new Promise<Blob>((resolve,reject)=>value.toBlob(blob=>blob?resolve(blob):reject(Error('The capture could not be encoded.')),type,quality));
 let blob=await encode(canvas,'image/png');if(blob.size<=MAX_UPLOAD_BYTES)return blob;
 blob=await encode(canvas,'image/webp',.92);if(blob.size<=MAX_UPLOAD_BYTES)return blob;
 let resized=canvas;
 for(let i=0;i<5;i++){const next=document.createElement('canvas');next.width=Math.max(1,Math.floor(resized.width*.8));next.height=Math.max(1,Math.floor(resized.height*.8));const context=next.getContext('2d');if(!context)break;context.drawImage(resized,0,0,next.width,next.height);resized=next;blob=await encode(resized,'image/webp',.9);if(blob.size<=MAX_UPLOAD_BYTES)return blob;}
 throw Error('This capture is too large. Select a smaller area.');
}
