import {useEffect,useRef} from 'react';
import type {RecordData} from './data';
import {downloadNotoEmoji,getNotoEmoji,notoPosterPath,NOTO_CREDIT_PATH} from './noto-emojis.mjs';
type Options={emojis:RecordData[];assets:Map<string,Blob>;ready:boolean;store:(item:RecordData,files:Map<string,Blob>)=>Promise<void>};
// Old imports and incomplete caches can retain emoji records without their files.
// Recover only bundled catalog items, using the validated, allow-listed downloader.
export function useEmojiAssetRepair(options:Options){
 const latest=useRef(options);latest.current=options;
 const missing=options.ready?options.emojis.filter(item=>getNotoEmoji(item.token)&&(!options.assets.has('emoji/'+item.fileName)||!options.assets.has(notoPosterPath(item))||!options.assets.has(NOTO_CREDIT_PATH))).map(item=>item.token).sort():[];
 const key=JSON.stringify(missing);
 useEffect(()=>{
  const tokens:string[]=JSON.parse(key);if(!tokens.length)return;
  let stopped=false,busy=false,attempt=0,timer:ReturnType<typeof setTimeout>|undefined;
  const controller=new AbortController();
  const run=async()=>{
   if(stopped||busy||!navigator.onLine||!latest.current.ready)return;
   busy=true;
   try{
    let incomplete=false;
    for(const token of tokens){
     const item=latest.current.emojis.find(e=>e.token===token);if(!item)continue;
     const files=latest.current.assets;
     if(files.has('emoji/'+item.fileName)&&files.has(notoPosterPath(item))&&files.has(NOTO_CREDIT_PATH))continue;
     try{
      const recovered=await downloadNotoEmoji(item,controller.signal);
      if(stopped)return;
      await latest.current.store(item,recovered);
     }catch{if(stopped)return;incomplete=true;}
    }
    if(incomplete)throw Error('Emoji files are still pending.');
    attempt=0;
   }catch{
    if(!stopped)timer=setTimeout(()=>void run(),Math.min(30000,1000*2**Math.min(attempt++,5)));
   }finally{busy=false;}
  };
  const resume=()=>{if(timer)clearTimeout(timer);void run();};
  timer=setTimeout(()=>void run(),100);
  window.addEventListener('online',resume);window.addEventListener('focus',resume);
  return()=>{stopped=true;controller.abort();if(timer)clearTimeout(timer);window.removeEventListener('online',resume);window.removeEventListener('focus',resume);};
 },[key]);
}
