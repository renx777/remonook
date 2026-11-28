import {useEffect,useState} from 'react';
import {accountLocalKey} from './data';
/**
 * Movie provider keys belong to this device and this account. They are never written into notes, synced,
 * backed up or sent to RemoNook: only to the provider itself. "Remember" keeps them in this browser's
 * storage for this account; otherwise they last until the app reloads.
 */
export type MovieProvider='tmdb'|'omdb';
const session=new Map<string,string>();
const slot=(p:MovieProvider)=>accountLocalKey('remo-movie-key-'+p);
const notify=()=>window.dispatchEvent(new Event('remo-movie-keys'));
export function movieKey(p:MovieProvider){const k=slot(p);if(session.has(k))return session.get(k)||'';try{return localStorage.getItem(k)||'';}catch{return '';}}
export function keyRemembered(p:MovieProvider){try{return !!localStorage.getItem(slot(p));}catch{return false;}}
export function saveMovieKey(p:MovieProvider,key:string,remember:boolean){const k=slot(p),v=key.trim();session.set(k,v);try{if(remember&&v)localStorage.setItem(k,v);else localStorage.removeItem(k);}catch{}notify();}
export function forgetMovieKey(p:MovieProvider){const k=slot(p);session.delete(k);try{localStorage.removeItem(k);}catch{}notify();}
export function preferredProvider():MovieProvider|null{return movieKey('tmdb')?'tmdb':movieKey('omdb')?'omdb':null;}
const FIELDS=()=>accountLocalKey('remo-movie-fields');
export function movieFieldPrefs(fallback:string[]){try{const v=JSON.parse(localStorage.getItem(FIELDS())||'null');return Array.isArray(v)?v.filter(x=>typeof x==='string'):fallback;}catch{return fallback;}}
export function saveMovieFieldPrefs(v:string[]){try{localStorage.setItem(FIELDS(),JSON.stringify(v));}catch{}}
/** Re-renders when a key is saved or forgotten anywhere in the app. */
export function useMovieKeys(){const [,set]=useState(0);useEffect(()=>{const f=()=>set(n=>n+1);window.addEventListener('remo-movie-keys',f);return ()=>window.removeEventListener('remo-movie-keys',f);},[]);return {tmdb:movieKey('tmdb'),omdb:movieKey('omdb'),provider:preferredProvider()};}
