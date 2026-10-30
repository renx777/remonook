import type {Mounted, MountOptions} from 'pele/lazy';

export const diagramOptions = {
  limit: 50_000, outputLimit: 4_000_000, maxEdges: 500,
  links: false, images: false, zoom: false,
} satisfies MountOptions;
export type DiagramState = {ready?: boolean; error?: string; renderer?: 'pele' | 'mermaid'};
type Pele = Pick<typeof import('pele/lazy'), 'load' | 'detectType' | 'mount'>;
type Dependencies = {pele:()=>Promise<Pele>; legacy:(source:string,id:string)=>Promise<string>};
let legacyReady: Promise<typeof import('mermaid')['default']> | undefined;
async function legacy(source:string,id:string) {
  legacyReady ??= import('mermaid').then(({default:mermaid})=>{
    mermaid.initialize({startOnLoad:false,securityLevel:'strict',suppressErrorRendering:true,theme:'neutral',maxTextSize:diagramOptions.limit,maxEdges:diagramOptions.maxEdges});
    return mermaid;
  }).catch(error=>{legacyReady=undefined;throw error;});
  return (await (await legacyReady).render(id,source)).svg;
}
const defaults:Dependencies={pele:()=>import('pele/lazy'),legacy};
const isLimit=(error:unknown)=>typeof error==='object'&&error!==null&&'code' in error&&error.code==='limit';
const invalid='Invalid Mermaid — edit the source to correct it.';
const tooLarge='This diagram exceeds the rendering limit. Reduce its size to display it.';

/** One mount per visible diagram. Cancelling a load never inserts stale SVG. */
export function mountDiagram(host:HTMLElement,source:string,id:string,onState:(state:DiagramState)=>void,deps:Dependencies=defaults) {
  let cancelled=false, fallback=false, mounted:Mounted|undefined, fontsObserver:MutationObserver|undefined;
  host.replaceChildren(); delete host.dataset.renderer; onState({});
  const dispose=()=>{fontsObserver?.disconnect();fontsObserver=undefined;mounted?.destroy();mounted=undefined;};
  const fail=(error:unknown)=>{
    if(cancelled||fallback)return;
    // Mount's initial error callback runs before its handle is returned.
    queueMicrotask(()=>{
      if(cancelled||fallback)return;
      fallback=true;dispose();host.replaceChildren();
      if(isLimit(error)){onState({error:tooLarge});return;}
      onState({});
      void (async()=>{
        try{
          const svg=await deps.legacy(source,id+'-legacy');
          if(cancelled)return;
          if(svg.length>diagramOptions.outputLimit){onState({error:tooLarge});return;}
          host.innerHTML=svg;host.dataset.renderer='mermaid';onState({ready:true,renderer:'mermaid'});
        }catch{if(!cancelled){host.replaceChildren();onState({error:invalid});}}
      })();
    });
  };
  if(source.length>diagramOptions.limit){onState({error:tooLarge});return()=>{cancelled=true;};}
  void (async()=>{
    try{
      const pele=await deps.pele();
      if(cancelled)return;
      await pele.load(pele.detectType(source));
      if(cancelled)return;
      // KaTeX is already the app's trusted math typesetter. Load only for labels
      // containing math, rather than making every diagram pay for it.
      const katex=source.includes('$$')?(await import('katex')).default:undefined;
      if(cancelled)return;
      const math = katex ? (tex:string,size:number)=>{
        const probe=host.ownerDocument.createElement('span');
        probe.style.cssText=`position:fixed;left:-100000px;top:0;visibility:hidden;display:inline-block;white-space:nowrap;font-size:${size}px`;
        try {
          probe.innerHTML=katex.renderToString(tex,{displayMode:true,throwOnError:true,trust:false,maxSize:20,maxExpand:1000,output:'mathml'});
          host.ownerDocument.body.append(probe);
          const expression=probe.querySelector('math');
          if(!expression)return null;
          const {width,height}=expression.getBoundingClientRect();
          return width>0&&height>0?{html:expression.outerHTML,width,height}:null;
        }catch{return null;}finally{probe.remove();}
      }:undefined;
      const fontSize=()=>parseFloat(host.ownerDocument.defaultView!.getComputedStyle(host).fontSize)||16;
      const options:MountOptions={
        ...diagramOptions,idPrefix:id,fontSize:fontSize(),
        math,
        onRender:()=>{if(!cancelled&&!fallback){host.dataset.renderer='pele';onState({ready:true,renderer:'pele'});}},
        onError:fail,
      };
      mounted=pele.mount(host,source,options);
      const app=host.closest('.app');
      if(app&&typeof MutationObserver!=='undefined'){
        fontsObserver=new MutationObserver(()=>{if(!cancelled&&!fallback)mounted?.update(source,{...options,fontSize:fontSize()});});
        fontsObserver.observe(app,{attributes:true,attributeFilter:['style']});
      }
    }catch(error){fail(error);}
  })();
  return()=>{cancelled=true;dispose();host.replaceChildren();};
}
