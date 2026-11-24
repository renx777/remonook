import {createContext,useContext} from 'react';
import type {Workspace} from './data';
import {propertyDefinitions,propertyValue,propertyDisplay} from './note-properties.mjs';
import './pkm.css';
export const NoteMetadataContext=createContext<{doc:Workspace;disabled:boolean;properties:(id:string)=>void;templates:(id:string|null)=>void}|null>(null);
export function NoteMetadataBar({id}:{id:string}){
 const context=useContext(NoteMetadataContext);if(!context)return null;
 const values=propertyDefinitions(context.doc).map(def=>({def,value:propertyValue(context.doc,id,def.id)})).filter(v=>v.value!==null);
 return <div className="note-metadata-bar"><button disabled={context.disabled} onClick={()=>context.properties(id)}>Properties{values.length?` · ${values.length}`:''}</button><button disabled={context.disabled} onClick={()=>context.templates(id)}>Use template…</button>{values.slice(0,5).map(({def,value})=><button className="property-chip" key={def.id} onClick={()=>context.properties(id)}><span>{def.name}</span> {propertyDisplay(context.doc,def,value)}</button>)}</div>;
}
