import {useRef,useState} from 'react';
import {testMovieKey,isTmdbToken} from './movie-search.mjs';
import {movieKey,keyRemembered,saveMovieKey,forgetMovieKey,useMovieKeys,type MovieProvider} from './movie-keys';
import './movie-search.css';
const INFO:Record<MovieProvider,{name:string;help:string;link:string}>={
 tmdb:{name:'TMDB',help:'Paste the API Key or the API Read Access Token from your TMDB account settings.',link:'https://www.themoviedb.org/settings/api'},
 omdb:{name:'OMDb',help:'Paste the key OMDb emailed you.',link:'https://www.omdbapi.com/apikey.aspx'},
};
function ProviderRow({provider}:{provider:MovieProvider}){
 useMovieKeys();
 const saved=movieKey(provider),[draft,setDraft]=useState(''),[remember,setRemember]=useState(()=>keyRemembered(provider)||!saved),[state,setState]=useState<{busy?:boolean;ok?:string;error?:string}>({}),abort=useRef<AbortController|null>(null),[replacing,setReplacing]=useState(false);
 const info=INFO[provider],editing=!saved||replacing;
 const connect=async(key:string)=>{abort.current?.abort();const c=new AbortController();abort.current=c;setState({busy:true});try{await testMovieKey(provider,key,c.signal);saveMovieKey(provider,key,remember);setDraft('');setReplacing(false);setState({ok:'Connected'});}catch(e:any){if(e.name!=='AbortError')setState({error:e.message});}};
 return <div className="movie-connection" aria-label={info.name+' connection'} role="group">
  <div className="movie-connection-head"><strong>{info.name}</strong>{saved?<span className="movie-connection-status is-on">● Connected{keyRemembered(provider)?' · remembered on this device':' · until reload'}</span>:<span className="movie-connection-status">Not connected</span>}</div>
  {editing?<form onSubmit={e=>{e.preventDefault();void connect(draft);}}>
   <input type="password" autoComplete="off" spellCheck={false} aria-label={info.name+' key'} placeholder={provider==='tmdb'?'API Key or Read Access Token':'API key'} value={draft} onChange={e=>{setDraft(e.target.value);setState({});}}/>
   <label className="movie-remember"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>Remember on this device</label>
   <button className="movie-btn primary" disabled={state.busy||!draft.trim()}>{state.busy?'Checking…':'Connect'}</button>{replacing&&<button type="button" className="movie-btn" onClick={()=>{setReplacing(false);setDraft('');}}>Cancel</button>}
   <small>{info.help} {provider==='tmdb'&&draft&&<b>{isTmdbToken(draft)?'Read Access Token detected.':'API Key detected.'}</b>} <a href={info.link} target="_blank" rel="noreferrer">Get a key</a></small>
  </form>:<div className="movie-connection-actions"><button className="movie-btn" disabled={state.busy} onClick={()=>void connect(saved)}>{state.busy?'Checking…':'Test connection'}</button><button className="movie-btn" onClick={()=>setReplacing(true)}>Replace key</button><button className="movie-btn danger" onClick={()=>{forgetMovieKey(provider);setState({});}}>Forget</button></div>}
  {state.ok&&<p role="status" className="movie-ok">{state.ok}</p>}{state.error&&<p role="alert" className="movie-error">{state.error}</p>}
 </div>;
}
/** Settings → Connections: movie metadata providers. */
export function MovieConnections(){
 return <section className="movie-connections" aria-label="Movie metadata">
  <h3>Movies</h3><p className="movie-muted">Add movies and fill their Traits from a movie database. Your key stays on this device and goes only to the provider. It is never saved in notes, synced or backed up.</p>
  <ProviderRow provider="tmdb"/><ProviderRow provider="omdb"/>
  <p className="movie-muted movie-credit">This product uses the TMDB API but is not endorsed or certified by TMDB. OMDb data is provided by the OMDb API.</p>
 </section>;
}
