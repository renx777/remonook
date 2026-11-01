import {useSyncExternalStore} from 'react';
import type {createUiSignal} from './ui-signal';
import './save-indicator.css';
export function SaveIndicator({device,cloud,onOpen,pending=false}:{device:string;cloud:{connected:boolean;status:string;error:string;conflict:boolean};onOpen:()=>void;pending?:boolean}){
 const failure=cloud.error || (device==='Changes not saved'||device==='Storage unavailable'?device:'');
 const cloudStatus=(pending||device==='Saving…')&&cloud.status==='Synced'?'Changes pending':cloud.status;
 const details=`${cloud.connected?'Cloud: '+(cloud.error||cloudStatus):'Cloud: sign in to sync across devices'}\nDevice: ${device}`;
 return failure ? <button className="save-error" role="alert" onClick={onOpen}>{failure}<span>Open account</span></button> : <span className="save-status" role="status" title={details}>{details}</span>;
}

export function DeviceSaveIndicator({signal,isPending,...props}:Omit<Parameters<typeof SaveIndicator>[0],'device'>&{signal:ReturnType<typeof createUiSignal<string>>;isPending?:()=>boolean}){const device=useSyncExternalStore(signal.subscribe,signal.get,signal.get);return <SaveIndicator device={device} pending={isPending?.()} {...props}/>;}

export function CloudDeviceSaveIndicator({cloudSignal,connected,...props}:Omit<Parameters<typeof DeviceSaveIndicator>[0],'cloud'>&{cloudSignal:ReturnType<typeof createUiSignal<{status:string;error:string}>>;connected:boolean}){
 const state=useSyncExternalStore(cloudSignal.subscribe,cloudSignal.get,cloudSignal.get);
 return <DeviceSaveIndicator {...props} cloud={{...state,connected,conflict:false}}/>;
}
export function CloudAccountStatus({signal,error=false}:{signal:ReturnType<typeof createUiSignal<{status:string;error:string}>>;error?:boolean}){
 const state=useSyncExternalStore(signal.subscribe,signal.get,signal.get);
 return error?(state.error?<p className="cloud-error" role="status">{state.error}</p>:null):<span className="cloud-state">{state.status}</span>;
}
