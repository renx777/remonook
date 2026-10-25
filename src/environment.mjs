/** Build-time configuration; local development never inherits production services.
 * @param {Record<string,string|undefined>} env
 */
export function resolveEnvironment(env={}) {
 const name=env.VITE_REMO_ENV||'local';
 if(!['local','staging','production'].includes(name))throw Error('VITE_REMO_ENV must be local, staging or production.');
 const local=name==='local';
 const get=key=>{const value=env[key]?.trim();if(!value||/^(YOUR_|REPLACE_|CHANGE_)/.test(value))throw Error(`Missing environment setting: ${key}`);return value;};
 const firebase=local?{apiKey:'local-development-only',authDomain:'localhost',projectId:'demo-remo-local',storageBucket:'',messagingSenderId:'',appId:'local-development-only'}:{apiKey:get('VITE_FIREBASE_API_KEY'),authDomain:get('VITE_FIREBASE_AUTH_DOMAIN'),projectId:get('VITE_FIREBASE_PROJECT_ID'),storageBucket:env.VITE_FIREBASE_STORAGE_BUCKET||'',messagingSenderId:get('VITE_FIREBASE_MESSAGING_SENDER_ID'),appId:get('VITE_FIREBASE_APP_ID')};
 const cloudApi=local?'':get('VITE_CLOUD_API');
 if(!local){
  const url=new URL(cloudApi);if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.hash||url.username||url.password)throw Error('VITE_CLOUD_API must be an HTTPS origin.');
  if(name==='staging'&&(firebase.projectId==='remo-978fb'||url.hostname==='remo-sync.remo-978fb.workers.dev'))throw Error('Staging cannot use the production Firebase project or sync API.');
  if(name==='production'&&(firebase.projectId!=='remo-978fb'||url.hostname!=='remo-sync.remo-978fb.workers.dev'))throw Error('Production configuration does not match the existing Remo services.');
 }
 return {name,cloudEnabled:!local,cloudApi:cloudApi.replace(/\/$/,''),firebase};
}
