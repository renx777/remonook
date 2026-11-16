import {memo,useEffect,useMemo,useRef,useState} from 'react';
import {socialPost,socialPostHeight,resolveSocialEmbed} from './social-posts.mjs';
import {ExternalLink,RefreshCw,EyeOff,Eye} from 'lucide-react';
import './social-post.css';
type RedditPreview={title:string;author:string;community:string;text:string;truncated:boolean;url:string};
/** Provider frames are isolated; Reddit's public feed is rendered as plain text. */
export const SocialPost=memo(function SocialPost({url}:{url:string}) {
 const post=useMemo(()=>socialPost(url),[url]);
 const root=useRef<HTMLDivElement>(null),frame=useRef<HTMLIFrameElement>(null);
 const [near,setNear]=useState(false),[hidden,setHidden]=useState(false),[attempt,setAttempt]=useState(0),[phase,setPhase]=useState<'loading'|'ready'|'error'>('loading'),[src,setSrc]=useState<string|null>(null),[height,setHeight]=useState(320),[dark,setDark]=useState(false),[offline,setOffline]=useState(()=>navigator.onLine===false),[reddit,setReddit]=useState<RedditPreview|null>(null),[live,setLive]=useState(false),[expanded,setExpanded]=useState(false);
 useEffect(()=>{
  const el=root.current;if(!el)return;const app=el.closest('.app'),media=window.matchMedia('(prefers-color-scheme: dark)');
  const update=()=>{const theme=app?.getAttribute('data-theme');setDark(theme==='Dark'||(!theme||theme==='System')&&media.matches);};update();
  const observer=new MutationObserver(update);if(app)observer.observe(app,{attributes:true,attributeFilter:['data-theme']});media.addEventListener?.('change',update);
  return()=>{observer.disconnect();media.removeEventListener?.('change',update);};
 },[]);
 useEffect(()=>{if(!root.current)return;if(typeof IntersectionObserver==='undefined'){setNear(true);return;}const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setNear(true);observer.disconnect();}},{rootMargin:'160px'});observer.observe(root.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{const update=()=>setOffline(navigator.onLine===false);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
 useEffect(()=>{
  if(!post||!near||hidden||offline)return;
  const controller=new AbortController();let alive=true;setPhase('loading');setSrc(null);setReddit(null);setExpanded(false);setHeight(post.kind==='tiktok'?580:post.kind==='instagram'?540:320);
  // A short delay coalesces URL typing before contacting a provider.
  const start=setTimeout(()=>{void(async()=>{try{
   if(post.kind==='reddit'&&!live){const response=await fetch('/api/reddit-preview?url='+encodeURIComponent(post.href),{signal:controller.signal,credentials:'omit'});if(!response.ok)throw Error('Unavailable');const value=await response.json();if(typeof value.title!=='string'||typeof value.text!=='string'||value.text.length>6000||typeof value.url!=='string'||socialPost(value.url)?.kind!=='reddit')throw Error('Invalid preview');if(alive){setReddit(value);setPhase('ready');}}
   else{const embed=await resolveSocialEmbed(post,{signal:controller.signal});if(alive)setSrc(embed);}
  }catch{if(alive)setPhase('error');}})();},250);
  const timeout=setTimeout(()=>{if(alive){controller.abort();setPhase(current=>current==='ready'?current:'error');}},12000);
  return()=>{alive=false;controller.abort();clearTimeout(start);clearTimeout(timeout);};
 },[post,near,hidden,offline,attempt,live]);
 useEffect(()=>{
  if(!post||!src)return;const origin=new URL(src).origin;
  const receive=(event:MessageEvent)=>{if(event.source!==frame.current?.contentWindow||event.origin!==origin)return;const value=socialPostHeight(event.data,post.kind);if(value!==null){setHeight(value);setPhase('ready');}if(post.kind==='tiktok'&&event.data?.['x-tiktok-player']===true){if(event.data.type==='onPlayerReady')setPhase('ready');if(event.data.type==='onPlayerError')setPhase('error');}};
  window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);
 },[post,src]);
 if(!post)return null;
 const address=src?new URL(src):null;if(address&&dark)address.searchParams.set(post.kind==='bluesky'?'colorMode':'theme','dark');
 return <div ref={root} className={'social-post'+(reddit&&!live?' social-post-text':'')} data-provider={post.kind} onPointerDown={e=>e.stopPropagation()}>
  {!hidden&&!offline&&near&&<>
   {phase==='loading'&&<div className="social-post-loading" role="status"><span/><span/><small>Loading {post.provider} preview…</small></div>}
   {reddit&&phase==='ready'&&!live&&<article className="social-post-copy"><p className="social-post-byline">{reddit.community}{reddit.author?' · '+reddit.author:''}</p><h3>{reddit.title}</h3><p className={expanded?'':'is-clamped'}>{reddit.text||'This post links to media. Open the original to view it.'}</p>{reddit.text.length>350&&<button type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'Show less':'Read more'}</button>}{expanded&&reddit.truncated&&<small>Excerpt · open the original for the full post.</small>}</article>}
   {address&&phase!=='error'&&<iframe ref={frame} src={address.href} title={post.title} height={height} data-pending={phase==='loading'} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" allow="fullscreen; encrypted-media; picture-in-picture" allowFullScreen onLoad={()=>{if(post.kind==='instagram')setPhase('ready');}} onError={()=>setPhase('error')}/>}
   {phase==='error'&&<p className="social-post-unavailable" role="status">{post.provider} hasn’t made this preview available. Your link is kept.</p>}
  </>}
  {!hidden&&offline&&<p className="social-post-unavailable" role="status">Connect to view the post. Your saved link and notes are available.</p>}
  <footer><a href={reddit?.url||post.href} target="_blank" rel="noopener noreferrer" title={'Open original on '+post.provider}>{post.provider}<ExternalLink size={12}/></a>{post.kind==='reddit'&&!hidden&&<button className="social-post-mode" type="button" onClick={()=>setLive(v=>!v)}>{live?'Text preview':'Live embed'}</button>}<span className="social-post-actions">{!hidden&&<button type="button" aria-label={'Reload '+post.provider+' preview'} onClick={()=>setAttempt(v=>v+1)}><RefreshCw size={14}/></button>}<button type="button" onClick={()=>setHidden(v=>!v)} aria-label={(hidden?'Show':'Hide')+' '+post.provider+' preview'}>{hidden?<><Eye size={14}/><span>Show preview</span></>:<EyeOff size={14}/>}</button></span></footer>
 </div>;
});
