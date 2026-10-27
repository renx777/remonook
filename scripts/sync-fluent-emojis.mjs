// Fetch only Microsoft's metadata and Git trees, never the multi-GB artwork repository.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const cache=new URL('../.openai/local/fluent/',import.meta.url);
await mkdir(cache,{recursive:true});
async function json(url){const response=await fetch(url);if(!response.ok)throw Error(`${response.status}: ${url}`);return response.json();}
const repos=['fluentui-emoji-animated','fluentui-emoji'];
const sources=await Promise.all(repos.map(async repo=>{
 const {sha}=await json(`https://api.github.com/repos/microsoft/${repo}/commits/main`);
 const tree=await json(`https://api.github.com/repos/microsoft/${repo}/git/trees/${sha}?recursive=1`);
 if(tree.truncated)throw Error('Incomplete Microsoft catalog');
 return {repo,commit:sha,tree:tree.tree};
}));
const [animated,staticSource]=sources,staticPaths=new Set(staticSource.tree.map(x=>x.path));
const paths=animated.tree.filter(x=>x.path.endsWith('/metadata.json')).map(x=>x.path),metadata=new Map();
let cursor=0;
await Promise.all(Array.from({length:8},async()=>{while(cursor<paths.length){const p=paths[cursor++],file=new URL(createHash('sha256').update(animated.commit+p).digest('hex')+'.json',cache);let value;try{value=JSON.parse(await readFile(file,'utf8'));}catch{value=await json(`https://raw.githubusercontent.com/microsoft/${animated.repo}/${animated.commit}/${p.split('/').map(encodeURIComponent).join('/')}`);await writeFile(file,JSON.stringify(value));}metadata.set(p.split('/')[1],value);}}));
const tones=['Default','Light','Medium-Light','Medium','Medium-Dark','Dark'],toneNames=['','light skin tone','medium-light skin tone','medium skin tone','medium-dark skin tone','dark skin tone'];
const items=[],seen=new Set();let excludedUnmapped=0;
for(const asset of animated.tree.filter(x=>/\/animated\/.*\.png$/.test(x.path))){
 const parts=asset.path.split('/'),meta=metadata.get(parts[1]),tone=parts.length===5?tones.indexOf(parts[2]):0;
 if(!meta||tone<0)throw Error('Unmapped animation '+asset.path);
 const unicode=tone?(meta.unicodeSkintones?.[tone]||(!meta.unicode.includes(' ')?`${meta.unicode} ${(0x1f3fa+tone).toString(16)}`:null)):meta.unicode;
 // Some upstream multi-person tone drawings have no standard Unicode mapping.
 if(!unicode){excludedUnmapped++;continue;}
 const codepoint=unicode.toLowerCase().trim().split(/\s+/).map(x=>Number.parseInt(x,16).toString(16)).join('_');
 if(seen.has(codepoint))throw Error('Duplicate Unicode '+codepoint);seen.add(codepoint);
 const posterPath=asset.path.replace('/animated/','/3D/').replace('_animated','_3d');
 const name=meta.tts||meta.cldr||parts[1];
 items.push({codepoint,label:name[0].toUpperCase()+name.slice(1)+(tone?': '+toneNames[tone]:''),category:meta.group,tags:meta.keywords,animationPath:asset.path,posterPath:staticPaths.has(posterPath)?posterPath:null});
}
cursor=0;
await Promise.all(Array.from({length:8},async()=>{while(cursor<items.length){
 const item=items[cursor++],file=new URL(createHash('sha256').update(animated.commit+item.animationPath).digest('hex')+'.lfs',cache);
 let pointer;try{pointer=await readFile(file,'utf8');}catch{const response=await fetch(`https://raw.githubusercontent.com/microsoft/${animated.repo}/${animated.commit}/${item.animationPath.split('/').map(encodeURIComponent).join('/')}`);if(!response.ok)throw Error('Missing animation pointer');pointer=await response.text();await writeFile(file,pointer);}
 const match=/^size (\d+)$/m.exec(pointer),hash=/^oid sha256:([a-f0-9]{64})$/m.exec(pointer);
 if(!match||!hash)throw Error('Invalid LFS pointer '+item.animationPath);item.bytes=Number(match[1]);item.sha256=hash[1];
}}));
items.sort((a,b)=>a.category.localeCompare(b.category)||a.label.localeCompare(b.label));
const provenance=sources.map(({repo,commit,tree})=>({repo:`https://github.com/microsoft/${repo}`,commit,treeSha256:createHash('sha256').update(JSON.stringify(tree)).digest('hex')}));
const supported=items.filter(item=>item.bytes<=2*1024*1024);
await writeFile(new URL('../src/fluent-emoji-catalog.json',import.meta.url),JSON.stringify({sources:provenance,totalAnimations:items.length+excludedUnmapped,excludedUnmapped,excludedOversize:items.length-supported.length,items:supported})+'\n');
const license=await fetch(`https://raw.githubusercontent.com/microsoft/${animated.repo}/${animated.commit}/LICENSE`).then(r=>{if(!r.ok)throw Error('Missing MIT license');return r.text();});
await writeFile(new URL('../LICENSES/fluentui-emoji-MIT.txt',import.meta.url),license);
console.log(`Cataloged ${supported.length} Fluent animations with offline default-frame posters; ${items.length-supported.length} exceed the 2 MB attachment limit.`);
