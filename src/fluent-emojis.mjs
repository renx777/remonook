import catalog from './fluent-emoji-catalog.json' with {type:'json'};
import {resource} from './noto-emojis.mjs';
export const FLUENT_CREDIT_PATH='emoji/fluent-LICENSE.txt';
export const FLUENT_CREDIT=`Fluent Emoji Animated artwork by Microsoft.\nSource: https://github.com/microsoft/fluentui-emoji-animated\nStatic previews: https://github.com/microsoft/fluentui-emoji\nAnimations are unmodified; offline posters are extracted PNG default frames.\n\nMIT License\n\nCopyright (c) Microsoft Corporation.\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n`;
const categories={'Activities':'Activities and events','Animals & Nature':'Animals and nature','Food & Drink':'Food and drink','People & Body':'People','Smileys & Emotion':'Smileys and emotions','Travel & Places':'Travel and places'};
export const fluentEmojis=catalog.items.map(item=>({...item,category:categories[item.category]||item.category,token:`:fluent_${item.codepoint}:`,fileName:`fluent_${item.codepoint}.png`,fallback:String.fromCodePoint(...item.codepoint.split('_').map(x=>parseInt(x,16)))}));
const byToken=new Map(fluentEmojis.map(item=>[item.token,item]));
export const getFluentEmoji=token=>byToken.get(token);
export const isFluentEmoji=item=>typeof item?.token==='string'&&/^:fluent_[0-9a-f]{2,6}(?:_[0-9a-f]{2,6})*:$/.test(item.token)&&item.fileName===item.token.slice(1,-1)+'.png';
export const fluentPosterPath=item=>'emoji/'+item.fileName.replace(/\.png$/,'.poster.png');
export function fluentAssetUrl(item,poster=false){
 const known=getFluentEmoji(item.token);if(!known)throw Error('Unknown Fluent emoji.');
 if(poster&&!known.posterPath)return '';
 const source=catalog.sources[poster?1:0],path=poster?known.posterPath:known.animationPath;
 return `https://${poster?'raw':'media'}.githubusercontent.com/${poster?'':'media/'}microsoft/${poster?'fluentui-emoji':'fluentui-emoji-animated'}/${source.commit}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
const signature=[137,80,78,71,13,10,26,10];
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes){let n=0xffffffff;for(const byte of bytes)n=crcTable[(n^byte)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
// Validate actual PNG/APNG structure and checksums, never a file extension or MIME alone.
// The default IDAT image is a complete static poster; no canvas or remote conversion is needed.
export function fluentStaticPoster(bytes){
 if(bytes.length>2*1024*1024||bytes.length<57||!signature.every((x,i)=>bytes[i]===x))throw Error('Microsoft returned an invalid PNG animation.');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),chunks=[bytes.subarray(0,8)];
 let at=8,width=0,height=0,frames=0,controls=0,sequence=0,ended=false,hasImage=false,hasFrameData=false;
 while(at<bytes.length){
  if(at+12>bytes.length)throw Error('Incomplete PNG chunk.');
  const size=view.getUint32(at),end=at+12+size;if(end>bytes.length)throw Error('Incomplete PNG chunk.');
  const type=String.fromCharCode(...bytes.subarray(at+4,at+8)),p=at+8;
  if(crc(bytes.subarray(at+4,end-4))!==view.getUint32(end-4))throw Error('Corrupt PNG checksum.');
  if(at===8&&type!=='IHDR')throw Error('Missing PNG header.');
  if(type==='IHDR'){
   if(at!==8||size!==13)throw Error('Invalid PNG header.');width=view.getUint32(p);height=view.getUint32(p+4);
   if(!width||!height||width>512||height>512)throw Error('Unsupported Fluent image dimensions.');
  }
  if(type==='acTL'){if(frames||hasImage||size!==8)throw Error('Invalid APNG animation header.');frames=view.getUint32(p);if(frames<2||frames>1200)throw Error('Unsupported Fluent frame count.');}
  if(type==='fcTL'){
   if(!frames||size!==26||view.getUint32(p)!==sequence++)throw Error('Invalid APNG frame sequence.');
   const w=view.getUint32(p+4),h=view.getUint32(p+8),x=view.getUint32(p+12),y=view.getUint32(p+16);
   if(!w||!h||x+w>width||y+h>height||bytes[p+24]>2||bytes[p+25]>1)throw Error('Invalid APNG frame dimensions.');
   controls++;
  }
  if(type==='fdAT'){if(!hasImage||!controls||size<5||view.getUint32(p)!==sequence++)throw Error('Invalid APNG frame data.');hasFrameData=true;}
  if(type==='IDAT'){if(!frames||hasFrameData||!size)throw Error('Invalid PNG image data.');hasImage=true;}
  if(!['acTL','fcTL','fdAT'].includes(type))chunks.push(bytes.subarray(at,end));
  at=end;
  if(type==='IEND'){if(size||at!==bytes.length)throw Error('Invalid PNG end.');ended=true;break;}
 }
 if(!ended||!hasImage||!hasFrameData||controls!==frames)throw Error('Incomplete animated PNG.');
 const poster=new Uint8Array(chunks.reduce((n,x)=>n+x.length,0));let offset=0;for(const chunk of chunks){poster.set(chunk,offset);offset+=chunk.length;}return poster;
}
export async function downloadFluentEmoji(item,signal){
 const known=getFluentEmoji(item.token);if(!known)throw Error('Unknown Fluent emoji.');
 const timeout=AbortSignal.timeout(30000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
 let bytes;try{bytes=await resource(fluentAssetUrl(known),combined,2*1024*1024);}catch(error){if(signal?.aborted)throw error;throw Error(error?.name==='TimeoutError'?'Emoji download timed out. Try again.':`Could not download this emoji. ${error?.message||'Check your connection and try again.'}`);}
 if(bytes.length!==known.bytes)throw Error('Incomplete Fluent animation. Try again.');
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!==known.sha256)throw Error('Fluent animation integrity check failed. Try again.');
 const poster=fluentStaticPoster(bytes);
 return new Map([['emoji/'+known.fileName,new Blob([bytes],{type:'image/png'})],[fluentPosterPath(known),new Blob([poster],{type:'image/png'})],[FLUENT_CREDIT_PATH,new Blob([FLUENT_CREDIT],{type:'text/plain'})]]);
}
