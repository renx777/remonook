import {save,syncOperation} from './data-store';
let chain=Promise.resolve();
self.onmessage=event=>{
 const {id,kind,operation,account,args}=event.data;
 chain=chain.then(async()=>{
  try{
   if(account!=='remo-web'&&!account.startsWith('remo-web-user-'))throw Error('Invalid storage account.');
   let value;
   if(kind==='save'){const saved=await save(args[0],args[1],args[2],args[3],args[4],args[5],args[6],account);value={revision:saved.revision};}
   else value=await syncOperation(operation,args,account);
   self.postMessage({id,value});
  }catch(error){const e=error as Error&{status?:number;deferred?:boolean};self.postMessage({id,error:{message:e.message,status:e.status,deferred:e.deferred}});}
 });
};
self.postMessage({ready:true});
