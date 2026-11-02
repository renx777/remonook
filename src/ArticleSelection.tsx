import {useLayoutEffect,type ReactNode} from 'react';import {createPortal} from 'react-dom';import {useFloating,offset,flip,shift,autoUpdate} from '@floating-ui/react-dom';
export function ArticleSelection({range,children,onClose}:{range:Range;children:ReactNode;onClose:()=>void}){
 const {refs,floatingStyles}=useFloating({placement:'top',strategy:'fixed',middleware:[offset(12),flip(),shift({padding:12})],whileElementsMounted:autoUpdate});
 useLayoutEffect(()=>{refs.setReference({getBoundingClientRect:()=>range.getBoundingClientRect(),contextElement:range.commonAncestorContainer.nodeType===1?range.commonAncestorContainer as Element:range.commonAncestorContainer.parentElement||undefined});},[range,refs]);
 return createPortal(<div ref={refs.setFloating} className="web-selection" style={{...floatingStyles,bottom:'auto'}} role="dialog" aria-label="Selected passage" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}}>{children}</div>,document.querySelector('.app')||document.body);
}
