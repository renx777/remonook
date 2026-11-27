import {studyFolders} from './study-library.mjs';
import {catalogAssetPaths} from './emoji-asset-paths.mjs';
// Shared by local file retention and the server's conservative quota retirement.
export function attachmentReferences(doc){
 const paths=new Set();
 for(const folder of studyFolders(doc))if(folder.image)paths.add(folder.image);
 for(const kind of ['correct','wrong'])for(const reaction of doc.web.quizReactions?.[kind]||[])if(typeof reaction.path==='string')paths.add(reaction.path);
 for(const design of Object.values(doc.web.deckDesigns||{}))if(design&&typeof design.image==='string'&&design.image)paths.add(design.image);
 for(const m of doc.tables.media||[])paths.add('media/'+m.fileName);
 for(const e of doc.tables.emojis||[])for(const path of catalogAssetPaths(e))paths.add(path);
 for(const t of doc.tables.trash||[]){const p=JSON.parse(t.payload);for(const m of p.media||[])paths.add('media/'+m.fileName);}
 return paths;
}
