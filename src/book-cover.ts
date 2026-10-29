// Covers are derived only from account-local originals, never fetched in bulk.
// At most two PDF workers/EPUB inflaters run at once while browsing the shelf.
let running=0;const waiting:(()=>void)[]=[];
async function slot(){if(running>=2)await new Promise<void>(resolve=>waiting.push(resolve));else running++;return()=>{const next=waiting.shift();if(next)next();else running--;};}
export async function bookCover(blob:Blob,format:string,signal:AbortSignal):Promise<Blob|undefined>{
 const release=await slot();let task:any;
 try{signal.throwIfAborted();
  if(format==='pdf'){
   const {openPdf}=await import('./pdf-runtime');signal.throwIfAborted();task=await openPdf(new Uint8Array(await blob.arrayBuffer()));
   const cancel=()=>void task.destroy();signal.addEventListener('abort',cancel,{once:true});
   try{const pdf=await task.promise;signal.throwIfAborted();const page=await pdf.getPage(1),base=page.getViewport({scale:1}),viewport=page.getViewport({scale:240/base.width});const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);if(canvas.height>2000)return;
    await page.render({canvas,viewport,background:'#ffffff'}).promise;signal.throwIfAborted();return await new Promise(resolve=>canvas.toBlob(value=>resolve(value||undefined),'image/webp',.8));
   }finally{signal.removeEventListener('abort',cancel);}
  }
  const {default:JSZip}=await import('jszip');signal.throwIfAborted();const zip=await JSZip.loadAsync(await blob.arrayBuffer());
  const read=async(name:string,limit:number)=>{const entry=zip.file(name);if(!entry||(entry as any)._data?.uncompressedSize>limit)return;return await new Promise<Uint8Array|undefined>((resolve,reject)=>{let size=0;const chunks:Uint8Array[]=[],stream=(entry as any).internalStream('uint8array');stream.on('data',(chunk:Uint8Array)=>{if(signal.aborted||(size+=chunk.length)>limit){stream.pause();resolve(undefined);return;}chunks.push(chunk);}).on('error',reject).on('end',()=>{const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}resolve(bytes);}).resume();});};
  const xml=(bytes:Uint8Array)=>new DOMParser().parseFromString(new TextDecoder().decode(bytes),'application/xml');
  const container=await read('META-INF/container.xml',65536);if(!container)return;const path=xml(container).getElementsByTagName('rootfile')[0]?.getAttribute('full-path');if(!path)return;
  const opf=await read(path,2*1024*1024);if(!opf)return;const doc=xml(opf),items=[...doc.getElementsByTagName('item')],id=[...doc.getElementsByTagName('meta')].find(m=>m.getAttribute('name')==='cover')?.getAttribute('content');const cover=items.find(i=>i.getAttribute('properties')?.split(/\s+/).includes('cover-image'))||items.find(i=>i.getAttribute('id')===id);const href=cover?.getAttribute('href'),type=cover?.getAttribute('media-type');if(!href||!type||!['image/jpeg','image/png','image/webp'].includes(type)||/^[a-z]+:|^\/\//i.test(href))return;
  const url=new URL(href,'https://book.local/'+path);if(url.origin!=='https://book.local')return;const bytes=await read(decodeURIComponent(url.pathname.slice(1)),2*1024*1024);signal.throwIfAborted();if(bytes)return new Blob([bytes as BlobPart],{type});
 }finally{void task?.destroy();release();}
}
