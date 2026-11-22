import {useEffect,useRef,useState} from 'react';
import {ImageDialog} from './ImageTools';
import {fetchDroppedImage} from './image-drop';
import {useBackClose} from './back-stack';
import './image-text.css';

export type ImageTextSource = {bulletId:string; blob?:Blob; url?:string; mediaId?:string};

export function ImageTextDialog({source,onClose,onInsert}:{
  source:ImageTextSource;
  onClose:()=>void;
  onInsert:(text:string)=>Promise<void>;
}) {
  const [text,setText]=useState('');
  const [status,setStatus]=useState('Preparing image…');
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const inserting=useRef(false);
  const close=()=>{if(!inserting.current)onClose();};
  useBackClose(true,close);
  useEffect(()=>{
    const controller=new AbortController();
    let active=true;
    const timeout=setTimeout(()=>controller.abort(),90_000);
    setStatus('Preparing image…');
    setError('');
    void (async()=>{
      try {
        const blob = source.blob ?? await fetchDroppedImage(source.url || '',controller.signal);
        const {recognizeImageText}=await import('./local-ocr');
        if(controller.signal.aborted)return;
        if(active)setStatus('Loading on-device OCR…');
        const value=await recognizeImageText(blob,controller.signal,progress=>{
          if(active)setStatus(`Reading image · ${Math.round(progress*100)}%`);
        });
        if(active){
          setText(value);
          if(!value)setError('No text was found. Try a clearer picture with visible English text.');
        }
      } catch(cause) {
        if(active)setError(controller.signal.aborted?'Text recognition timed out. Try again.':
          cause instanceof Error && /source|image download|2 MB|drop the file/i.test(cause.message)
            ? cause.message : 'Could not read this image. Try a PNG or JPEG with clear text.');
      } finally {
        clearTimeout(timeout);
        if(active)setStatus('');
      }
    })();
    return ()=>{active=false;clearTimeout(timeout);controller.abort();};
  },[source,attempt]);
  const insert=async()=>{
    if(inserting.current || status || !text.trim())return;
    inserting.current=true;
    setSaving(true);
    setError('');
    try { await onInsert(text.trim());onClose(); }
    catch(cause) {setError(cause instanceof Error?cause.message:'Could not save the text.');}
    finally {inserting.current=false;setSaving(false);}
  };
  return <ImageDialog title="Extract text from image" className="image-text-dialog" onClose={close}>
    <div className="image-text-body">
      <p>English text recognition runs on this device. Review the result before adding it under the image’s bullet.</p>
      {!!status&&<p role="status">{status}</p>}
      {!!error&&<p role="alert">{error}</p>}
      {!status&&<label>Extracted text<textarea rows={9} value={text} disabled={saving} onChange={event=>setText(event.target.value)}/></label>}
      <footer>
        {!status&&!text.trim()&&<button type="button" onClick={()=>setAttempt(value=>value+1)}>Try again</button>}
        <button type="button" disabled={saving} onClick={close}>Cancel</button>
        <button type="button" className="primary" disabled={saving||!!status||!text.trim()} onClick={()=>void insert()}>{saving?'Saving…':'Add as child bullet'}</button>
      </footer>
    </div>
  </ImageDialog>;
}
