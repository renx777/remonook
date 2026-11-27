import {openPdf} from './pdf-runtime';
import {SOURCE_TEXT_LIMIT} from './library-discovery.mjs';
// PDF.js parses in its own worker. Only asynchronous page orchestration lives in the UI realm,
// where its display API has the browser globals it requires. No page is painted to a canvas.
export async function extractLibraryPdf(blob:Blob,signal:AbortSignal){
 signal.throwIfAborted();const task=await openPdf(new Uint8Array(await blob.arrayBuffer()));
 const cancel=()=>{void task.destroy();};signal.addEventListener('abort',cancel,{once:true});
 try{signal.throwIfAborted();const pdf=await task.promise;if(pdf.numPages>10000)throw Error('Too many pages for local search.');const units=[];let size=0;
 for(let unit=0;unit<pdf.numPages;unit++){signal.throwIfAborted();const page=await pdf.getPage(unit+1),content=await page.getTextContent();signal.throwIfAborted();
 const text=content.items.filter((x):x is any=>'str' in x).map((x:any)=>x.str+(x.hasEOL?'\n':' ')).join('');size+=text.length;if(size>SOURCE_TEXT_LIMIT)throw Error('This source exceeds the local text search budget.');units.push({unit,text});page.cleanup();await new Promise(r=>setTimeout(r,0));}
 return units;
 }finally{signal.removeEventListener('abort',cancel);await task.destroy();}
}
