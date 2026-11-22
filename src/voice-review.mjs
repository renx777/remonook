// Voice review for flashcards: shared by the Worker (prompt, validation) and the app (local
// checks, verdict, suggested grade). The model only says which answer points were covered and
// whether something wrong was claimed; the verdict is computed here so it always matches the ticks.
export const GRADE_LIMITS={question:1000,points:20,point:500,transcript:2000};
const SYSTEM='You grade a spoken flashcard answer. The transcript comes from speech recognition and may misspell or mishear words; accept phonetically similar terms and different wording with the same meaning. '+
 'The expected answer is a numbered list of key points. Return only JSON: {"covered":[numbers of key points the answer states correctly],"wrong":true|false,"feedback":"one short, kind sentence naming what was missed or wrong"}. '+
 '"wrong" is true only if the answer states something factually incorrect about the question. Do not give credit for points the answer does not mention.';
export function validateGradeInput(raw){
 const q=typeof raw?.question==='string'?raw.question.trim():'',t=typeof raw?.transcript==='string'?raw.transcript.trim():'';
 const points=Array.isArray(raw?.points)?raw.points.map(p=>typeof p==='string'?p.trim():''):[];
 if(!q||q.length>GRADE_LIMITS.question)throw Error('Send the card question (up to 1,000 characters).');
 if(!t||t.length>GRADE_LIMITS.transcript)throw Error('Send the spoken answer (up to 2,000 characters).');
 if(!points.length||points.length>GRADE_LIMITS.points||points.some(p=>!p||p.length>GRADE_LIMITS.point))throw Error('Send 1 to 20 answer points of up to 500 characters.');
 return {question:q,points,transcript:t};
}
export function gradePrompt(input){
 const user=JSON.stringify({question:input.question,key_points:input.points.map((p,i)=>`${i+1}. ${p}`),transcript:input.transcript});
 const bytes=new TextEncoder().encode(SYSTEM+user).length;
 // Reserve as for text generation: 1 token per byte plus a template allowance, 200 output tokens, 20% margin.
 const reserved=Math.ceil(((bytes+512)*9091+200*27273)/1e6*1.2);
 return {messages:[{role:'system',content:SYSTEM},{role:'user',content:user}],reserved};
}
export function validateGrade(raw,count){
 const covered=[...new Set((Array.isArray(raw?.covered)?raw.covered:[]).map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=count))].sort((a,b)=>a-b);
 const feedback=typeof raw?.feedback==='string'?raw.feedback.replace(/\s+/g,' ').trim().slice(0,300):'';
 return {covered,wrong:raw?.wrong===true,feedback};
}
/** correct: every point and nothing wrong; incorrect: nothing covered, or a wrong claim with points missing. */
export function verdict(covered,total,wrong=false){
 const n=covered.length;if(!n)return 'incorrect';if(n>=total&&!wrong)return 'correct';if(wrong&&n<total)return n/total>=.5?'partial':'incorrect';return 'partial';
}
export const suggestedGrade=v=>v==='correct'?'GOOD':v==='partial'?'HARD':'AGAIN';
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
/** "I don't know" and similar: grade Again without asking the model. */
export function gaveUp(transcript){const t=norm(transcript);return !t||/^(i (really )?(do not|dont|don t) know|no idea|skip|pass|next|not sure|i forgot|forgot)( it)?$/.test(t);}
/** Free check before the model: the points (or each of their words) appear in what was said. */
export function quickMatch(points,transcript){
 const said=' '+norm(transcript)+' ',covered=[];
 points.forEach((p,i)=>{const words=norm(p).split(' ').filter(w=>w.length>2||/\d/.test(w));if(words.length&&words.every(w=>said.includes(' '+w+' ')))covered.push(i+1);});
 return covered;
}
