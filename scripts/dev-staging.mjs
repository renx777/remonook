import {readFile} from 'node:fs/promises';import {spawn} from 'node:child_process';
const example=await readFile(new URL('../.env.staging.example',import.meta.url),'utf8'),config=Object.fromEntries(example.split('\n').filter(line=>/^VITE_[A-Z_]+=/.test(line)).map(line=>{const at=line.indexOf('=');return[line.slice(0,at),line.slice(at+1).trim().replace(/^['"]|['"]$/g,'')];}));
if(config.VITE_FIREBASE_PROJECT_ID!=='remonook-staging')throw Error('Local cloud development must use staging.');
const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','--mode','staging','--host','127.0.0.1','--port','5173','--strictPort'],{stdio:'inherit',env:{...process.env,...config,VITE_REMO_ENV:'staging'}});child.on('exit',code=>process.exit(code??1));
