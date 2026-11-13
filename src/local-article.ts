import {Readability} from '@mozilla/readability';
import DOMPurify from 'dompurify';
import {desktopInvoke,isApp} from './desktop';
import {digest} from './data-store';
export async function captureLocalArticle(url:string){
 let page:{url:string;html:string};
 if(isApp())page=await desktopInvoke('local_article_fetch',{url});
 else{const response=await fetch(url,{credentials:'omit',signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error('This page could not be saved. Your link is kept.');const html=await response.text();if(html.length>5*1024*1024)throw Error('This page is too large.');page={url:response.url||url,html};}
 const clean=DOMPurify.sanitize(page.html,{WHOLE_DOCUMENT:true,FORBID_TAGS:['img','iframe','object','embed','form','video','audio','source','svg','math']});
 const doc=new DOMParser().parseFromString(clean,'text/html');
 for(const a of doc.querySelectorAll('a[href]')){try{const link=new URL(a.getAttribute('href')!,page.url);if(!/^https?:$/.test(link.protocol))a.removeAttribute('href');else a.setAttribute('href',link.href);}catch{a.removeAttribute('href');}}
 const parsed=new Readability(doc,{charThreshold:100,maxElemsToParse:30000}).parse();
 if(!parsed?.textContent||parsed.textContent.trim().length<100)throw Error('No readable article found. Your link is saved; you can still open the original.');
 const article={schema:1,url:page.url,title:parsed.title||new URL(page.url).hostname,byline:parsed.byline||'',excerpt:parsed.excerpt||'',html:DOMPurify.sanitize(parsed.content||''),text:parsed.textContent,capturedAt:Date.now(),captureVersion:2,imageCount:0};
 const blob=new Blob([JSON.stringify(article)],{type:'application/json'});if(blob.size>2*1024*1024)throw Error('This article is too large for a saved copy.');
 return {article,blob,hash:await digest(await blob.arrayBuffer())};
}
