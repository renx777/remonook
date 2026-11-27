import {useEffect} from 'react';
import {Icon} from './icons';
export type Toast={id:number;text:string;undo?:boolean}|null;
/** "Act first, undo after": one toast, six seconds, Undo or Z (when focus is not in a text field). */
export function UndoToast({toast,onUndo,onClose}:{toast:Toast;onUndo:()=>void;onClose:()=>void}){
 useEffect(()=>{
  if(!toast)return;const timer=setTimeout(onClose,6000);
  const key=(e:KeyboardEvent)=>{const t=e.target as HTMLElement|null;if(!toast.undo||e.metaKey||e.ctrlKey||e.altKey||e.key.toLowerCase()!=='z'||t?.closest('input,textarea,select,[contenteditable="true"]'))return;e.preventDefault();onUndo();};
  window.addEventListener('keydown',key);return ()=>{clearTimeout(timer);window.removeEventListener('keydown',key);};
 },[toast?.id]);
 if(!toast)return null;
 return <div className="rn-toast" role="status" aria-live="polite"><span className="rn-toast-mark" aria-hidden="true"><Icon name="check" size={11}/></span><span className="rn-toast-text">{toast.text}</span>{toast.undo&&<button onClick={onUndo}>Undo<kbd>Z</kbd></button>}<button className="rn-toast-close" aria-label="Dismiss" onClick={onClose}>×</button></div>;
}
