import JSZip from 'jszip';
import {XMLParser} from 'fast-xml-parser';
import {decode} from 'html-entities';
const parser=new XMLParser({preserveOrder:true,ignoreAttributes:false,attributeNamePrefix:'@_',removeNSPrefix:true,processEntities:false,parseTagValue:false,trimValues:false,maxNestedTags:256});
const xml=text=>{if(text.length>2*1024*1024||/<!ENTITY/i.test(text))throw Error('This EPUB contains unsupported or oversized markup.');return parser.parse(text);};
const tag=node=>Object.keys(node).find(k=>k!==':@'&&k!=='#text'&&!k.startsWith('?')&&!k.startsWith('!'));
function find(nodes,name,out=[]){for(const node of nodes||[]){const key=tag(node);if(key===name)out.push(node);if(key&&Array.isArray(node[key]))find(node[key],name,out);}return out;}
function pathTo(base,href){if(typeof href!=='string'||/^[a-z][a-z\d+.-]*:|^\/\//i.test(href))throw Error('External EPUB resources are unsupported.');const url=new URL(href,'https://book.local/'+base);return decodeURIComponent(url.pathname.slice(1));}
function entryText(entry,limit=2*1024*1024){
 if(!entry||entry._data?.uncompressedSize>limit)return Promise.reject(Error('An EPUB chapter is missing or too large.'));
 return new Promise((resolve,reject)=>{let size=0,failed=false;const chunks=[],stream=entry.internalStream('uint8array');stream.on('data',chunk=>{if(failed)return;size+=chunk.length;if(size>limit){failed=true;stream.pause();reject(Error('An EPUB chapter expands beyond the supported size.'));return;}chunks.push(chunk);}).on('error',reject).on('end',()=>{if(failed)return;const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}resolve(new TextDecoder().decode(bytes));}).resume();});
}
export async function parseEpub(bytes){
 const zip=await JSZip.loadAsync(bytes),entries=Object.values(zip.files);if(entries.length>10000)throw Error('This EPUB has too many entries.');
 let expanded=0;for(const entry of entries){const size=entry._data?.uncompressedSize||0;if(size>50*1024*1024||(expanded+=size)>200*1024*1024)throw Error('This EPUB expands beyond the supported size.');}
 if(await entryText(zip.file('mimetype'),100)!=='application/epub+zip')throw Error('This is not a supported EPUB.');
 if(zip.file('META-INF/encryption.xml'))throw Error('This EPUB uses encrypted resources. Choose a DRM-free edition.');
 const container=xml(await entryText(zip.file('META-INF/container.xml'),65536)),opf=find(container,'rootfile')[0]?.[':@']?.['@_full-path'];if(!opf||!zip.file(opf))throw Error('EPUB package not found.');
 const metadata=xml(await entryText(zip.file(opf))),manifest=new Map(find(metadata,'item').map(n=>[n[':@']?.['@_id'],n[':@']])),spine=find(metadata,'itemref');
 if(!spine.length||spine.length>1000)throw Error('This EPUB has an unsupported reading order.');
 const units=[];let totalText=0;
 for(let chapter=0;chapter<spine.length;chapter++){
  const attrs=spine[chapter][':@'],item=manifest.get(attrs?.['@_idref']);if(!item||attrs?.['@_linear']==='no')continue;
  const path=pathTo(opf,item['@_href']),entry=zip.file(path);if(!entry)throw Error('An EPUB chapter is missing.');
  const nodes=xml(await entryText(entry)),body=find(nodes,'body')[0];if(!body)continue;
  let text='';
  function walk(list){for(const node of list||[]){if(node['#text']!==undefined){text+=decode(String(node['#text']),{level:'html5'});continue;}const key=tag(node);if(!key||['script','style','iframe','object','svg','math','head','nav'].includes(key))continue;
   const block=/^(p|div|h[1-6]|li|blockquote|pre|tr|section|br|hr)$/.test(key);if(block)text+='\n';if(key==='img'){const alt=node[':@']?.['@_alt'];if(alt)text+='\n[Illustration: '+decode(String(alt))+']\n';}else walk(node[key]);if(block)text+='\n';}}
  walk(body.body);text=text.replace(/[\t \f\r]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  totalText+=text.length;if(totalText>8*1024*1024)throw Error('This EPUB has too much text for the lightweight reader.');
  // Deterministic passages: independent of viewport, font settings, and dates.
  let start=0;while(start<text.length){const window=text.slice(start,start+3000),words=[...window.matchAll(/\S+/g)];let end=text.length;if(words.length>350)end=start+words[350].index;else if(start+3000<text.length){let cut=window.lastIndexOf('\n\n');if(cut<1500)cut=window.lastIndexOf(' ');end=start+(cut>=1500?cut:3000);}const passage=text.slice(start,end).trim();if(passage)units.push({text:passage,chapter:chapter+1});if(units.length>10000)throw Error('This EPUB is too long for the reader.');start=end;while(/\s/.test(text[start]||'')&&start<text.length)start++;}

 }
 if(!units.length)throw Error('This EPUB contains no readable text. Choose a text edition.');
 return units;
}
