import {createContext} from 'react';
import type {Workspace} from './data';
export type MetadataContext={doc:Workspace;disabled:boolean;properties:(id:string)=>void;templates:(id:string|null)=>void;save?:(update:(doc:Workspace)=>Workspace)=>Promise<void>;openNote?:(id:string)=>void;studying?:boolean;scope?:string};
export const NoteMetadataContext=createContext<MetadataContext|null>(null);
export {NookTraitsPanel as NoteMetadataBar,NookTraitsEye,NookTraitsCollection,useNookTraits} from './NookTraits';
