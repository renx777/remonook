import {useEffect,useRef,useState} from 'react';
import {ImageDialog} from './ImageTools';
import {fetchDroppedImage} from './image-drop';
import {useBackClose} from './back-stack';
import {decodeOcrImage,fullImage,recognizeImageText,type ImageCrop,type OcrOptions} from './local-ocr';
import {OcrImagePreview} from './OcrImagePreview';
import './image-text.css';

export type ImageTextSource = {bulletId:string; blob?:Blob; url?:string; mediaId?:string};
const defaults:OcrOptions={rotation:0,crop:fullImage,layout:'auto',invert:false};
const cropEdges=[['left','Left edge'],['top','Top edge'],['right','Right edge'],['bottom','Bottom edge']] as const;

export function ImageTextDialog({source,onClose,onInsert}:{
  source:ImageTextSource;onClose:()=>void;onInsert:(text:string)=>Promise<void>;
}) {
  const [image,setImage]=useState<HTMLImageElement|null>(null);
  const [options,setOptions]=useState(defaults);
  const [hasRun,setHasRun]=useState(false);
  const [selecting,setSelecting]=useState(false);
  const [text,setText]=useState('');
  const [candidate,setCandidate]=useState('');
  const [status,setStatus]=useState('Preparing image…');
  const [feedback,setFeedback]=useState('');
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const [loadAttempt,setLoadAttempt]=useState(0);
  const draftEdited=useRef(false);
  const editor=useRef<HTMLTextAreaElement>(null);
  const recognition=useRef<AbortController|null>(null);
  const inserting=useRef(false);
  const close=()=>{if(!inserting.current)onClose();};
  useBackClose(true,close);

  useEffect(()=>{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),30_000);
    let active=true;
    setStatus('Preparing image…');
    setError('');
    void (async()=>{
      try{
        const blob=source.blob??await fetchDroppedImage(source.url||'',controller.signal);
        const decoded=await decodeOcrImage(blob,controller.signal);
        if(active)setImage(decoded);
      }catch(cause){
        if(active)setError(controller.signal.aborted?'Loading the image timed out.':
          cause instanceof Error?cause.message:'Could not open this image.');
      }finally{
        clearTimeout(timeout);
        if(active)setStatus('');
      }
    })();
    return ()=>{active=false;clearTimeout(timeout);controller.abort();};
  },[source,loadAttempt]);
  useEffect(()=>()=>{const controller=recognition.current;recognition.current=null;controller?.abort();},[]);

  const run=async()=>{
    if(!image||recognition.current||inserting.current)return;
    const controller=new AbortController();
    recognition.current=controller;
    const timeout=setTimeout(()=>controller.abort(),90_000);
    setStatus('Loading on-device OCR…');
    setError('');
    setFeedback('');
    setCandidate('');
    setHasRun(true);
    try{
      const value=await recognizeImageText(image,options,controller.signal,progress=>{
        if(recognition.current===controller)setStatus(`Reading image · ${Math.min(100,Math.round(progress*20)*5)}%`);
      });
      if(recognition.current!==controller)return;
      if(!value){
        setError('No text found. Try another crop, text layout, or a clearer image.');
      }else if(draftEdited.current){
        setCandidate(value);
      }else{
        setText(value);
        setFeedback('Text extracted.');
      }
    }catch{
      if(recognition.current===controller)setError(controller.signal.aborted
        ?'Text recognition timed out. Try again.'
        :'Could not read this image. Try a PNG or JPEG with clear text.');
    }finally{
      clearTimeout(timeout);
      if(recognition.current===controller){recognition.current=null;setStatus('');}
    }
  };
  const stop=()=>{
    const controller=recognition.current;
    recognition.current=null;
    controller?.abort();
    setStatus('');
    setFeedback('Recognition stopped.');
  };

  const copy=async()=>{
    try{
      await navigator.clipboard.writeText(text);
      setFeedback('Copied text.');
    }catch{
      editor.current?.focus();
      editor.current?.select();
      setFeedback('Text selected. Copy it using your device’s Copy command.');
    }
  };
  const insert=async()=>{
    if(inserting.current||status||!text.trim())return;
    inserting.current=true;
    setSaving(true);
    setError('');
    try{await onInsert(text.trim());onClose();}
    catch(cause){setError(cause instanceof Error?cause.message:'Could not save the text.');}
    finally{inserting.current=false;setSaving(false);}
  };

  const updateCrop=(crop:ImageCrop)=>setOptions(previous=>({...previous,crop}));
  const updateEdge=(edge:keyof ImageCrop,value:number)=>{
    const {crop}=options;
    let bound=Math.max(0,Math.min(1,value/100));
    if(edge==='left')bound=Math.min(bound,crop.right-.02);
    if(edge==='right')bound=Math.max(bound,crop.left+.02);
    if(edge==='top')bound=Math.min(bound,crop.bottom-.02);
    if(edge==='bottom')bound=Math.max(bound,crop.top+.02);
    updateCrop({...crop,[edge]:bound});
  };
  const busy=!!status||saving;
  return <ImageDialog title="Extract text from image" className="image-text-dialog" onClose={close}>
    <div className="image-text-body">
      <p>English OCR · processed on this device</p>
      {!!status&&<p role="status">{status}</p>}
      {!!feedback&&<p role="status">{feedback}</p>}
      {!!error&&<p role="alert">{error}</p>}
      {image&&<div className="ocr-workspace">
        <div className="ocr-image-side">
          <OcrImagePreview image={image} rotation={options.rotation} invert={options.invert} crop={options.crop} selecting={selecting&&!busy} onCrop={updateCrop}/>
          <div className="ocr-actions">
            <button type="button" disabled={busy} onClick={()=>setOptions(previous=>({...previous,rotation:(previous.rotation+1)%4,crop:fullImage}))}>Rotate 90°</button>
            <button type="button" disabled={busy} aria-expanded={selecting} onClick={()=>setSelecting(value=>!value)}>Crop</button>
            <button type="button" disabled={busy} aria-pressed={options.invert} onClick={()=>setOptions(previous=>({...previous,invert:!previous.invert}))}>Invert</button>
          </div>
          {selecting&&<div className="ocr-crop-controls">
            <p>Drag over the image or adjust the crop edges.</p>
            <div className="ocr-crop-edges">{cropEdges.map(([edge,label])=><label key={edge}>{label} (%)
              <input type="range" min={0} max={100} step={1} value={Math.round(options.crop[edge]*100)} disabled={busy} onChange={event=>updateEdge(edge,Number(event.target.value))}/>
            </label>)}</div>
            <button type="button" disabled={busy} onClick={()=>updateCrop(fullImage)}>Reset crop</button>
          </div>}
          <div className="ocr-run">
            <label>Text layout<select value={options.layout} disabled={busy} onChange={event=>setOptions(previous=>({...previous,layout:event.target.value as OcrOptions['layout']}))}>
              <option value="auto">Auto</option><option value="block">Single block</option><option value="sparse">Scattered text</option>
            </select></label>
            {status&&hasRun?<button type="button" onClick={stop}>Stop OCR</button>:<button type="button" className={hasRun?'':'primary'} disabled={busy} onClick={()=>void run()}>{hasRun?'Run again':'Extract text'}</button>}
          </div>
        </div>
        <div className="ocr-text-side">
          <label>Extracted text<textarea ref={editor} rows={9} value={text} disabled={saving} placeholder="Recognized text will appear here." onChange={event=>{draftEdited.current=true;setText(event.target.value);}}/></label>
          {!!candidate&&<div className="ocr-candidate">
            <label>New OCR result<textarea readOnly rows={4} value={candidate}/></label>
            <div className="ocr-actions">
              <button type="button" onClick={()=>setCandidate('')}>Keep my edits</button>
              <button type="button" onClick={()=>{setText(candidate);setCandidate('');draftEdited.current=false;}}>Use new result</button>
            </div>
          </div>}
        </div>
      </div>}
      <footer>
        {!status&&!image&&<button type="button" onClick={()=>setLoadAttempt(value=>value+1)}>Try loading again</button>}
        {!!text.trim()&&<button type="button" disabled={saving} onClick={()=>void copy()}>Copy text</button>}
        <button type="button" disabled={saving} onClick={close}>Close</button>
        <button type="button" className="primary" disabled={busy||!text.trim()} onClick={()=>void insert()}>{saving?'Saving…':'Add as child bullet'}</button>
      </footer>
    </div>
  </ImageDialog>;
}
