import * as Dialog from '@radix-ui/react-dialog';
export function ArticleCapturePreview({url,error,disabled,onSave,onClose}:{url:string;error:string;disabled:boolean;onSave:()=>void;onClose:()=>void}){
 return <Dialog.Root open onOpenChange={open=>{if(!open)onClose();}}><Dialog.Portal container={document.querySelector('.app')||document.body}><Dialog.Overlay className="web-notes-overlay"/><Dialog.Content className="web-capture-preview" aria-describedby={undefined}><Dialog.Title>Preview screenshot</Dialog.Title><img src={url} alt="Article screenshot preview"/>{error&&<p role="alert">{error}</p>}<div><button disabled={disabled} onClick={onSave}>Save to notes</button><button onClick={onClose}>Cancel</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
