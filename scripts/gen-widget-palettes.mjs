import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const data=JSON.parse(readFileSync(root+'docs/widgets/palettes.json','utf8'));
const base=root+'src-tauri/gen/android/app/src/main/res/';
const shapes=[['28','28dp'],['16','16dp'],['pill','999dp']];
const header='<?xml version="1.0" encoding="utf-8"?>\n<!-- Generated from docs/widgets/palettes.json. -->\n';

export function outputs(){
 const files=new Map();
 for(const mode of ['light','dark']){
  const colors=[];
  for(const [id,palette] of Object.entries(data.palettes)){
   for(const [role,color] of Object.entries({...palette[mode],...data.grades[mode]})){
    colors.push('    <color name="widget_'+id+'_'+role.toLowerCase()+'">'+color+'</color>');
   }
  }
  const directory=mode==='dark'?'values-night':'values';
  files.set(base+directory+'/widget_palette_colors.xml',header+'<resources>\n'+colors.join('\n')+'\n</resources>\n');
 }
 const roles=[...Object.keys(data.roles),...Object.keys(data.grades.light)];
 for(const id of Object.keys(data.palettes)){
  for(const role of roles){
   for(const [shape,radius] of shapes){
    const name='widget_'+id+'_'+role.toLowerCase();
    files.set(base+'drawable/'+name+'_'+shape+'.xml',header+
     '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">'+
     '<solid android:color="@color/'+name+'"/><corners android:radius="'+radius+'"/></shape>\n');
   }
  }
  files.set(base+'drawable/widget_'+id+'_progress.xml',header+
   '<layer-list xmlns:android="http://schemas.android.com/apk/res/android">'+
   '<item android:id="@android:id/background"><shape><solid android:color="@color/widget_'+id+'_outline"/><corners android:radius="999dp"/></shape></item>'+
   '<item android:id="@android:id/progress"><clip><shape><solid android:color="@color/widget_'+id+'_heroaccent"/><corners android:radius="999dp"/></shape></clip></item></layer-list>\n');
 }
 for(const [shape,radius] of shapes){
  files.set(base+'drawable/widget_shape_'+shape+'.xml',
   '<shape xmlns:android="http://schemas.android.com/apk/res/android"><solid android:color="@color/widget_marigold_surface"/><corners android:radius="'+radius+'"/></shape>\n');
 }
 files.set(base+'drawable-v31/widget_shape_28.xml',
  '<shape xmlns:android="http://schemas.android.com/apk/res/android"><solid android:color="@color/widget_marigold_surface"/><corners android:radius="@android:dimen/system_app_widget_background_radius"/></shape>\n');
 return files;
}
if(process.argv.includes('--check')){
 for(const [path,expected] of outputs()){
  if(readFileSync(path,'utf8')!==expected)throw Error('Regenerate widget palettes: '+path);
 }
}else if(process.argv[1]===fileURLToPath(import.meta.url)){
 for(const [path,value] of outputs()){
  mkdirSync(path.slice(0,path.lastIndexOf('/')),{recursive:true});
  writeFileSync(path,value);
 }
}
