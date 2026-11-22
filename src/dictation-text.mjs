// How a dictated chunk joins the text before the cursor: a space when needed, and a capital
// letter at the start of a bullet or after a sentence ends. Whisper's own casing is kept otherwise.
export function joinTranscript(before,text){
 const t=String(text||'').replace(/\s+/g,' ').trim();if(!t)return '';
 const b=String(before||''),last=b.trimEnd();
 const start=!last||/[.!?:]$/.test(last);
 const body=start?t[0].toLocaleUpperCase()+t.slice(1):t;
 return (b&&!/\s$/.test(b)?' ':'')+body;
}
