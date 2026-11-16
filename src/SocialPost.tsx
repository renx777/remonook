import {memo,useEffect,useMemo,useRef,useState} from 'react';
import {socialPost,socialPostHeight} from './social-posts.mjs';
import {ExternalLink,RefreshCw,EyeOff} from 'lucide-react';
import './social-post.css';

/** Provider-owned, isolated embeds. No remote markup or scripts enter the note DOM. */
export const SocialPost=memo(function SocialPost({url}:{url:string}) {
  const post=useMemo(()=>socialPost(url),[url]);
  const root=useRef<HTMLDivElement>(null), frame=useRef<HTMLIFrameElement>(null);
  const [near,setNear]=useState(false),[hidden,setHidden]=useState(false),[attempt,setAttempt]=useState(0),[slow,setSlow]=useState(false),[delivered,setDelivered]=useState(false),[height,setHeight]=useState(520),[dark,setDark]=useState(false),[offline,setOffline]=useState(()=>navigator.onLine===false);
  useEffect(()=>{
    const el=root.current;if(!el)return;
    const theme=el.closest('.app'), media=window.matchMedia('(prefers-color-scheme: dark)');
    const update=()=>{const value=theme?.getAttribute('data-theme');setDark(value==='Dark'||(!value||value==='System')&&media.matches);};update();
    const observer=new MutationObserver(update);if(theme)observer.observe(theme,{attributes:true,attributeFilter:['data-theme']});
    media.addEventListener?.('change',update);return()=>{observer.disconnect();media.removeEventListener?.('change',update);};
  },[]);
  useEffect(()=>{
    if(!root.current)return;
    if(typeof IntersectionObserver==='undefined'){setNear(true);return;}
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setNear(true);observer.disconnect();}},{rootMargin:'160px'});
    observer.observe(root.current);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{const update=()=>setOffline(navigator.onLine===false);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
  useEffect(()=>{
    setSlow(false);if(!near||hidden||offline||delivered)return;
    const timeout=setTimeout(()=>setSlow(true),12000);return()=>clearTimeout(timeout);
  },[near,hidden,offline,attempt,url,delivered]);
  useEffect(()=>{
    if(!post)return;
    const origin=new URL(post.embed).origin;
    const resize=(event:MessageEvent)=>{
      if(event.source!==frame.current?.contentWindow||event.origin!==origin)return;
      const value=socialPostHeight(event.data,post.kind);if(value!==null)setHeight(value);
    };
    window.addEventListener('message',resize);return()=>window.removeEventListener('message',resize);
  },[post]);
  if(!post)return null;
  const src=new URL(post.embed);if(dark)src.searchParams.set('theme','dark');
  return <div ref={root} className="social-post" data-provider={post.kind} onPointerDown={e=>e.stopPropagation()}>
    <header><span>{post.provider}<small>Live post</small></span><button type="button" onClick={()=>setHidden(v=>!v)} aria-label={(hidden?'Show':'Hide')+' '+post.provider+' preview'}>{hidden?'Show preview':<><EyeOff size={14}/><span>Hide</span></>}</button>{!hidden&&<button type="button" aria-label={"Reload "+post.provider+" preview"} onClick={()=>{setDelivered(false);setAttempt(v=>v+1);}}><RefreshCw size={14}/></button>}</header>
    {!hidden&&!offline&&near&&<iframe key={attempt} ref={frame} src={src.href} title={post.title} height={height} loading="lazy" referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" allow="fullscreen; encrypted-media; picture-in-picture" allowFullScreen onLoad={()=>setDelivered(true)} onError={()=>setSlow(true)}/>}
    {!hidden&&offline&&<p role="status">Connect to the internet to view this post. Your saved link and notes are available.</p>}
    {!hidden&&!offline&&slow&&<p className="social-post-status" role="status">Blank preview? The post may be private, unavailable or blocked by your browser. <button type="button" onClick={()=>{setDelivered(false);setAttempt(v=>v+1);}}><RefreshCw size={13}/>Retry</button></p>}
    <footer><a href={post.href} target="_blank" rel="noopener noreferrer">Open on {post.provider}<ExternalLink size={13}/></a><small>Live preview · public posts only</small></footer>
  </div>;
});
