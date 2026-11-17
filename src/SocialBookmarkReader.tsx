import {useRef,useState} from 'react';
import {ArrowLeft,ExternalLink} from 'lucide-react';
import {SocialPost} from './SocialPost';
import {socialPost} from './social-posts.mjs';
import {storageAccountKey} from './data-store';
import type{Workspace} from './data';

export function SocialBookmarkReader({doc,bookmark,disabled,onSave,onBack,onNotes,onSavedCopy}:{doc:Workspace;bookmark:any;disabled:boolean;onSave:(text:string,id:string)=>Promise<void>;onBack:()=>void;onNotes:(id:string)=>void;onSavedCopy?:()=>void}) {
  const draftKey='remo-social-draft:'+storageAccountKey()+':'+bookmark.id;
  const initial=useRef<{text:string;id:string}|null>(null);
  if(!initial.current){try{const saved=JSON.parse(localStorage.getItem(draftKey)||'null');if(typeof saved?.text==='string'&&typeof saved?.id==='string'&&/^[a-f0-9-]{36}$/i.test(saved.id))initial.current=saved;}catch{}initial.current??={text:'',id:crypto.randomUUID()};}
  const [text,setText]=useState(initial.current.text),[error,setError]=useState(''),[busy,setBusy]=useState(false),[frozen,setFrozen]=useState(false),lock=useRef(false),draftId=useRef(initial.current.id);
  const update=(value:string)=>{setText(value);try{localStorage.setItem(draftKey,JSON.stringify({text:value,id:draftId.current}));}catch{}};
  const post=socialPost(bookmark.url)!,root=doc.web.bookmarkNoteRoots?.[bookmark.id];
  const notes=doc.tables.bullets.filter(n=>root&&n.parentId===root).sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id));
  return <section className="bookmarks social-reader" aria-label={post.provider+' bookmark'}>
    <header className="social-reader-toolbar"><button type="button" aria-label="Back to bookmarks" onClick={onBack}><ArrowLeft size={18}/></button><strong>{post.title}</strong>{onSavedCopy&&<button type="button" onClick={onSavedCopy}>Saved article</button>}<a href={post.href} target="_blank" rel="noopener noreferrer">Original<ExternalLink size={15}/></a></header>
    <div className="social-reader-body"><div className="social-reader-content"><SocialPost url={bookmark.url}/><section className="social-reader-notes" aria-label="Post notes"><h2>Your notes</h2><p>The link and your notes are saved in RemoNook. The live post is provided by {post.provider} and may change or become unavailable.</p>
      <form onSubmit={async event=>{event.preventDefault();if(disabled||!text.trim()||lock.current)return;lock.current=true;setBusy(true);try{setError('');await onSave(text,draftId.current);localStorage.removeItem(draftKey);draftId.current=crypto.randomUUID();setText('');setFrozen(false);}catch(e){setError((e as Error).message);if((e as any)?.captureApplied)setFrozen(true);}finally{lock.current=false;setBusy(false);}}}>
        <label htmlFor="social-note">Add a thought</label><textarea id="social-note" placeholder="What would you like to remember?" value={text} onChange={e=>update(e.target.value)} disabled={disabled||busy||frozen}/><button disabled={disabled||busy||!text.trim()}>{busy?'Saving…':frozen?'Retry saving':'Add to notes'}</button>
      </form>{error&&<p role="alert">{error}</p>}
      {notes.map(note=><div className="social-reader-saved-note" key={note.id}>{note.text}<button type="button" onClick={()=>onNotes(note.id)}>Open in outline</button></div>)}
    </section></div></div>
  </section>;
}
