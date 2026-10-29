import {Children,cloneElement,createContext,isValidElement,useContext,type ReactElement} from 'react';
import GridLayout,{type GridLayoutProps} from 'react-grid-layout';
import {closestCenter,DndContext,KeyboardSensor,PointerSensor,useSensor,useSensors} from '@dnd-kit/core';
import {SortableContext,sortableKeyboardCoordinates,useSortable,verticalListSortingStrategy} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {Icon} from './icons';

const GripContext=createContext<ReturnType<typeof useSortable>|null>(null);
function SortableWidget({id,enabled,child}:{id:string;enabled:boolean;child:ReactElement<any>}){
 const sortable=useSortable({id,disabled:!enabled});
 const {transform,transition,isDragging,setNodeRef}=sortable;
 return <GripContext.Provider value={sortable}>{cloneElement(child,{ref:setNodeRef,style:{...child.props.style,transform:CSS.Transform.toString(transform?{...transform,x:0,scaleX:1,scaleY:1}:null),transition,zIndex:isDragging?35:undefined},className:child.props.className+(isDragging?' is-dragging':'')})}</GripContext.Provider>;
}
export function DashboardDragHandle({title,disabled}:{title:string;disabled:boolean}){
 const sortable=useContext(GripContext);
 return <button className="dash-widget-drag" disabled={disabled} ref={sortable?.setActivatorNodeRef} {...sortable?.attributes} {...sortable?.listeners} aria-label={`Drag ${title} widget`} title="Drag to move · Space to pick up, arrows to move, Space to drop"><Icon name="grip" size={15}/></button>;
}
type Props=GridLayoutProps&{mobile:boolean;editing:boolean;items:string[];labels:Record<string,string>;onReorder:(id:string,target:string)=>void};
export function DashboardBoard({mobile,editing,items,labels,onReorder,children,...grid}:Props){
 const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:8}}),useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}));
 if(!mobile)return <GridLayout {...grid}>{children}</GridLayout>;
 return <DndContext autoScroll={{acceleration:4,threshold:{x:0.1,y:0.12}}} sensors={sensors} collisionDetection={closestCenter} accessibility={{screenReaderInstructions:{draggable:'Press Space to pick up a widget. Use the arrow keys to move it, Space to drop, or Escape to cancel.'},announcements:{onDragStart:({active})=>`Picked up ${labels[String(active.id)]}.`,onDragOver:({active,over})=>over?`${labels[String(active.id)]}, position ${items.indexOf(String(over.id))+1} of ${items.length}.`:undefined,onDragEnd:({active,over})=>over?`Dropped ${labels[String(active.id)]} at position ${items.indexOf(String(over.id))+1} of ${items.length}.`:'Move cancelled.',onDragCancel:()=> 'Move cancelled.'}}} onDragEnd={({active,over})=>{if(editing&&over&&active.id!==over.id)onReorder(String(active.id),String(over.id));}}>
  <SortableContext items={items} strategy={verticalListSortingStrategy}><div className="dash-mobile-stack">{Children.map(children,child=>{if(!isValidElement(child))return child;const element=child as ReactElement<{ 'data-widget-id':string }>;return <SortableWidget key={element.key} id={element.props['data-widget-id']} child={element} enabled={editing}/>;})}</div></SortableContext>
 </DndContext>;
}
