import {checkBook} from './book-storage.mjs';
import JSZip from 'jszip';
export async function inspectBook(file:File){
 const format=checkBook(file);
 if(format==='pdf'){
  const header=new TextDecoder().decode(await file.slice(0,1024).arrayBuffer());
  if(!header.includes('%PDF-'))throw Error('This file does not have a PDF header. Choose the original PDF.');
 }else{
  const bytes=await file.arrayBuffer(),view=new DataView(bytes);let end=-1;
  for(let i=bytes.byteLength-22;i>=Math.max(0,bytes.byteLength-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.byteLength){end=i;break;}
  if(end<0||view.getUint16(end+4,true)||view.getUint16(end+6,true))throw Error('Choose a valid, unencrypted EPUB.');
  const count=view.getUint16(end+10,true),start=view.getUint32(end+16,true);let offset=start,total=0;
  if(count>10000||start+view.getUint32(end+12,true)!==end)throw Error('This EPUB is too complex or has an invalid directory.');
  const names=new Set<string>();
  for(let i=0;i<count;i++){
   if(offset+46>end||view.getUint32(offset,true)!==0x02014b50)throw Error('Invalid EPUB directory.');
   const flags=view.getUint16(offset+8,true),expanded=view.getUint32(offset+24,true),length=view.getUint16(offset+28,true),extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true);
   if(flags&1||expanded>50*1024*1024||(total+=expanded)>200*1024*1024||offset+46+length+extra+comment>end)throw Error('This EPUB is encrypted or expands beyond the supported size.');
   const name=new TextDecoder().decode(new Uint8Array(bytes,offset+46,length));if(names.has(name)||name.startsWith('/')||name.split('/').includes('..')||name.includes('\\'))throw Error('Unsafe EPUB entry.');names.add(name);
   if((name==='mimetype'||name==='META-INF/container.xml')&&expanded>65536)throw Error('Invalid EPUB metadata.');
   offset+=46+length+extra+comment;
  }
  if(offset!==end)throw Error('Invalid EPUB directory.');
  const zip=await JSZip.loadAsync(bytes);
  if(await zip.file('mimetype')?.async('string')!=='application/epub+zip'||!zip.file('META-INF/container.xml'))throw Error('This file is not an EPUB book.');
 }
 return format;
}
