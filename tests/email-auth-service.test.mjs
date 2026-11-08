import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const calls=[];let verification;
globalThis.__emailAuth={currentUser:{uid:'existing-google',email:'user@example.test',emailVerified:true,providerData:[{providerId:'google.com'}]}};
globalThis.__emailCall=async(name,...args)=>{calls.push([name,...args]);if(name==='create')return {user:globalThis.__emailAuth.currentUser};if(name==='verify')await verification;};
await build({entryPoints:['src/auth-service.ts'],bundle:true,packages:'external',outfile:'tests/.build/email-service.mjs',format:'esm',platform:'node',plugins:[{name:'firebase-fixture',setup(b){
 b.onResolve({filter:/^(firebase\/(app|auth)|\.\/cloud-config)$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='./cloud-config'?`export const CLOUD_ENABLED=true,firebaseConfig={},APP_ENV='test';`:a.path==='firebase/app'?`export const initializeApp=()=>({});`:`
 export const browserLocalPersistence={},browserPopupRedirectResolver=()=>{};
 export const getAuth=()=>globalThis.__emailAuth,initializeAuth=getAuth;
 export class GoogleAuthProvider{setCustomParameters(){};}
 export const signInWithPopup=(...a)=>globalThis.__emailCall('google',...a),signInWithCredential=(...a)=>globalThis.__emailCall('credential',...a),signOut=(...a)=>globalThis.__emailCall('signout',...a);
 export const createUserWithEmailAndPassword=(...a)=>globalThis.__emailCall('create',...a),signInWithEmailAndPassword=(...a)=>globalThis.__emailCall('login',...a);
 export const sendEmailVerification=(...a)=>globalThis.__emailCall('verify',...a),sendPasswordResetEmail=(...a)=>globalThis.__emailCall('reset',...a);
 export const EmailAuthProvider={credential:(email,password)=>({email,password})},linkWithCredential=(...a)=>globalThis.__emailCall('link',...a),reload=(...a)=>globalThis.__emailCall('reload',...a);
 `}));
}}]});
const service=await import('./.build/email-service.mjs');
test('email sign-in trims the email but preserves exact password; credentials stay in Firebase',async()=>{
 await service.emailSignIn(' user@example.test ',' password ');assert.deepEqual(calls.pop(),['login',globalThis.__emailAuth,'user@example.test',' password ']);
 await service.resetPassword(' user@example.test ');assert.deepEqual(calls.pop(),['reset',globalThis.__emailAuth,'user@example.test']);
});
test('signup holds account transition until verification has been attempted',async()=>{
 let finish;verification=new Promise(r=>finish=r);const signup=service.emailSignUp(' new@example.test ','new-password');let settled=false;const transition=service.settleAuthOperation().then(()=>settled=true);
 await new Promise(r=>setTimeout(r,0));assert.equal(settled,false);assert.equal(calls.at(-1)[0],'verify');finish();await signup;await transition;assert.equal(settled,true);verification=undefined;
});
test('adding a password links credentials to the existing verified Google user without changing UID',async()=>{
 const user=globalThis.__emailAuth.currentUser;await service.addPassword('new-password');assert.deepEqual(calls.pop(),['link',user,{email:'user@example.test',password:'new-password'}]);assert.equal(service.authenticatedUid(),'existing-google');
 user.emailVerified=false;await assert.rejects(service.addPassword('new-password'),/Verify your email/);user.emailVerified=true;
});
