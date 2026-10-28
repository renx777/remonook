import {build} from 'esbuild';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {brandGraph,publicPaths,renderPublicPage} from '../src/public-site.mjs';

// Render the same public Landing component used by the browser. Account data and
// the workspace are never loaded by this entry. CSS remains in Vite's app bundle.
async function renderLanding(root){
 const directory=resolve(root,'node_modules/.cache/remonook-public');await mkdir(directory,{recursive:true});
 const file=resolve(directory,`landing-${crypto.randomUUID()}.mjs`);
 try{
  await build({stdin:{contents:`import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {Landing} from './src/Landing';export default renderToStaticMarkup(createElement(Landing,{onSignIn:async()=>{}}));`,resolveDir:root,sourcefile:'public-landing.tsx'},outfile:file,bundle:true,packages:'external',platform:'node',format:'esm',jsx:'automatic',loader:{'.css':'empty'}});
  return (await import(pathToFileURL(file).href)).default;
 }finally{await unlink(file).catch(()=>{});}
}

export function publicPages(){
 let root,mode,landing;
 return {
  name:'remonook-public-pages',
  configResolved(config){root=config.root;mode=process.env.VITE_REMO_ENV||config.mode;},
  transformIndexHtml:{order:'pre',async handler(html){
   landing??=renderLanding(root);
   return html.replace('<div id="root"></div>',`<div id="root">${await landing}</div>`).replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/,`<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@graph':brandGraph()})}</script>`);
  }},
  configureServer(server){
   server.middlewares.use((req,res,next)=>{
    const path=new URL(req.url,'http://localhost').pathname.replace(/\/$/,'');
    const page=renderPublicPage(path,{noindex:mode==='staging'});
    if(!page)return next();res.statusCode=200;res.setHeader('Content-Type','text/html; charset=utf-8');res.end(page);
   });
  },
  handleHotUpdate({file,server}){if(/\/(Landing|TypingWordmark|public-site|public-brand)\./.test(file)){landing=undefined;server.ws.send({type:'full-reload'});}},
  generateBundle(){
   for(const path of publicPaths.filter(path=>path!=='/'))this.emitFile({type:'asset',fileName:path.slice(1)+'.html',source:renderPublicPage(path,{noindex:mode==='staging'})});
  },
 };
}
