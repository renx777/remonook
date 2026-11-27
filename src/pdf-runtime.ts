import {PDF_VERSION} from './pdf-version.mjs';
export async function openPdf(bytes:Uint8Array){
 const {getDocument,GlobalWorkerOptions}=await import('pdfjs-dist');
 GlobalWorkerOptions.workerSrc=new URL('../node_modules/pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).href;
 const base='/pdf/'+PDF_VERSION+'/';return getDocument({data:bytes,cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/',disableAutoFetch:true});
}
