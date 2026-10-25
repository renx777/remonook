import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { FolderStoragePanel,useFolderStorage } from "./.build/FolderStorage.mjs";
import {empty,withNodes,parseArchive} from "./.build/data.mjs";
import {bullet} from "../src/domain.mjs";
import "fake-indexeddb/auto";
import { RemoColor, RemoHighlight, RemoMask } from "./.build/editor.mjs";

const dom = new JSDOM('<div id="editor"></div><div id="toolbar"></div><input id="outside">', { url: "http://localhost", pretendToBeVisual: true });
for (const key of ["window", "document", "navigator", "Node", "HTMLElement", "HTMLInputElement", "MutationObserver", "DOMParser", "getComputedStyle"])
  Object.defineProperty(globalThis, key, { value: key === "getComputedStyle" ? dom.window.getComputedStyle.bind(dom.window) : dom.window[key], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.ResizeObserver = undefined;
window.scrollBy = () => {};
const { createRoot } = await import("react-dom/client");
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });


class MemoryFile{kind='file';constructor(name){this.name=name;this.blob=new Blob();this.modified=1;}async getFile(){return new File([this.blob],this.name,{lastModified:this.modified});}async createWritable(){let next;return{write:async blob=>{next=blob;},close:async()=>{this.blob=next;this.modified++;},abort:async()=>{}};}}
class MemoryDirectory{kind='directory';constructor(name){this.name=name;this.entries=new Map();}async queryPermission(){return 'granted';}async requestPermission(){return 'granted';}async getDirectoryHandle(name,options={}){if(!this.entries.has(name)){if(!options.create)throw new DOMException('Missing','NotFoundError');this.entries.set(name,new MemoryDirectory(name));}return this.entries.get(name);}async getFileHandle(name,options={}){if(!this.entries.has(name)){if(!options.create)throw new DOMException('Missing','NotFoundError');this.entries.set(name,new MemoryFile(name));}return this.entries.get(name);}async *values(){yield* this.entries.values();}}
test('choosing a folder requires starting autosave, then local edits are copied automatically and disconnect leaves files intact',async()=>{
 const folder=new MemoryDirectory('My notes');window.showDirectoryPicker=async()=>folder;
 let snapshot={doc:withNodes(empty(),[bullet('q',{text:'Original'})]),assets:new Map()};snapshot.doc.web.deviceId='test-device';let model;
 function Harness(){model=useFolderStorage({revision:snapshot.doc.revision,saved:true,getSnapshot:()=>snapshot,flush:async()=>{},onImport:async()=>{}});return React.createElement(FolderStoragePanel,{model});}
 const root=createRoot(document.getElementById('toolbar'));const wait=async predicate=>{for(let i=0;i<200;i++){let ready=false;await act(async()=>{ready=await predicate();if(!ready)await new Promise(resolve=>setTimeout(resolve,20));});if(ready)return;}throw Error('Timed out waiting for folder copy');};
 await act(async()=>root.render(React.createElement(Harness)));await act(async()=>model.connect());assert.equal(model.enabled,false);assert.equal(folder.entries.size,0);
 await act(async()=>model.start());assert.equal(model.enabled,true);const dir=await folder.getDirectoryHandle('Remo');let file=await dir.getFileHandle('device-test-device.remo.zip');assert.equal((await parseArchive(await file.getFile())).doc.tables.bullets[0].text,'Original');
 snapshot={...snapshot,doc:{...snapshot.doc,revision:1,tables:{...snapshot.doc.tables,bullets:snapshot.doc.tables.bullets.map(n=>({...n,text:'Updated automatically'}))}}};
 await act(async()=>root.render(React.createElement(Harness)));
 await wait(async()=>{try{return (await parseArchive(await file.getFile())).doc.tables.bullets[0].text==='Updated automatically';}catch{return false;}});
 assert.ok(dir.entries.has('device-test-device.previous.remo.zip'));
 await act(async()=>model.disconnect());assert.equal(model.name,'');assert.equal(dir.entries.size,2);
 await act(async()=>root.unmount());dom.window.close();
});
