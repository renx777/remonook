import {storageAccountKey} from './data-store';
import type {User} from 'firebase/auth';
import {CLOUD_API} from './cloud-config';
import {authenticatedUid} from './CloudAccount';
import {cacheArticle,cachedArticle,cachedArticles,articleAccount} from './article-cache.mjs';
export async function articleRequest(user:User,path:string,init:RequestInit={}){
 if(authenticatedUid()!==user.uid)throw Error('Your account changed. Open the article again.');
 const response=await fetch(CLOUD_API+path,{...init,headers:{...Object.fromEntries(new Headers(init.headers)),Authorization:'Bearer '+await user.getIdToken()}});
 if(authenticatedUid()!==user.uid)throw Error('Your account changed. Open the article again.');
 if(!response.ok){let message='Article request failed.';try{message=(await response.json()).error||message;}catch{}throw Error(message);}return response;
}
export async function getArticle(user:User|null,hash:string){
 const account=user?articleAccount(user.uid):storageAccountKey(),local=await cachedArticle(account,hash);if(local)return local.blob;
 if(!user)throw Error('This article has not been saved on this device.');
 const blob=await(await articleRequest(user,'/bookmarks/snapshots/'+hash)).blob();await cacheArticle(account,hash,blob);return blob;
}
export async function uploadCachedArticles(user:User,hashes?:Set<string>){
 for(const item of await cachedArticles(articleAccount(user.uid)))if(item.pending&&(!hashes||hashes.has(item.hash))){await articleRequest(user,'/bookmarks/snapshots/'+item.hash,{method:'PUT',body:item.blob});await cacheArticle(articleAccount(user.uid),item.hash,item.blob,false);}
}
