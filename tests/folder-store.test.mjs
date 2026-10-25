import test from 'node:test';import assert from 'node:assert/strict';
import {empty,withNodes,parseArchive} from './.build/data.mjs';
import {bullet} from '../src/domain.mjs';
import {writeFolderCopy,listFolderCopies,readDeviceCopy,fileDigest} from './.build/folder-store.mjs';
class MemoryFile{
 kind='file';constructor(name){this.name=name;this.blob=new Blob();this.modified=1;this.fail=false;}
 async getFile(){return new File([this.blob],this.name,{lastModified:this.modified});}
 async createWritable(){let next;return{write:async blob=>{if(this.fail)throw Error('Disk full');next=blob;},close:async()=>{this.blob=next;this.modified++;},abort:async()=>{}};}
}
class MemoryDirectory{
 kind='directory';constructor(name){this.name=name;this.entries=new Map();}
 async getDirectoryHandle(name,options={}){if(!this.entries.has(name)){if(!options.create)throw new DOMException('Missing','NotFoundError');this.entries.set(name,new MemoryDirectory(name));}return this.entries.get(name);}
 async getFileHandle(name,options={}){if(!this.entries.has(name)){if(!options.create)throw new DOMException('Missing','NotFoundError');this.entries.set(name,new MemoryFile(name));}return this.entries.get(name);}
 async *values(){yield* this.entries.values();}
}
function fixture(device='device-one') {let doc=empty();doc.web.deviceId=device;doc=withNodes(doc,[bullet('q',{text:'Question',kind:'QUESTION'}),bullet('a',{parentId:'q',text:'Answer'})]);doc.tables.media=[{id:'image',bulletId:'a',fileName:'photo.png',mimeType:'image/png',sourceUrl:'',credit:'',licenseUrl:''}];return{doc,assets:new Map([['media/photo.png',new Blob(['image bytes'])]])};}
test('folder copies contain all notes, media and progress; each device has its own file and a previous copy',async()=>{
 const root=new MemoryDirectory('Notes'),connection={handle:root,expected:null,enabled:true,lastSaved:0};let {doc,assets}=fixture();
 let saved=await writeFolderCopy(connection,doc,assets);connection.expected=saved.hash;
 let restored=await parseArchive(await readDeviceCopy(root,doc.web.deviceId));
 assert.equal(restored.doc.tables.bullets[0].text,'Question');assert.equal(await restored.assets.get('media/photo.png').text(),'image bytes');
 doc={...doc,tables:{...doc.tables,bullets:doc.tables.bullets.map(n=>n.id==='q'?{...n,text:'Edited question'}:n)}};
 saved=await writeFolderCopy(connection,doc,assets);connection.expected=saved.hash;
 const copies=await listFolderCopies(root);assert.equal(copies.length,2);assert.equal(copies.filter(c=>c.previous).length,1);
 restored=await parseArchive(await copies.find(c=>c.previous).handle.getFile());assert.equal(restored.doc.tables.bullets[0].text,'Question');
 const other=fixture('device-two');await writeFolderCopy({handle:root,expected:null,enabled:true},other.doc,other.assets);
 restored=await parseArchive(await readDeviceCopy(root,'device-one'));assert.equal(restored.doc.tables.bullets[0].text,'Edited question');
 assert.equal((await listFolderCopies(root)).length,3);
});
test('external edits stop folder writes and failed writes retain the last complete copy',async()=>{
 const root=new MemoryDirectory('Notes'),connection={handle:root,expected:null,enabled:true};const {doc,assets}=fixture();
 const first=await writeFolderCopy(connection,doc,assets);connection.expected=first.hash;
 const dir=await root.getDirectoryHandle('Remo'),file=await dir.getFileHandle('device-device-one.remo.zip');
 file.blob=new Blob(['external change']);
 await assert.rejects(writeFolderCopy(connection,doc,assets),/changed outside/);assert.equal(await file.blob.text(),'external change');
 connection.expected=await fileDigest(await file.getFile());file.fail=true;
 await assert.rejects(writeFolderCopy(connection,doc,assets),/Disk full/);assert.equal(await file.blob.text(),'external change');
 assert.equal(await (await dir.getFileHandle('device-device-one.previous.remo.zip')).blob.text(),'external change');
});
