import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import 'fake-indexeddb/auto';
await build({stdin:{contents:"export * from './src/workspace-folder';export * from './src/local-books';export * from './src/book-cache';export * from './src/data-store';",resolveDir:process.cwd(),loader:'ts'},bundle:true,packages:'external',outfile:'tests/.build/local-books-folder.mjs',format:'esm',platform:'node',plugins:[{name:'desktop',setup(b){b.onResolve({filter:/^\.\/desktop$/},()=>({path:'desktop',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const isDesktop=()=>true;export const desktopInvoke=(...args)=>globalThis.folderNative(...args);'}));}}]});
const m=await import('./.build/local-books-folder.mjs');
globalThis.window={addEventListener(){},removeEventListener(){},dispatchEvent(){}};globalThis.localStorage=(()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};})();
globalThis.FileReader=class{readAsDataURL(blob){blob.arrayBuffer().then(bytes=>{this.result='data:'+blob.type+';base64,'+Buffer.from(bytes).toString('base64');this.onload();});}};
test('folder copy includes local originals and reopening the folder restores them outside ordinary assets',async()=>{
 const storage='remo-web-local-bookfolder01',other='remo-web-local-bookfolder02',blob=new Blob(['%PDF-1.7\nfolder copy']),hash=await m.digest(await blob.arrayBuffer()),id=crypto.randomUUID();let written;
 const doc=m.empty();doc.web.readingBooks={[id]:{id,name:'Folder.pdf',title:'Folder',format:'pdf',size:blob.size,hash,position:0,deleted:false,createdAt:1}};
 await m.cachedBook(m.localBookScope(storage),id+':'+hash,blob);await m.save(null,doc,'seed',undefined,false,[],undefined,storage);
 globalThis.folderNative=async(command,args)=>{if(command==='folder_stamp')return null;if(command==='folder_assets')return [];if(command==='folder_write'){written=args.write;return 'stamp-1';}throw Error(command);};
 const stop=m.startFolderMirror({id:'bookfolder01',name:'Folder',folder:'/chosen'},storage,{flush:async()=>{},onError:message=>{if(message)assert.fail(message);}});
 try{await new Promise(r=>setTimeout(r,20));await m.flushFolder();assert.ok(written);const path=m.bookPath(doc.web.readingBooks[id]);assert.equal(written.assets[0][0],path);
  globalThis.folderNative=async command=>command==='folder_read'?{doc:written.doc,stamp:'stamp-2'}:command==='folder_assets'?[path]:command==='folder_read_asset'?written.assets[0][1]:Promise.reject(Error(command));
  await m.importFromFolder({id:'bookfolder02',name:'Reopened',folder:'/chosen'},other);
  const restored=await m.cachedBook(m.localBookScope(other),id+':'+hash);assert.equal(await restored.text(),await blob.text());assert.equal((await m.load(other)).web.readingBooks[id].hash,hash);assert.equal((await m.getAssets(other)).size,0);
 }finally{stop();}
});
