import './save-indicator.css';

type State='error'|'attention'|'saving'|'pending'|'saved'|'off';
function CloudSaveIcon({state,details,onOpen}:{state:State;details:string;onOpen:()=>void}){
 return <button type="button" className="save-indicator" data-kind="cloud" data-state={state} title={details} aria-label={`Workspace save status. ${details.replaceAll('\n','. ')}. Open account and sync settings.`} onClick={onOpen}>
   <svg className="save-indicator-logo" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
     <circle className="save-indicator-orbit" cx="12" cy="12" r="11" strokeWidth="1" strokeDasharray="14 55"/>
     <path d="M7 17.5a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 8a4.8 4.8 0 0 1-.5 9.5H7Z"/>
     <circle className="save-indicator-badge" cx="20" cy="19" r="3" stroke="none"/>
     <circle className="save-indicator-mark" cx="20" cy="19" r="1.7" fill="currentColor" stroke="none"/>
   </svg>
 </button>;
}
export function SaveIndicator({device,cloud,onOpen}:{device:string;cloud:{connected:boolean;status:string;error:string;conflict:boolean};onOpen:()=>void}){
 const failed=device==='Changes not saved'||device==='Storage unavailable';
 const cloudState:State=failed?'error':cloud.error?'attention':!cloud.connected?'off':cloud.status==='Syncing…'||cloud.status==='Connecting…'?'saving':cloud.conflict||cloud.status.includes('pending')?'pending':'saved';
 const details=`${cloud.connected?'Cloud: '+(cloud.error||cloud.status):'Cloud: sign in to sync across devices'}\nDevice: ${device}`;
 return <div className="save-indicators" role="group" aria-label="Workspace save status">
   <CloudSaveIcon state={cloudState} details={details} onOpen={onOpen}/>
 </div>;
}
