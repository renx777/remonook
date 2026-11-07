import { readdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {publicPaths} from '../src/public-site.mjs';
const files = [
  "/",
  "/index.html",
  "/icon.svg",
  "/favicon.ico",
  "/icon.svg?v=2",
  "/favicon.ico?v=2",
  ...["favicon-16.png","favicon-32.png","apple-touch-icon.png","icon-192.png","icon-512.png"].map(f=>"/brand/"+f+"?v=2"),
  ...(await readdir("dist/brand")).map(f=>"/brand/"+f),
  "/manifest.webmanifest",
  "/learn.css",
  ...publicPaths.filter(path=>path!=='/').map(path=>path+'.html'),
  ...(await readdir("dist/reminder-emojis")).map(f=>"/reminder-emojis/"+f),
  // Notebook theme handwriting (Latin) so it works offline; other alphabets load on first use.
  ...(await readdir("dist/fonts/notebook")).filter(f=>/-latin\.woff2$/.test(f)).map(f=>"/fonts/notebook/"+f),
  ...(await readdir("dist/assets")).filter(f=>!(/^(PdfPage|PdfDocument|book-cover|pdf-capture|pdf-|pdf\.|pdf-runtime|epub-worker|reader-|drawing-|guide-|Workday|workday-)/.test(f))).map((f) => "/assets/" + f),
];
const hash=createHash('sha256');
for(const file of files){hash.update(file);hash.update(await readFile('dist'+(file==='/'?'/index.html':file.split('?')[0])));}
const version=hash.digest('hex').slice(0,12);
await writeFile(
  "dist/sw.js",
  `const CACHE='remo-shell-${version}',FILES=${JSON.stringify(files)};
const READER='remo-reader-assets';
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('remo-shell-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
if(e.request.mode==='navigate')e.respondWith(fetch(e.request).catch(()=>caches.open(CACHE).then(async c=>{const path=new URL(e.request.url).pathname.replace(/\\/$/,'');return await c.match(path+'.html')||await c.match(e.request)||c.match('/index.html');})));
else e.respondWith(caches.open(CACHE).then(async c=>{const cached=await c.match(e.request);if(cached)return cached;const reader=await caches.open(READER),previous=await reader.match(e.request);if(previous)return previous;const response=await fetch(e.request);if(response.ok&&/^\\/(assets|pdf|excalidraw|ocr)\\//.test(new URL(e.request.url).pathname)){try{await reader.put(e.request,response.clone());const keys=await reader.keys();if(keys.length>128)await reader.delete(keys[0]);}catch{}}return response;}));});`,
);
console.log("Offline app shell generated:", version);
