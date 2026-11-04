export const AI_MODEL='@cf/google/gemma-4-26b-a4b-it',AI_VERSION=1,AI_INPUT_BYTES=8192,AI_OUTPUT_TOKENS=2048;
export const AI_OPERATIONS=['answer','explain','summarize','flashcards','mcqs'];
export const byteLength=s=>new TextEncoder().encode(s).length;
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
 if(!v||typeof v.supported!=='boolean'||typeof v.text!=='string'||v.text.length>16000||!Array.isArray(v.citations)||v.citations.some(id=>!Number.isInteger(id)||!sources.some(s=>s.id===id))||(v.supported&&!v.text.trim())||(sources.length&&v.supported&&!v.citations.length))throw Error('The model returned an unsupported answer. Try again.');
 return {text:v.text,supported:v.supported,citations:[...new Set(v.citations)]};
}
