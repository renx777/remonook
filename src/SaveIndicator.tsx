import './save-indicator.css';
export function SaveIndicator({device,cloud,onOpen}:{device:string;cloud:{connected:boolean;status:string;error:string;conflict:boolean};onOpen:()=>void}){
 const failure=cloud.error || (device==='Changes not saved'||device==='Storage unavailable'?device:'');
 const details=`${cloud.connected?'Cloud: '+(cloud.error||cloud.status):'Cloud: sign in to sync across devices'}\nDevice: ${device}`;
 return failure ? <button className="save-error" role="alert" onClick={onOpen}>{failure}<span>Open account</span></button> : <span className="save-status" role="status" title={details}>{details}</span>;
}
