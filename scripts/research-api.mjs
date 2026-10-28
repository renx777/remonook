import {researchSearch} from '../cloud/research-worker.mjs';
// Use the same endpoint in Vite and the deployed staging Worker.
export function researchApi(){return {name:'research-api',configureServer(server){server.middlewares.use('/api/research/search',async(req,res)=>{
 try{
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4096){res.statusCode=400;res.end('{"error":"Search query is too long."}');return;}chunks.push(chunk);}
  const request=new Request('http://'+req.headers.host+'/api/research/search',{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
  const response=await researchSearch(request);res.statusCode=response.status;response.headers.forEach((v,k)=>res.setHeader(k,v));res.end(await response.text());
 }catch{res.statusCode=502;res.setHeader('Content-Type','application/json');res.end('{"error":"Search could not be reached. Please try again."}');}
 });}};}
