import {defineScheduler,dateChrono,Rating,State,schedulerDesiredRetentionMiddleware,schedulerFuzzingMiddleware,schedulerStatsMiddleware,schedulerScheduledDaysMiddleware,schedulerLearningStepsMiddleware,schedulerMaximumIntervalMiddleware,schedulerMonotonicIntervalMiddleware} from 'ts-fsrs';
import {FSRS6Model,FSRS6_DEFAULT_WEIGHTS} from 'ts-fsrs/models/fsrs-6';

export const FSRS_VERSION='FSRS-6';
export const FSRS_DEFAULTS=Object.freeze({retention:.9,maximumInterval:36500});
const definition=defineScheduler({model:FSRS6Model,chrono:dateChrono}).use(schedulerDesiredRetentionMiddleware,schedulerFuzzingMiddleware,schedulerStatsMiddleware,schedulerScheduledDaysMiddleware,schedulerLearningStepsMiddleware,schedulerMaximumIntervalMiddleware,schedulerMonotonicIntervalMiddleware);
const cache=new Map();
export function fsrsSettings(doc,deckId){
 const global=doc?.preferences?.study_preferences||{},limit=doc?.tables?.study_limits?.find(l=>l.deckId===deckId);
 return {retention:limit?.retention??global.fsrsRetention??FSRS_DEFAULTS.retention,maximumInterval:global.fsrsMaximumInterval??FSRS_DEFAULTS.maximumInterval};
}
function engine(options={}){
 const {retention,maximumInterval}={...FSRS_DEFAULTS,...options};
 if(!Number.isFinite(retention)||retention<.8||retention>.97||!Number.isInteger(maximumInterval)||maximumInterval<1||maximumInterval>36500)throw Error('Invalid spaced repetition settings.');
 const key=retention+':'+maximumInterval;
 if(!cache.has(key)){
  if(cache.size>=64)cache.delete(cache.keys().next().value);
  cache.set(key,definition.create({config:{weights:[...FSRS6_DEFAULT_WEIGHTS],enableShortTerm:true,numRelearningSteps:1,desiredRetention:retention,learningSteps:['1m','10m'],relearningSteps:['10m'],allowModelOverride:false,enableFuzz:false,maximumInterval}}));
 }
 return cache.get(key);
}
const parsedStates=new WeakMap();
const finiteTime=n=>Number.isSafeInteger(n)&&n>=0&&n<=8640000000000000;
export function readFsrs(card){
 if(!card.fsrsState)return null;
 const cached=parsedStates.get(card);if(cached?.json===card.fsrsState&&cached?.last===card.lastReviewAtEpochMillis)return cached.value;
 let value;try{value=JSON.parse(card.fsrsState);}catch{throw Error('Invalid FSRS card state.');}
 const c=value?.card;
 if(value?.version!==FSRS_VERSION||!c||!finiteTime(c.dueAt)||!finiteTime(c.lastReviewAt)||![1,2,3].includes(c.state)||!Number.isFinite(c.stability)||c.stability<=0||!Number.isFinite(c.difficulty)||c.difficulty<1||c.difficulty>10||!['reps','lapses','learningStep','scheduledDays'].every(k=>Number.isInteger(c[k])&&c[k]>=0))throw Error('Invalid FSRS card state.');
 // An Android/older client may have graded the legacy fields after this snapshot.
 if(c.lastReviewAt!==card.lastReviewAtEpochMillis)return null;
 const result={...c,dueAt:new Date(c.dueAt),lastReviewAt:new Date(c.lastReviewAt)};parsedStates.set(card,{json:card.fsrsState,last:card.lastReviewAtEpochMillis,value:result});return result;
}
const packMemory=c=>[c.stability,c.difficulty,c.state,c.dueAt.getTime(),c.lastReviewAt?.getTime()??null,c.reps,c.lapses,c.scheduledDays,c.learningStep];
const serial=c=>({...c,dueAt:c.dueAt.getTime(),lastReviewAt:c.lastReviewAt?.getTime()??null});
export function fsrsInput(card,now,options={},history=[]){
 const saved=readFsrs(card);if(saved)return saved;
 const scheduler=engine(options),seed=scheduler.newCard({now:new Date(now),cardId:card.id||'card'});
 const logs=history.filter(l=>l.mode==='SPACED'&&l.cardId===card.id&&typeof l.grade==='string'&&Rating[l.grade[0]+l.grade.slice(1).toLowerCase()]&&finiteTime(l.reviewedAtEpochMillis)&&l.reviewedAtEpochMillis<=now).sort((a,b)=>a.reviewedAtEpochMillis-b.reviewedAtEpochMillis||Number(a.id)-Number(b.id));
 if(logs.length&&logs.at(-1).reviewedAtEpochMillis===card.lastReviewAtEpochMillis){
  let replay=scheduler.newCard({now:new Date(logs[0].reviewedAtEpochMillis),cardId:card.id});for(const l of logs)replay=scheduler.review({card:replay,now:new Date(l.reviewedAtEpochMillis),grade:Rating[l.grade[0]+l.grade.slice(1).toLowerCase()]}).card;
  return {...replay,dueAt:new Date(card.dueAtEpochMillis??now)};
 }
 if(card.lastReviewAtEpochMillis>0||card.repetitionCount>0){
  // With no complete history, seed memory from the existing interval, without moving its due date.
  return {...seed,state:card.intervalDays>0?State.Review:State.Relearning,scheduleStatus:card.intervalDays>0?'review':'relearning',stability:Math.max(.1,Number(card.stability)||Number(card.intervalDays)||1),difficulty:Math.max(1,Math.min(10,Number(card.difficulty)||5)),reps:Math.max(1,Number(card.repetitionCount)||1),lapses:0,scheduledDays:Math.max(0,Number(card.intervalDays)||0),lastReviewAt:new Date(Math.min(now,Number(card.lastReviewAtEpochMillis)||now)),dueAt:new Date(card.dueAtEpochMillis??now)};
 }
 return {...seed,dueAt:new Date(card.dueAtEpochMillis??now)};
}
export function scheduleFsrs(card,grade,now,options={},history=[]){
 if(!['AGAIN','HARD','GOOD','EASY'].includes(grade))throw Error('Invalid grade');
 if(!finiteTime(now))throw Error('Invalid review time');
 const scheduler=engine(options),before=fsrsInput(card,now,options,history);
 if(before.lastReviewAt&&before.lastReviewAt.getTime()>now)throw Error('This card was reviewed later on another device. Check this device’s clock.');
 const result=scheduler.review({card:before,now:new Date(now),grade:Rating[grade[0]+grade.slice(1).toLowerCase()]});
 return {...card,stability:result.card.stability,difficulty:result.card.difficulty,retrievability:1,repetitionCount:result.card.reps,intervalDays:result.card.scheduledDays,lastReviewAtEpochMillis:now,dueAtEpochMillis:result.card.dueAt.getTime(),fsrsState:JSON.stringify({version:FSRS_VERSION,card:serial(result.card)}),fsrsReview:JSON.stringify({v:6,r:options.retention??.9,m:options.maximumInterval??36500,b:packMemory(before),a:packMemory(result.card)})};
}
export function memoryInfo(card,now=Date.now()){
 const c=readFsrs(card);if(!c)return null;
 const elapsed=Math.max(0,(now-c.lastReviewAt.getTime())/86400000);
 return {state:['New','Learning','Review','Relearning'][c.state],stability:c.stability,difficulty:c.difficulty,reps:c.reps,lapses:c.lapses,retrievability:engine().model.forgettingCurve(c,elapsed),dueAt:c.dueAt.getTime()};
}
export function validateFsrs(doc){
 engine(fsrsSettings(doc));
 for(const limit of doc.tables.study_limits||[])if(limit.retention!=null)engine({...fsrsSettings(doc),retention:limit.retention});
 for(const c of doc.tables.cards||[])if(c.fsrsState)readFsrs(c);
}

// Expand compact history without retaining a second copy of its timestamps and rating.
export function readFsrsReview(log){
 if(!log.fsrsReview)return null;
 const v=JSON.parse(log.fsrsReview);
 const expand=([stability,difficulty,state,dueAt,lastReviewAt,reps,lapses,scheduledDays,learningStep])=>({cardId:log.cardId,stability,difficulty,state,dueAt,lastReviewAt,reps,lapses,scheduledDays,learningStep});
 if(v.v!==6||!Array.isArray(v.b)||v.b.length!==9||!Array.isArray(v.a)||v.a.length!==9)throw Error('Invalid FSRS review snapshot.');
 return {version:FSRS_VERSION,retention:v.r,maximumInterval:v.m,before:expand(v.b),after:expand(v.a)};
}
