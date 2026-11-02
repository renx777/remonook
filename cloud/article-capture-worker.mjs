import {extractArticle} from './article-extract.mjs';
// Service-binding only. This worker has no storage, credentials, or private origin.
export default {async fetch(request){try{if(request.method!=='POST')return new Response(null,{status:405});const body=await request.json();const article=await extractArticle(body.url);return Response.json(article);}catch{return Response.json({error:'This page could not be converted to reader mode.'},{status:422});}}};
