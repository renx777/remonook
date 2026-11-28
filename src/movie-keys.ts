import {useContext,useEffect,useState} from 'react';
import {accountLocalKey,type Workspace} from './data';
import {NoteMetadataContext} from './NoteMetadataContext';
/**
 * Movie provider keys, in one of three places, chosen per provider:
 *  - "device": this browser's storage for this account (default). Never synced or backed up.
 *  - "synced": the account's synced settings (`web.providerKeys`), so every signed-in device has it.
 *    Left out of backup files. Anyone who can open this account's notes can read it.
 *  - session only: until the app reloads.
 * A key is only ever sent to its provider.
 */
export type MovieProvider='tmdb'|'omdb';
export type KeyPlace='device'|'synced'|'session';
const session=new Map<string,string>();
let synced:Record<string,{key?:string}>={};
const slot=(p:MovieProvider)=>accountLocalKey('remo-movie-key-'+p);
const notify=()=>window.dispatchEvent(new Event('remo-movie-keys'));
const local=(p:MovieProvider)=>{try{return localStorage.getItem(slot(p))||'';}catch{return '';}};
export const syncedMovieKeys=(doc?:Workspace)=>((doc?.web as any)?.providerKeys||{}) as Record<string,{key?:string;updatedAt?:number}>;
export function movieKey(p:MovieProvider){const k=slot(p);if(session.has(k))return session.get(k)||'';return local(p)||String(synced[p]?.key||'');}
export function keyPlace(p:MovieProvider):KeyPlace|null{if(session.has(slot(p))&&session.get(slot(p)))return local(p)?'device':synced[p]?.key?'synced':'session';return local(p)?'device':synced[p]?.key?'synced':null;}
export function keyRemembered(p:MovieProvider){return keyPlace(p)==='device'||keyPlace(p)==='synced';}
/** Device and session places. The synced place is written through the document; see `setSyncedKey`. */
export function saveMovieKey(p:MovieProvider,key:string,remember:boolean){const k=slot(p),v=key.trim();session.set(k,v);try{if(remember&&v)localStorage.setItem(k,v);else localStorage.removeItem(k);}catch{}notify();}
export function forgetLocalMovieKey(p:MovieProvider){const k=slot(p);session.delete(k);try{localStorage.removeItem(k);}catch{}notify();}
/** Returns the document with this provider's synced key set (or removed when key is empty). */
export function setSyncedKey(doc:Workspace,p:MovieProvider,key:string):Workspace{
 const all={...syncedMovieKeys(doc)};if(key.trim())all[p]={key:key.trim(),updatedAt:Date.now()};else delete all[p];
 return {...doc,web:{...doc.web,providerKeys:all} as any};
}
export function preferredProvider():MovieProvider|null{return movieKey('tmdb')?'tmdb':movieKey('omdb')?'omdb':null;}
const FIELDS=()=>accountLocalKey('remo-movie-fields');
export function movieFieldPrefs(fallback:string[]){try{const v=JSON.parse(localStorage.getItem(FIELDS())||'null');return Array.isArray(v)?v.filter(x=>typeof x==='string'):fallback;}catch{return fallback;}}
export function saveMovieFieldPrefs(v:string[]){try{localStorage.setItem(FIELDS(),JSON.stringify(v));}catch{}}
/** Re-renders when a key changes on this device or arrives from another device through sync. */
export function useMovieKeys(){
 const ctx=useContext(NoteMetadataContext),[,set]=useState(0),remote=syncedMovieKeys(ctx?.doc);
 synced=remote;
 useEffect(()=>{const f=()=>set(n=>n+1);window.addEventListener('remo-movie-keys',f);return ()=>window.removeEventListener('remo-movie-keys',f);},[]);
 return {tmdb:movieKey('tmdb'),omdb:movieKey('omdb'),provider:preferredProvider()};
}
