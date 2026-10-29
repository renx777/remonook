import {cloneElement,useCallback,useLayoutEffect,type ReactElement,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {autoUpdate,flip,offset,shift,useFloating} from '@floating-ui/react-dom';

/** Keep widget actions outside transformed grid items and within the viewport. */
export function DashboardMenu({anchor,menuRef,children}:{anchor:HTMLButtonElement|null;menuRef:RefObject<HTMLDivElement|null>;children:ReactElement<any>}){
 const {refs,floatingStyles}=useFloating({placement:'bottom-end',strategy:'fixed',middleware:[offset(6),flip(),shift({padding:8})],whileElementsMounted:autoUpdate});
 useLayoutEffect(()=>refs.setReference(anchor),[anchor,refs.setReference]);
 const setNode=useCallback((node:HTMLDivElement|null)=>{menuRef.current=node;refs.setFloating(node);},[menuRef,refs.setFloating]);
 return createPortal(cloneElement(children,{ref:setNode,style:{...children.props.style,...floatingStyles,maxHeight:'calc(100dvh - 16px)',overflowY:'auto'}}),anchor?.closest('.app')||document.body);
}
