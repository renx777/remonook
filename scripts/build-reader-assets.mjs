import {PDF_VERSION} from '../src/pdf-version.mjs';
import {cp,mkdir} from 'node:fs/promises';
for(const folder of ['cmaps','standard_fonts','wasm']){await mkdir('dist/pdf/'+PDF_VERSION+'/'+folder,{recursive:true});await cp('node_modules/pdfjs-dist/'+folder,'dist/pdf/'+PDF_VERSION+'/'+folder,{recursive:true});}
