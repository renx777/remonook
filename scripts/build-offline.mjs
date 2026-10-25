import { readdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
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
  ...(await readdir("dist/reminder-emojis")).map(f=>"/reminder-emojis/"+f),
  ...(await readdir("dist/assets")).map((f) => "/assets/" + f),
];
const version = createHash("sha256")
  .update(files.join("|"))
  .digest("hex")
  .slice(0, 12);
await writeFile(
  "dist/sw.js",
  `const CACHE='remo-shell-${version}',FILES=${JSON.stringify(files)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('remo-shell-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
if(e.request.mode==='navigate')e.respondWith(fetch(e.request).catch(()=>caches.open(CACHE).then(c=>c.match('/index.html'))));
else e.respondWith(caches.open(CACHE).then(c=>c.match(e.request)).then(r=>r||fetch(e.request)));});`,
);
console.log("Offline app shell generated:", version);
