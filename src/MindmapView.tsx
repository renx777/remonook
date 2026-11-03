import {useEffect,useMemo,useRef,useState} from 'react';
import {ReactFlow,Background,BackgroundVariant,Controls,MiniMap,Handle,Position,useNodesState,useReactFlow,type Node as FlowNode,type Edge} from '@xyflow/react';
import '../node_modules/@xyflow/react/dist/style.css';
import {hierarchy,tree} from 'd3-hierarchy';
import type {Node} from './data';
import {index} from './domain.mjs';
import {displayText} from './relations.mjs';
import {Icon} from './icons';
import {MindmapStylePanel} from './MindmapStylePanel';
import {mindmapStyle,contrastText} from './mindmap-style.mjs';
import './mindmap.css';

type MindData={
  style:any;id:string;text:string;root:boolean;hasChildren:boolean;collapsed:boolean;hidden:number;editing:boolean;confirm:boolean;selected:boolean;
  onSelect:(id:string)=>void;onOpen:(id:string)=>void;onToggle:(id:string)=>void;onEditStart:(id:string)=>void;onEditCommit:(id:string,text:string)=>void;onEditCancel:()=>void;
  onAddChild:(id:string)=>void;onAddSibling:(id:string)=>void;onDeleteRequest:(id:string)=>void;onDeleteConfirm:(id:string)=>void;onDeleteCancel:()=>void;
};
const MindNode=({id,data}:{id:string;data:MindData})=>{
  const down=useRef({x:0,y:0});
  return <div
    className={`mind-node ${data.root?'is-root':''} ${data.collapsed&&data.hasChildren?'is-collapsed':''} ${data.confirm?'is-confirm':''} ${data.selected?'is-selected':''}`}
    style={{background:data.style.fill,color:data.style.text||(data.style.fill&&data.style.shape!=='underline'?contrastText(data.style.fill):undefined),borderColor:data.style.border,fontSize:data.style.size,fontWeight:data.style.bold?700:undefined,fontStyle:data.style.italic?'italic':undefined,borderRadius:data.style.shape==='pill'?40:undefined,...(data.style.shape==='underline'?{background:'transparent',borderWidth:'0 0 2px',borderRadius:0}:{})}}
    title={data.text||'Untitled'}
    onPointerDown={e=>{down.current={x:e.clientX,y:e.clientY};}}
    onClick={e=>{ if(data.confirm||data.editing)return; if(Math.abs(e.clientX-down.current.x)>5||Math.abs(e.clientY-down.current.y)>5)return; data.onSelect(data.id); }}
    onDoubleClick={()=>{ if(!data.confirm)data.onEditStart(data.id); }}
  >
    <Handle type="target" position={Position.Left}/>
    <div className="mind-node-main">
      {data.hasChildren&&<button className="mind-toggle nodrag" aria-label={data.collapsed?'Expand branch':'Collapse branch'} title={data.collapsed?'Expand branch':'Collapse branch'} onClick={e=>{e.stopPropagation();data.onToggle(data.id);}}><Icon name="chevron" size={12}/>{data.collapsed&&data.hidden>0&&<span className="mind-hidden-count">{data.hidden}</span>}</button>}
      {data.editing
        ? <input className="mind-input nodrag" autoFocus defaultValue={data.text} aria-label="Rename bullet"
            onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onFocus={e=>e.currentTarget.select()}
            onKeyDown={e=>{ if(e.key==='Enter')data.onEditCommit(data.id,e.currentTarget.value); else if(e.key==='Escape'){e.currentTarget.dataset.cancelled='1';data.onEditCancel();} e.stopPropagation(); }}
            onBlur={e=>{ if(e.currentTarget.dataset.cancelled){delete e.currentTarget.dataset.cancelled;return;} data.onEditCommit(data.id,e.currentTarget.value); }}
          />
        : <span className="mind-label">{data.text||'Untitled'}</span>}
    </div>
    {!data.editing&&<div className="mind-node-actions">
      {data.confirm?<>
        <span className="mind-confirm-text">Delete branch?</span>
        <button className="mind-danger nodrag" title="Move branch to Trash" onClick={e=>{e.stopPropagation();data.onDeleteConfirm(data.id);}}><Icon name="trash" size={12}/></button>
        <button className="nodrag" title="Cancel" onClick={e=>{e.stopPropagation();data.onDeleteCancel();}}><Icon name="close" size={12}/></button>
      </>:<>
        <button className="nodrag" title="Open in Notes" aria-label="Open in Notes" onClick={e=>{e.stopPropagation();data.onOpen(data.id);}}><Icon name="notes" size={12}/></button>
        <button className="nodrag" title="Add child" aria-label="Add child" onClick={e=>{e.stopPropagation();data.onAddChild(data.id);}}><Icon name="plus" size={12}/></button>
        <button className="nodrag" title="Add sibling below" aria-label="Add sibling below" onClick={e=>{e.stopPropagation();data.onAddSibling(data.id);}}><Icon name="down" size={12}/></button>
        <button className="nodrag" title="Rename" aria-label="Rename" onClick={e=>{e.stopPropagation();data.onEditStart(data.id);}}><Icon name="edit" size={12}/></button>
        <button className="nodrag" title="Delete branch" aria-label="Delete branch" onClick={e=>{e.stopPropagation();data.onDeleteRequest(data.id);}}><Icon name="trash" size={12}/></button>
      </>}
    </div>}
    <Handle type="source" position={Position.Right}/>
  </div>;
};

const nodeTypes={mind:MindNode};
const resolveRoot=(nodes:Node[],scope:string|null):Node|null=>{const byId=index(nodes).byId;let n=scope?byId.get(scope):undefined;while(n){if(n.mindmap)return n;n=n.parentId?byId.get(n.parentId):undefined;}return null;};

const Fitter=({nodes,edges}:{nodes:FlowNode<MindData>[];edges:Edge[]})=>{
  const {fitView}=useReactFlow();
  const sig=[nodes.map(n=>n.id).join(','),...nodes.filter(n=>n.data?.collapsed).map(n=>n.id),edges.length].join('|');
  useEffect(()=>{ const timer=window.setTimeout(()=>fitView({padding:0.15,duration:220,maxZoom:1.5}),30); return ()=>window.clearTimeout(timer); },[sig,fitView]);
  return null;
};

export function MindmapView({nodes,scope,onOpen,onConvert,onNotes,onToggleCollapse,onExpandBranch,onCollapseBranch,onAddChild,onAddSibling,onRename,onDelete,onReorder,disabled,styles={},onStyle}:{
  styles?:Record<string,any>;onStyle:(id:string,patch:any,branch:boolean)=>void;nodes:Node[];scope:string|null;onOpen:(id:string)=>void;onConvert:(id:string)=>void;onNotes:()=>void;
  onToggleCollapse:(id:string)=>void;onExpandBranch:(id:string)=>void;onCollapseBranch:(id:string)=>void;
  onAddChild:(parentId:string,newId:string)=>void;onAddSibling:(id:string,newId:string)=>void;
  onRename:(id:string,text:string)=>void;onDelete:(id:string)=>void;onReorder:(id:string,index:number)=>void;disabled?:boolean;
}){
 const [activeMap,setActiveMap]=useState<string|null>(()=>resolveRoot(nodes,scope)?.id||null),[query,setQuery]=useState('');
 useEffect(()=>{setActiveMap(resolveRoot(nodes,scope)?.id||null);},[scope]);
 const maps=useMemo(()=>nodes.filter(n=>n.mindmap&&!n.mirrorSourceId),[nodes]);
 const root=activeMap?nodes.find(n=>n.id===activeMap&&n.mindmap)||null:null;
 const [editingId,setEditingId]=useState<string|null>(null);
 const [confirmId,setConfirmId]=useState<string|null>(null);
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const rf=useRef<{fitView:(options:object)=>void}|null>(null);
 const {byId,children}=useMemo(()=>index(nodes),[nodes]);
 const scopePath=useMemo(()=>{const path=new Set<string>();let cur=scope?byId.get(scope):undefined;while(cur&&cur.id!==root?.id){path.add(cur.id);cur=cur.parentId?byId.get(cur.parentId):undefined;}return path;},[byId,scope,root]);
 const startEdit=(id:string)=>{ if(disabled)return; setConfirmId(null); setEditingId(id); };
 const commitEdit=(id:string,text:string)=>{ setEditingId(current=>current===id?null:current); onRename(id,text); };
 const cancelEdit=()=>setEditingId(null);
 const addChild=(parentId:string)=>{ if(disabled)return; const newId=crypto.randomUUID(); onAddChild(parentId,newId); setEditingId(newId); };
 const addSibling=(id:string)=>{ if(disabled)return; const newId=crypto.randomUUID(); onAddSibling(id,newId); setEditingId(newId); };
 const confirmDelete=(id:string)=>{ setConfirmId(null); onDelete(id); };
 useEffect(()=>{ const h=(e:KeyboardEvent)=>{ if(e.key!=='Escape')return; setConfirmId(null); setSelectedId(null); }; window.addEventListener('keydown',h); return ()=>window.removeEventListener('keydown',h); },[]);
 useEffect(()=>{ if(selectedId&&!byId.has(selectedId))setSelectedId(null); },[byId,selectedId]);
 const model=useMemo(()=>{ if(!root)return null;
  const counts=new Map<string,number>();
  const count=(id:string):number=>{ const cached=counts.get(id); if(cached!==undefined)return cached; const total=((children.get(id)||[]) as Node[]).reduce((sum,c)=>sum+1+count(c.id),0); counts.set(id,total); return total; };
  count(root.id);
  type MindTree={id:string;children:MindTree[]};
  const build=(n:Node):MindTree=>({id:n.id,children:n.collapsed&&!scopePath.has(n.id)?[]:(children.get(n.id)||[]).map(build)});
  const graph=hierarchy(build(root),d=>d.children);
  const rowHeight=Math.max(96,...graph.descendants().map(n=>(mindmapStyle(styles[n.data.id]).size||13)*1.35*3+40));
  const layout=tree<MindTree>().nodeSize([rowHeight,280])(graph);
  const flowNodes:FlowNode<MindData>[]=layout.descendants().map(d=>{
    const n=byId.get(d.data.id) as Node,kids=children.get(n.id)||[];
    return {id:d.data.id,position:{x:d.y,y:d.x},type:'mind',data:{
      style:mindmapStyle(styles[n.id]),id:n.id,text:displayText(n.text),root:n.id===root.id,hasChildren:kids.length>0,collapsed:!!n.collapsed,hidden:counts.get(n.id)||0,
      editing:editingId===n.id,confirm:confirmId===n.id,selected:selectedId===n.id,
      onSelect:setSelectedId,onOpen,onToggle:onToggleCollapse,onEditStart:startEdit,onEditCommit:commitEdit,onEditCancel:cancelEdit,
      onAddChild:addChild,onAddSibling:addSibling,onDeleteRequest:setConfirmId,onDeleteConfirm:confirmDelete,onDeleteCancel:()=>setConfirmId(null)}};
  });
  const flowEdges:Edge[]=layout.links().map(l=>({id:`e-${l.source.data.id}-${l.target.data.id}`,source:l.source.data.id,target:l.target.data.id,style:{stroke:mindmapStyle(styles[l.target.data.id]).border||mindmapStyle(styles[l.target.data.id]).fill||'var(--muted)',strokeWidth:1.8}}));
  return {flowNodes,flowEdges};
 },[nodes,root,children,scopePath,editingId,confirmId,selectedId,disabled,onOpen,onToggleCollapse,onRename,onDelete,styles]);
 const [rfNodes,setRfNodes,onNodesChange]=useNodesState<FlowNode<MindData>>(model?.flowNodes??[]);
 useEffect(()=>{ if(model)setRfNodes(model.flowNodes); },[model,setRfNodes]);
 const onNodeDragStop=(_:unknown,node:FlowNode<MindData>,all:FlowNode<MindData>[])=>{
  if(disabled||!node.data)return;
  const n=nodes.find(x=>x.id===node.id); if(!n)return;
  const sibs=((children.get(n.parentId)||[]) as Node[]).map(c=>c.id);
  if(sibs.length<2)return;
  const ordered=sibs.map(s=>all.find(x=>x.id===s)).filter((x):x is FlowNode<MindData>=>!!x).sort((a,b)=>a.position.y-b.position.y).map(x=>x.id);
  const at=ordered.indexOf(node.id);
  if(at>=0)onReorder(node.id,at);
 };
 if(!root)return <section className="mindmap-library"><header><div><p className="mindmap-eyebrow">YOUR CONNECTED IDEAS</p><h1>Mindmaps <small>{maps.length}</small></h1><p>Every branch you turn into a mindmap, together in one place.</p></div><button onClick={onNotes}><Icon name="plus" size={16}/>Create from Notes</button></header>{maps.length>0&&<input type="search" aria-label="Search mindmaps" placeholder="Find a mindmap…" value={query} onChange={e=>setQuery(e.target.value)}/>}<div className="mindmap-library-grid">{maps.filter(n=>displayText(n.text).toLowerCase().includes(query.toLowerCase())).map(n=><button key={n.id} onClick={()=>{setSelectedId(null);setActiveMap(n.id);}}><span className="mindmap-library-preview" style={{color:styles[n.id]?.border||'var(--accent)'}}><Icon name="mindmap" size={40}/><i/><i/></span><strong>{displayText(n.text)||'Untitled mindmap'}</strong><span>{(children.get(n.id)||[]).length} main branches{n.parentId?' · Nested in Notes':''}</span></button>)}</div>{!maps.length&&<div className="mindmap-empty"><div><Icon name="mindmap" size={36}/><h2>Give your ideas room to connect</h2><p>Choose Mindmap from any bullet’s actions in Notes. Its children become branches here.</p>{scope&&<button disabled={disabled} onClick={()=>{onConvert(scope);setActiveMap(scope);}}>Convert this branch</button>}</div></div>}{maps.length>0&&!maps.some(n=>displayText(n.text).toLowerCase().includes(query.toLowerCase()))&&<p>No mindmaps match your search.</p>}</section>;
 return <div className="mindmap-view" aria-label="Mindmap">
  <ReactFlow key={root.id} nodes={rfNodes} edges={model!.flowEdges} onNodesChange={onNodesChange} nodeTypes={nodeTypes} fitView fitViewOptions={{padding:0.15}} minZoom={0.15} maxZoom={2.5} nodesDraggable={!disabled} nodesConnectable={false} elementsSelectable={false} zoomOnDoubleClick={false} zoomOnScroll panOnScroll={false} panOnDrag nodeDragThreshold={5} onNodeDragStop={onNodeDragStop} onPaneClick={()=>setSelectedId(null)} onInit={instance=>{rf.current=instance;}} proOptions={{hideAttribution:true}}>
   <Background variant={BackgroundVariant.Dots} gap={24} size={1.1} color="var(--line)"/>
   <MiniMap pannable zoomable nodeColor={node=>mindmapStyle(styles[node.id]).fill||'var(--accent)'} nodeStrokeColor="var(--line)" maskColor="rgb(0 0 0 / 0.12)"/>
   <Controls/>
   <Fitter nodes={rfNodes} edges={model!.flowEdges}/>
  </ReactFlow>
  <div className="mindmap-root-label"><button aria-label="All mindmaps" onClick={()=>{setActiveMap(null);setSelectedId(null);}}><Icon name="back" size={14}/>All mindmaps</button><Icon name="mindmap" size={14}/><span>{displayText(root.text)||'Untitled'}</span></div>
  {selectedId&&<div className="mindmap-selection-toolbar"><span>{displayText(byId.get(selectedId)?.text||'Untitled')}</span><MindmapStylePanel key={selectedId} value={styles[selectedId]||{}} disabled={disabled} onChange={(patch,branch)=>onStyle(selectedId,patch,branch)}/><button aria-label="Edit selected topic" disabled={disabled} onClick={()=>startEdit(selectedId)}><Icon name="edit" size={17}/></button></div>}
  <div className="mindmap-toolbar" role="toolbar" aria-label="Mindmap controls">
   <button title="Expand all" aria-label="Expand all" onClick={()=>onExpandBranch(root.id)}><Icon name="expand" size={14}/></button>
   <button title="Collapse all" aria-label="Collapse all" onClick={()=>onCollapseBranch(root.id)}><Icon name="collapse" size={14}/></button>
   <button title="Fit view" aria-label="Fit view" onClick={()=>rf.current?.fitView({padding:0.15,duration:250})}><Icon name="fullscreen" size={14}/></button>
  </div>
 </div>;
}
