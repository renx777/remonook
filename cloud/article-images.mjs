const raster=/^data:image\/(png|jpeg|webp|gif|avif);base64,[a-z0-9+/=]+$/i;
export function imageCandidates(img,base,publicUrl){
 const candidates=[],add=value=>{if(!value)return;try{if(raster.test(value)){if(!/^data:image\/gif;base64,/i.test(value)||value.length>180)candidates.push(value);}else candidates.push(publicUrl(new URL(value,base).href).href);}catch{}};
 const sets=[img.getAttribute('data-srcset'),img.getAttribute('data-lazy-srcset'),...Array.from(img.parentElement?.tagName==='PICTURE'?img.parentElement.querySelectorAll('source'):[],s=>s.getAttribute('data-srcset')||s.getAttribute('srcset')),img.getAttribute('srcset')];
 for(const set of sets){if(!set)continue;const entries=Array.from(set.matchAll(/(\S+)\s+(\d+(?:\.\d+)?)(w|x)(?:\s*,|\s*$)/g),m=>({url:m[1],size:Number(m[2])*(m[3]==='x'?640:1)}));if(!entries.length){if(set.startsWith('data:'))add(set);else for(const item of set.split(','))add(item.trim().split(/\s+/)[0]);}entries.sort((a,b)=>Math.abs(a.size-1200)-Math.abs(b.size-1200));for(const entry of entries)add(entry.url);}
 for(const attr of ['data-src','data-lazy-src','data-original','data-original-src','data-url','data-cfsrc','src'])add(img.getAttribute(attr));return [...new Set(candidates)];
}
export function prepareImages(document,base,publicUrl){
 for(const element of document.querySelectorAll('noscript')){if(element.querySelector('img,picture'))element.replaceWith(...element.childNodes);else element.remove();}
 for(const old of document.querySelectorAll('amp-img')){const img=document.createElement('img');for(const attr of old.attributes)img.setAttribute(attr.name,attr.value);old.replaceWith(img);}
 for(const img of document.querySelectorAll('img')){const candidates=imageCandidates(img,base,publicUrl);if(candidates.length)img.setAttribute('src',candidates[0]);else img.removeAttribute('src');}
}
export async function embedImages(clean,base,fetcher,signal,publicUrl,budget){
 let used=0,embedded=0,requests=0;const imageUrls=new Map();const images=Array.from(clean.querySelectorAll('img')).slice(0,12);
 async function download(value){if(raster.test(value)){const comma=value.indexOf(','),length=Math.floor((value.length-comma-1)*.75);if(length>512*1024||used+length>budget)throw Error('Image budget');return{src:value,length};}
 let url=publicUrl(value),response;for(let hop=0;hop<4;hop++){if(++requests>30)throw Error('Image request budget');response=await fetcher(url.href,{redirect:'manual',signal,headers:{Accept:'image/webp,image/png,image/jpeg,image/gif,image/avif;q=0.8',Referer:new URL(base).origin+'/'}});if(response.status>=300&&response.status<400){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw Error('Image redirect');url=publicUrl(new URL(location,url).href);continue;}break;}
 let mime=response?.headers.get('content-type')?.split(';')[0].toLowerCase();if(mime==='image/jpg')mime='image/jpeg';if(!response?.ok||!['image/png','image/jpeg','image/webp','image/gif','image/avif'].includes(mime)){await response?.body?.cancel();throw Error('Unsupported image');}
 const stream=response.body.getReader(),parts=[];let length=0;try{while(true){const item=await stream.read();if(item.done)break;length+=item.value.length;if(length>512*1024||used+length>budget){await stream.cancel();throw Error('Image budget');}parts.push(item.value);}}finally{stream.releaseLock();}
 let binary='';for(const part of parts)for(let i=0;i<part.length;i+=8192)binary+=String.fromCharCode(...part.subarray(i,i+8192));return{src:'data:'+mime+';base64,'+btoa(binary),length};}
 async function embed(img){const candidates=imageCandidates(img,base,publicUrl);for(const attr of ['src','srcset','data-src','data-srcset','data-lazy-src','data-lazy-srcset','data-original','data-original-src','data-url','data-cfsrc','loading'])img.removeAttribute(attr);if(+img.getAttribute('width')<=2&&+img.getAttribute('height')<=2&&img.hasAttribute('width')&&img.hasAttribute('height'))return;
 for(const value of candidates.slice(0,3)){if(signal.aborted||embedded>=8)break;try{const image=imageUrls.get(value)||await download(value);if(used+image.length>budget||embedded>=8)continue;imageUrls.set(value,image);used+=image.length;embedded++;img.setAttribute('src',image.src);return;}catch{/* An unavailable image keeps its alt text; try a responsive/lazy fallback. */}}}
 for(let i=0;i<images.length;i+=2)await Promise.allSettled(images.slice(i,i+2).map(embed));for(const source of clean.querySelectorAll('picture source'))source.remove();return{embedded,bytes:used};
}
