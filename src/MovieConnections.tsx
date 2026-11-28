import {useContext,useRef,useState} from 'react';
import {NoteMetadataContext} from './NoteMetadataContext';
import {testMovieKey,isTmdbToken} from './movie-search.mjs';
import {movieKey,keyPlace,saveMovieKey,forgetLocalMovieKey,setSyncedKey,syncedMovieKeys,useMovieKeys,type MovieProvider,type KeyPlace} from './movie-keys';
import './movie-search.css';
const INFO:Record<MovieProvider,{name:string;help:string;link:string}>={
 tmdb:{name:'TMDB',help:'Paste the API Key or the API Read Access Token from your TMDB account settings.',link:'https://www.themoviedb.org/settings/api'},
 omdb:{name:'OMDb',help:'Paste the key OMDb emailed you.',link:'https://www.omdbapi.com/apikey.aspx'},
};
const PLACES:[KeyPlace,string][]=[['device','This device'],['synced','All my devices'],['session','Until reload']];
function ProviderRow({provider}:{provider:MovieProvider}){
 useMovieKeys();
 const ctx=useContext(NoteMetadataContext),saved=movieKey(provider),place=keyPlace(provider),[draft,setDraft]=useState(''),[target,setTarget]=useState<KeyPlace>(()=>place||'device'),[state,setState]=useState<{busy?:boolean;ok?:string;error?:string}>({}),abort=useRef<AbortController|null>(null),[replacing,setReplacing]=useState(false);
 const info=INFO[provider],editing=!saved||replacing,canSync=!!ctx?.save&&!ctx.disabled;
 // Puts the key in exactly one place, removing it from the others.
 const store=async(key:string,where:KeyPlace)=>{
  if(where==='synced'){if(!ctx?.save)throw Error('Syncing is unavailable right now.');await ctx.save(d=>setSyncedKey(d,provider,key));forgetLocalMovieKey(provider);}
  else{saveMovieKey(provider,key,where==='device');if(syncedMovieKeys(ctx?.doc)[provider]&&ctx?.save)await ctx.save(d=>setSyncedKey(d,provider,''));}
 };
 const connect=async(key:string,where:KeyPlace)=>{abort.current?.abort();const c=new AbortController();abort.current=c;setState({busy:true});try{await testMovieKey(provider,key,c.signal);await store(key,where);setDraft('');setReplacing(false);setState({ok:'Connected'});}catch(e:any){if(e.name!=='AbortError')setState({error:e.message});}};
 const move=async(where:KeyPlace)=>{setTarget(where);setState({});try{await store(saved,where);}catch(e:any){setState({error:e.message});}};
 const forget=async()=>{setState({});forgetLocalMovieKey(provider);try{if(syncedMovieKeys(ctx?.doc)[provider]&&ctx?.save)await ctx.save(d=>setSyncedKey(d,provider,''));}catch(e:any){setState({error:e.message});}};
 const placeChooser=(value:KeyPlace,onPick:(p:KeyPlace)=>void)=><div className="rn-seg movie-place" role="group" aria-label={info.name+' key location'}>{PLACES.map(([p,label])=><button type="button" key={p} aria-pressed={value===p} disabled={p==='synced'&&!canSync} onClick={()=>onPick(p)}>{label}</button>)}</div>;
 const where=place==='synced'?'synced to your devices':place==='device'?'remembered on this device':'until reload';
 return <div className="movie-connection" aria-label={info.name+' connection'} role="group">
  <div className="movie-connection-head"><strong>{info.name}</strong>{saved?<span className="movie-connection-status is-on">● Connected · {where}</span>:<span className="movie-connection-status">Not connected</span>}</div>
  {editing?<form onSubmit={e=>{e.preventDefault();void connect(draft,target);}}>
   <input type="password" autoComplete="off" spellCheck={false} aria-label={info.name+' key'} placeholder={provider==='tmdb'?'API Key or Read Access Token':'API key'} value={draft} onChange={e=>{setDraft(e.target.value);setState({});}}/>
   <button className="movie-btn primary" disabled={state.busy||!draft.trim()}>{state.busy?'Checking…':'Connect'}</button>{replacing&&<button type="button" className="movie-btn" onClick={()=>{setReplacing(false);setDraft('');}}>Cancel</button>}
   <div className="movie-place-row"><span>Keep the key on</span>{placeChooser(target,setTarget)}</div>
   <small>{target==='synced'?'Synced with your account so every signed-in device can use it. It is left out of backup files, but anyone who can open this account can read it.':target==='device'?'Stored on this device for this account only. Never synced or backed up.':'Forgotten when the app reloads.'} {info.help} {provider==='tmdb'&&draft&&<b>{isTmdbToken(draft)?'Read Access Token detected.':'API Key detected.'}</b>} <a href={info.link} target="_blank" rel="noreferrer">Get a key</a></small>
  </form>:<>
   <div className="movie-place-row"><span>Keep the key on</span>{placeChooser(place||'session',p=>void move(p))}</div>
   <div className="movie-connection-actions"><button className="movie-btn" disabled={state.busy} onClick={()=>void connect(saved,place||'session')}>{state.busy?'Checking…':'Test connection'}</button><button className="movie-btn" onClick={()=>{setTarget(place||'device');setReplacing(true);}}>Replace key</button><button className="movie-btn danger" onClick={()=>void forget()}>Forget</button></div></>}
  {state.ok&&<p role="status" className="movie-ok">{state.ok}</p>}{state.error&&<p role="alert" className="movie-error">{state.error}</p>}
 </div>;
}
/** Settings → Connections: movie metadata providers. */
export function MovieConnections(){
 return <section className="movie-connections" aria-label="Movie metadata">
  <h3>Movies</h3><p className="movie-muted">Add movies and fill their Traits from a movie database. Keys go only to the provider. Keep each one on this device, or sync it to all your signed-in devices.</p>
  <ProviderRow provider="tmdb"/><ProviderRow provider="omdb"/>
  <p className="movie-muted movie-credit">This product uses the TMDB API but is not endorsed or certified by TMDB. OMDb data is provided by the OMDb API.</p>
 </section>;
}
