// A browsing checkpoint is distinct from synchronized completion. Scrolling must
// never mark pages read or advance the Daily Reading completion record.
const key=(uid:string,hash:string)=>'remo-reader-location:'+uid+':'+hash;
export function readerLocation(uid:string|undefined,hash:string):number|null{
 if(!uid)return null;try{const value=window.localStorage.getItem(key(uid,hash));if(value===null||!/^\d{1,4}$/.test(value))return null;return Number(value);}catch{return null;}
}
export function keepReaderLocation(uid:string|undefined,hash:string,unit:number){
 if(!uid||!Number.isInteger(unit)||unit<0||unit>=10000)return;try{window.localStorage.setItem(key(uid,hash),String(unit));}catch{/* Reading works when local preference storage is unavailable. */}
}
