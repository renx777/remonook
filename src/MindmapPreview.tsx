import {memo,useMemo} from 'react';
import type {Node} from './data';
import {mindmapPreview} from './mindmap-preview.mjs';
import {contrastText} from './mindmap-style.mjs';

/** Static SVG shares the real map's tree layout and validated topic styles. */
export const MindmapPreview=memo(function MindmapPreview({root,idx,styles}:{root:Node;idx:any;styles:Record<string,any>}){
 const model=useMemo(()=>mindmapPreview(root,idx,styles),[root,idx,styles]);
 return <span className="mindmap-library-preview" aria-hidden="true">
  <svg className="mindmap-snapshot" viewBox={`0 0 ${model.width} ${model.height}`} preserveAspectRatio="xMidYMid meet" focusable="false">
   {model.links.map(({source:a,target:b})=><path key={b.id} d={`M${a.x+a.width},${a.y+17} C${a.x+a.width+17},${a.y+17} ${b.x-17},${b.y+17} ${b.x},${b.y+17}`} fill="none" stroke={b.style.border||b.style.fill||'var(--muted)'} strokeWidth="1.6" opacity=".65"/>)}
   {model.nodes.map(n=><g key={n.id} data-preview-node={n.id}>
    <rect x={n.x} y={n.y} width={n.width} height={n.height} rx={n.style.shape==='pill'?17:n.style.shape==='underline'?0:7} fill={n.style.shape==='underline'?'transparent':n.style.fill||(n.root?'var(--hover)':'var(--bg)')} stroke={n.style.shape==='underline'?'none':n.style.border||'var(--line)'}/>
    {n.style.shape==='underline'&&<path d={`M${n.x},${n.y+n.height}h${n.width}`} stroke={n.style.border||'var(--muted)'}/>}
    <text x={n.x+12} y={n.y+22} fill={n.style.text||(n.style.fill&&n.style.shape!=='underline'?contrastText(n.style.fill):'var(--text)')} fontSize="13" fontWeight={n.style.bold||n.root?600:400} fontStyle={n.style.italic?'italic':undefined}>{n.text.length>22?n.text.slice(0,21)+'…':n.text}</text>
   </g>)}
  </svg>
  {model.truncated&&<small className="mindmap-preview-more">Preview · Open to explore</small>}
 </span>;
});
