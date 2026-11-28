import {noteTrait,setNoteTrait,isTraitsBlock,newCollectionItem} from './traits-block.mjs';
import {withNodes} from './workspace-nodes.mjs';
export const movieSearchEnabled=text=>/(?:^|\s)#moviesearch(?=$|\s|[.,!?])/i.test(text||'');
export function movieQuery(node,doc){const title=node.text.replace(/#[\w-]+/g,'').replace(/:[a-z0-9_]+:/gi,'').replace(/\s*\((\d{4})\)\s*$/,'').trim();const year=noteTrait(doc,node.mirrorSourceId||node.id,'Year')||node.text.match(/\((\d{4})\)/)?.[1]||'';return {title,year:/^\d{4}$/.test(year)?year:''};}
export function movieTargets(doc,parent){const seen=new Set();return doc.tables.bullets.filter(n=>n.parentId===parent&&!isTraitsBlock(n)).map(n=>doc.tables.bullets.find(b=>b.id===(n.mirrorSourceId||n.id))).filter(n=>n&&!seen.has(n.id)&&seen.add(n.id));}
const clean=v=>typeof v==='string'&&v!=='N/A'?v:'';
export function normalizeMovie(provider,m){return provider==='tmdb'?{id:String(m.id),title:clean(m.title),year:clean(m.release_date).slice(0,4),poster:/^\/[\w.-]+$/.test(m.poster_path||'')?'https://image.tmdb.org/t/p/w500'+m.poster_path:'',url:'https://www.themoviedb.org/movie/'+encodeURIComponent(m.id),plot:clean(m.overview),popularity:Number(m.popularity)||0}:{id:clean(m.imdbID),title:clean(m.Title),year:clean(m.Year),poster:/^https:\/\//.test(clean(m.Poster))?m.Poster:'',url:'https://www.imdb.com/title/'+encodeURIComponent(m.imdbID)+'/',plot:clean(m.Plot),director:clean(m.Director)};}
export async function searchMovies(provider,key,title,year='',signal){if(!key.trim())throw Error('Enter your API key first.');if(!title.trim())return [];const u=new URL(provider==='tmdb'?'https://api.themoviedb.org/3/search/movie':'https://www.omdbapi.com/');const bearer=provider==='tmdb'&&isTmdbToken(key);if(!bearer)u.searchParams.set(provider==='tmdb'?'api_key':'apikey',key.trim());u.searchParams.set(provider==='tmdb'?'query':'s',title);if(year)u.searchParams.set(provider==='tmdb'?'primary_release_year':'y',year);if(provider==='omdb')u.searchParams.set('type','movie');let r;try{r=await fetch(u,{signal,redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',...(bearer?{headers:{Authorization:'Bearer '+key.trim(),accept:'application/json'}}:{})});}catch(e){if(e.name==='AbortError')throw e;throw Error('Could not reach the movie provider. Check your connection and browser access.');}if(!r.ok)throw Error(r.status===401||r.status===403?'The provider rejected this API key.':r.status===429?'Provider rate limit reached. Try again later.':'Movie provider request failed.');const data=await r.json();if(provider==='omdb'&&data.Response==='False'){if(/not found|too many results/i.test(data.Error||''))return [];throw Error('OMDb rejected the request. Check the key and its allowance.');}return (provider==='tmdb'?data.results||[]:data.Search||[]).slice(0,10).map(m=>normalizeMovie(provider,m));}
export function applyMoviePosters(doc,proposals){let next=doc;for(const p of proposals){const node=doc.tables.bullets.find(n=>n.id===p.id);if(!node||node.text!==p.text||(noteTrait(doc,p.id,'Poster')||'')!==p.before)throw Error('A target note or Poster changed. Search again before applying.');if(!/^https:\/\//.test(p.movie.poster))throw Error('This result has no poster URL.');next=setNoteTrait(next,p.id,'Poster',p.movie.poster);}return next;}

// ── MovieSearch v2: details, matching and Trait mapping ──
/** TMDB shows two credentials: a short v3 "API Key" and a long v4 "Read Access Token" (a JWT). Both work. */
export const isTmdbToken=key=>/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(String(key||'').trim());
async function getJson(u,provider,key,signal){
 const bearer=provider==='tmdb'&&isTmdbToken(key);if(!bearer)u.searchParams.set(provider==='tmdb'?'api_key':'apikey',key.trim());
 let r;try{r=await fetch(u,{signal,redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',...(bearer?{headers:{Authorization:'Bearer '+key.trim(),accept:'application/json'}}:{})});}
 catch(e){if(e.name==='AbortError')throw e;throw Error('Could not reach the movie provider. Check your connection.');}
 if(!r.ok)throw Error(r.status===401||r.status===403?'The provider rejected this API key.':r.status===429?'Provider rate limit reached. Try again in a minute.':r.status===404?'That movie was not found.':'Movie provider request failed.');
 const data=await r.json();if(provider==='omdb'&&data.Response==='False')throw Error(/invalid api key/i.test(data.Error||'')?'The provider rejected this API key.':'OMDb could not find that movie.');return data;
}
/** Checks a key with one cheap request. */
export async function testMovieKey(provider,key,signal){
 if(!String(key||'').trim())throw Error('Paste a key first.');
 if(provider==='tmdb')await getJson(new URL('https://api.themoviedb.org/3/configuration'),'tmdb',key,signal);
 else await getJson(Object.assign(new URL('https://www.omdbapi.com/'),{search:'?i=tt0084787'}),'omdb',key,signal);
 return true;
}
/** Full details for one movie: director, genres, runtime and rating need a second request. */
export async function movieDetails(provider,key,id,signal){
 if(provider==='tmdb'){
  if(!/^\d+$/.test(String(id)))throw Error('Not a TMDB movie id.');
  const u=new URL('https://api.themoviedb.org/3/movie/'+id);u.searchParams.set('append_to_response','credits');
  const m=await getJson(u,'tmdb',key,signal),base=normalizeMovie('tmdb',m);
  return {...base,director:(m.credits?.crew||[]).filter(c=>c.job==='Director').map(c=>c.name).slice(0,2).join(', '),genres:(m.genres||[]).map(g=>g.name).slice(0,3).join(', '),runtime:m.runtime?m.runtime+' min':'',rating:m.vote_count?String(Math.round(m.vote_average*10)/10):''};
 }
 if(!/^tt\d+$/.test(String(id)))throw Error('Not an IMDb id.');
 const u=new URL('https://www.omdbapi.com/');u.searchParams.set('i',id);u.searchParams.set('plot','short');
 const m=await getJson(u,'omdb',key,signal),base=normalizeMovie('omdb',m);
 const n=v=>typeof v==='string'&&v!=='N/A'?v:'';
 return {...base,year:n(m.Year).slice(0,4),genres:n(m.Genre).split(', ').slice(0,3).join(', '),runtime:n(m.Runtime),rating:n(m.imdbRating)};
}
/** Titles compared the way people write them: case, accents, punctuation and a leading article ignored. */
export const normTitle=t=>String(t||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/^(the|a|an) /,'');
/** Picks the right result for a note: exact title (and year when known) wins; among several, a clearly more popular one. */
export function bestMatch(results,{title,year=''}){
 const want=normTitle(title),near=m=>!year||!m.year||Math.abs(Number(m.year)-Number(year))<=1;
 const exact=results.filter(m=>normTitle(m.title)===want&&near(m));
 const ranked=[...exact].sort((a,b)=>(b.year===year)-(a.year===year)||(b.popularity||0)-(a.popularity||0));
 if(ranked.length===1||(ranked.length>1&&(ranked[0].year===year&&ranked[1].year!==year||(ranked[0].popularity||0)>=2*(ranked[1].popularity||0)+1)))return {match:ranked[0],confidence:'exact',candidates:results.slice(0,3)};
 if(ranked.length>1)return {match:null,confidence:'ambiguous',candidates:ranked.slice(0,3)};
 const loose=results.filter(m=>(normTitle(m.title).startsWith(want)||want.startsWith(normTitle(m.title)))&&near(m)&&year);
 if(loose.length===1)return {match:loose[0],confidence:'likely',candidates:results.slice(0,3)};
 return {match:null,confidence:results.length?'ambiguous':'none',candidates:results.slice(0,3)};
}
/** Traits RemoNook can fill. The note's own Rating stays yours; the provider score is a separate Trait. */
export const MOVIE_FIELDS=[['Cover','poster','Poster image'],['Year','year','Year'],['Director','director','Director'],['Genre','genres','Genres'],['Runtime','runtime','Runtime'],['TMDB rating','rating','Provider rating'],['Link','url','Link to the movie page']];
export const DEFAULT_MOVIE_FIELDS=MOVIE_FIELDS.map(([k])=>k);
const fieldKey=(provider,k)=>k==='TMDB rating'&&provider==='omdb'?'IMDb rating':k==='Link'?(provider==='omdb'?'IMDb':'TMDB'):k;
/** The id a note was matched to before, read from its TMDB/IMDb Trait, so later updates are exact. */
export function savedMovieId(doc,noteId,provider){
 const v=noteTrait(doc,noteId,provider==='omdb'?'IMDb':'TMDB')||'';
 return provider==='omdb'?(v.match(/(tt\d{5,})/)?.[1]||''):(v.match(/themoviedb\.org\/movie\/(\d+)/)?.[1]||'');
}
/** Planned Trait changes for one note. Fill-missing by default; overwrite replaces existing values. */
export function planMovieTraits(doc,noteId,provider,movie,fields=DEFAULT_MOVIE_FIELDS,overwrite=false){
 const changes=[];
 for(const [k,prop] of MOVIE_FIELDS){if(!fields.includes(k))continue;let key=fieldKey(provider,k);const after=String(movie[prop]||'').trim();if(!after)continue;
  // An existing Poster Trait is the cover: update it instead of adding a second image.
  if(key==='Cover'&&noteTrait(doc,noteId,'Cover')==null&&noteTrait(doc,noteId,'Poster')!=null)key='Poster';
  const before=noteTrait(doc,noteId,key)??'';if(before===after||(before&&!overwrite))continue;changes.push({key,before,after});}
 return changes;
}
/** Applies reviewed plans in one change. A note whose title changed since review is refused, not overwritten. */
export function applyMoviePlans(doc,plans){
 let next=doc;
 for(const p of plans){const node=next.tables.bullets.find(n=>n.id===p.id);if(!node||node.text!==p.text)throw Error('A movie note changed while you were reviewing. Run the update again.');
  for(const c of p.changes)if((noteTrait(next,p.id,c.key)??'')===c.before)next=setNoteTrait(next,p.id,c.key,c.after);}
 return next;
}
/** A new movie note in a collection, titled and filled with the chosen Traits. */
export function createMovieNote(doc,parentId,provider,movie,fields=DEFAULT_MOVIE_FIELDS,make){
 const keys=MOVIE_FIELDS.filter(([k,p])=>fields.includes(k)&&movie[p]).map(([k])=>fieldKey(provider,k));
 const r=newCollectionItem(doc,parentId,[],make);
 let next=withNodes(r.doc,r.doc.tables.bullets.map(n=>n.id===r.id?{...n,text:movie.title||'Untitled movie'}:n));
 // newCollectionItem leaves one empty Trait row; fill the planned Traits after removing it.
 const block=next.tables.bullets.find(n=>n.parentId===r.id&&n.traitsBlock);if(block)next=withNodes(next,next.tables.bullets.filter(n=>!(n.parentId===block.id&&!n.text)));
 for(const c of planMovieTraits(next,r.id,provider,movie,fields,true))next=setNoteTrait(next,r.id,c.key,c.after,make);
 return {doc:next,id:r.id,keys};
}
/** Collections that offer movie lookups: tagged #MovieSearch or using the Movie shelf recipe. */
export const movieCollection=(doc,id,recipe)=>recipe==='movie'||movieSearchEnabled(doc.tables.bullets.find(n=>n.id===id)?.text);
