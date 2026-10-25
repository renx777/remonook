import './save-indicator.css';

type FolderStatus={name:string;message:string;busy:boolean;pending:boolean;enabled:boolean;permission:boolean};
type State='error'|'attention'|'saving'|'pending'|'saved'|'off';
function SaveIcon({kind,state,details,onOpen}:{kind:'cloud'|'folder';state:State;details:string;onOpen:()=>void}){
 return <button type="button" className="save-indicator" data-kind={kind} data-state={state} title={details} aria-label={`${kind==='cloud'?'Cloud sync':'Folder storage'} status. ${details.replaceAll('\n','. ')}. Open Settings and backups.`} onClick={onOpen}>
   <svg className="save-indicator-logo" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
     <circle className="save-indicator-orbit" cx="12" cy="12" r="11" strokeWidth="1" strokeDasharray="14 55"/>
     <path d={kind==='cloud'?'M7 17.5a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 8a4.8 4.8 0 0 1-.5 9.5H7Z':'M4 9V6a1 1 0 0 1 1-1h5l2 3h7a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9Z'}/>
     <circle className="save-indicator-badge" cx="20" cy="19" r="3" stroke="none"/>
     <circle className="save-indicator-mark" cx="20" cy="19" r="1.7" fill="currentColor" stroke="none"/>
   </svg>
 </button>;
}
export function SaveIndicator({device,cloud,folder,onOpen}:{device:string;cloud:{connected:boolean;status:string;error:string;conflict:boolean};folder:FolderStatus;onOpen:()=>void}){
 const failed=device==='Changes not saved'||device==='Storage unavailable';
 const cloudState:State=failed?'error':cloud.error||cloud.conflict?'attention':!cloud.connected?'off':cloud.status==='Syncing…'||cloud.status==='Connecting…'?'saving':cloud.status.includes('pending')?'pending':'saved';
 const folderState:State=failed?'error':!folder.name?'off':folder.busy?'saving':!folder.enabled||!folder.permission?'attention':folder.pending?'pending':'saved';
 const local=`Device: ${device}`;
 return <div className="save-indicators" role="group" aria-label="Save status">
   <SaveIcon kind="cloud" state={cloudState} details={`${cloud.connected?'Cloud: '+(cloud.error||cloud.status):'Cloud: sign in to enable sync'}\n${local}`} onOpen={onOpen}/>
   <SaveIcon kind="folder" state={folderState} details={`${folder.name?`Folder (${folder.name}): ${folder.message}`:'Folder: no folder connected'}\n${local}`} onOpen={onOpen}/>
 </div>;
}
