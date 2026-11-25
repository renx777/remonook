export const AI_MODEL='@cf/google/gemma-4-26b-a4b-it',AI_VERSION=1,AI_INPUT_BYTES=8192,AI_OUTPUT_TOKENS=2048;
export const AI_OPERATIONS=['answer','explain','summarize','flashcards','mcqs','list','outline','mindmap','diagram'];
/** Operations whose reviewed preview becomes structure (child bullets or a diagram), not one answer bullet. */
export const AI_STRUCTURE_OPERATIONS=['list','outline','mindmap','diagram'];
export const byteLength=s=>new TextEncoder().encode(s).length;
const MERMAID_START=/^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|mindmap|timeline|pie|gantt|journey|quadrantChart|xychart(?:-beta)?|block(?:-beta)?)\b/;
const plainLine=s=>s.replace(/[\r\n\t]+/g,' ').replace(/^\s*(?:[-*•]|\d+[.)])\s+/,'').replace(/\*\*|__|`/g,'').trim();
/** Normalizes a model's structured reply to the editable preview text the panel shows:
 one item per line (list), two-space indentation (outline, mindmap) or Mermaid source (diagram). */
function structureText(operation,v){
 if(typeof v?.text==='string')return v.text;
 if(operation==='list'){if(!Array.isArray(v?.items)||v.items.length<1||v.items.length>40||v.items.some(x=>typeof x!=='string'||!plainLine(x)||x.length>300))throw Error('The model did not return a valid list. Try again.');return v.items.map(plainLine).join('\n');}
 if(operation==='diagram'){const code=typeof v?.mermaid==='string'?v.mermaid.replace(/^\s*```(?:mermaid)?\s*|\s*```\s*$/g,'').trim():'';if(!code||code.length>6000||!MERMAID_START.test(code))throw Error('The model did not return a valid Mermaid diagram. Try again.');return code;}
 const lines=[];const walk=(nodes,depth)=>{if(!Array.isArray(nodes))throw Error('The model did not return a valid outline. Try again.');for(const n of nodes){const text=typeof n?.text==='string'?plainLine(n.text):'';if(!text||text.length>300||depth>3||lines.length>=80)throw Error('The model did not return a valid outline. Try again.');lines.push('  '.repeat(depth)+text);if(n.children)walk(n.children,depth+1);}};
 walk(v?.outline,0);if(!lines.length)throw Error('The model did not return a valid outline. Try again.');return lines.join('\n');
}
/** Parses reviewed list/outline text into {depth,text} rows. Indentation is two spaces or a tab per level. */
export function structureRows(text){
 const rows=[];let last=-1;
 for(const raw of String(text).split(/\r?\n/)){if(!raw.trim())continue;const indent=(raw.match(/^[\t ]*/)?.[0]||'').replace(/\t/g,'  ').length;const depth=Math.min(Math.floor(indent/2),last+1,6);const line=plainLine(raw);if(!line)continue;rows.push({depth,text:line.slice(0,2000)});last=depth;}
 return rows;
}
export const mermaidSource=text=>{const code=String(text).replace(/^\s*```(?:mermaid)?\s*|\s*```\s*$/g,'').trim();return MERMAID_START.test(code)&&code.length<=6000?code:null;};
export function validateAiInput(v){
 if(!v||!AI_OPERATIONS.includes(v.operation)||!['general','web'].includes(v.mode)||typeof v.question!=='string'||v.question.length>1000||typeof v.context!=='string'||byteLength(v.context)>6000||(!v.question.trim()&&!v.context.trim())||(v.operation!=='answer'&&!v.context.trim())||(v.mode==='web'&&v.operation!=='answer'))throw Error('Choose a question or a smaller selection (up to 6 KB of notes).');
 return {operation:v.operation,mode:v.mode,question:v.question.trim(),context:v.context};
}
const text=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max;
export function validateAiResult(operation,v,sources=[]){
 if(operation==='flashcards'||operation==='mcqs'){
  if(!v||!Array.isArray(v.candidates)||v.candidates.length<1||v.candidates.length>3)throw Error('The model did not return valid study cards. Try again.');
  for(const c of v.candidates){if(!c||!text(c.question,1000))throw Error('A question is missing.');if(operation==='flashcards'){if(!text(c.answer,2000))throw Error('A flashcard answer is missing.');}
   else if(!Array.isArray(c.options)||c.options.length!==4||c.options.some(x=>!text(x,500))||new Set(c.options.map(x=>x.trim().toLocaleLowerCase())).size!==4||!Number.isInteger(c.correct)||c.correct<0||c.correct>3||!text(c.explanation,2000))throw Error('An MCQ needs four distinct options, one correct answer and an explanation.');}
  return {candidates:v.candidates.map(c=>operation==='flashcards'?{question:c.question,answer:c.answer}:{question:c.question,options:c.options,correct:c.correct,explanation:c.explanation})};
 }
 if(AI_STRUCTURE_OPERATIONS.includes(operation)){const text=structureText(operation,v);if(!text.trim()||text.length>16000)throw Error('The model returned an empty preview. Try again.');return {text,supported:true,citations:[]};}
 if(!v||typeof v.supported!=='boolean'||typeof v.text!=='string'||v.text.length>16000||!Array.isArray(v.citations)||v.citations.some(id=>!Number.isInteger(id)||!sources.some(s=>s.id===id))||(v.supported&&!v.text.trim())||(sources.length&&v.supported&&!v.citations.length))throw Error('The model returned an unsupported answer. Try again.');
 if(v.supported&&/^\s*(?:\[\s*\]|\{\s*\}|\{\s*"candidates"\s*:\s*\[\s*\]\s*\})\s*$/.test(v.text))throw Error('The model did not return an explanatory answer. Try again.');
 return {text:v.text,supported:v.supported,citations:[...new Set(v.citations)]};
}
