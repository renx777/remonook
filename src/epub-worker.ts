import {parseEpub} from './epub-parser.mjs';
let units:{text:string;chapter:number}[]=[];
self.onmessage=async(event:MessageEvent)=>{const {id,type,bytes,unit}=event.data;try{if(type==='open'){units=await parseEpub(bytes);self.postMessage({id,total:units.length});}else{if(!Number.isInteger(unit)||!units[unit])throw Error('Passage not found.');self.postMessage({id,...units[unit]});}}catch(error){self.postMessage({id,error:(error as Error).message});}};
