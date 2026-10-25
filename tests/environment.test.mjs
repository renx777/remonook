import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveEnvironment} from '../src/environment.mjs';
const staging={VITE_REMO_ENV:'staging',VITE_CLOUD_API:'https://sync-staging.example.com',VITE_FIREBASE_API_KEY:'test-key',VITE_FIREBASE_AUTH_DOMAIN:'test-project.firebaseapp.com',VITE_FIREBASE_PROJECT_ID:'test-project',VITE_FIREBASE_MESSAGING_SENDER_ID:'123',VITE_FIREBASE_APP_ID:'test-app'};
test('local defaults have no cloud API or production Firebase project',()=>{const c=resolveEnvironment();assert.equal(c.name,'local');assert.equal(c.cloudEnabled,false);assert.equal(c.cloudApi,'');assert.notEqual(c.firebase.projectId,'remo-978fb');});
test('cloud modes fail closed on missing config and reject production resources in staging',()=>{
 assert.throws(()=>resolveEnvironment({VITE_REMO_ENV:'unknown'}));
 assert.throws(()=>resolveEnvironment({VITE_REMO_ENV:'staging'}),/Missing/);
 assert.throws(()=>resolveEnvironment({...staging,VITE_CLOUD_API:'http://localhost'}),/HTTPS/);
 assert.throws(()=>resolveEnvironment({...staging,VITE_FIREBASE_PROJECT_ID:'remo-978fb'}),/Staging cannot/);
 assert.throws(()=>resolveEnvironment({...staging,VITE_CLOUD_API:'https://remo-sync.remo-978fb.workers.dev'}),/Staging cannot/);
 assert.equal(resolveEnvironment(staging).cloudEnabled,true);
 assert.throws(()=>resolveEnvironment({...staging,VITE_REMO_ENV:'production'}),/Production configuration/);
});
