import {useEffect,useState} from 'react';

export function TypingWordmark(){
 const [text,setText]=useState('remo');
 useEffect(()=>{
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let timer:ReturnType<typeof setTimeout>,word='remo',target='remember more';
  const tick=()=>{
   if(motion.matches)return;
   if(word===target){target=target==='remo'?'remember more':'remo';timer=setTimeout(tick,2200);return;}
   if(!target.startsWith(word))word=word.slice(0,-1);
   else word=target.slice(0,word.length+1);
   setText(word);
   timer=setTimeout(tick,word===target?250:target.startsWith(word)?105:65);
  };
  const reset=()=>{clearTimeout(timer);word='remo';target='remember more';setText(motion.matches?'remember more':'remo');if(!motion.matches)timer=setTimeout(tick,2200);};
  reset();motion.addEventListener('change',reset);
  return()=>{clearTimeout(timer);motion.removeEventListener('change',reset);};
 },[]);
 return <span className="landing-wordmark" aria-label="Remo — remember more"><span aria-hidden="true">{text}<span className="wordmark-cursor"/></span></span>;
}
