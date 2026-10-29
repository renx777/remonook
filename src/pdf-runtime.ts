import {PDF_VERSION} from './pdf-version.mjs';
export async function openPdf(bytes:Uint8Array){
 const {getDocument,GlobalWorkerOptions}=await import('pdfjs-dist');
 const {default:workerUrl}=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
 GlobalWorkerOptions.workerSrc=workerUrl;
 const base='/pdf/'+PDF_VERSION+'/';return getDocument({data:bytes,cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/',disableAutoFetch:true});
}
