import {cp,mkdir,readdir} from 'node:fs/promises';
await mkdir('public/excalidraw',{recursive:true});
await cp('node_modules/@excalidraw/excalidraw/dist/prod/fonts','public/excalidraw/fonts',{recursive:true});
await mkdir('public/excalidraw/licenses',{recursive:true});
for(const file of (await readdir('LICENSES')).filter(file=>file.startsWith('excalidraw-'))){
 await cp('LICENSES/'+file,'public/excalidraw/licenses/'+file);
}
