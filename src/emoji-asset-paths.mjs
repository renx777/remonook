// File retention must not load the display/search emoji catalogues into the sync server.
export function catalogAssetPaths(item){
 const paths=['emoji/'+item.fileName],token=item?.token;
 if(typeof token!=='string')return paths;
 if(/^:noto_[0-9a-f]{2,6}(?:_[0-9a-f]{2,6})*:$/.test(token)&&item.fileName===token.slice(1,-1)+'.webp')paths.push('emoji/'+item.fileName.replace(/\.webp$/,'.svg'),'emoji/noto-LICENSE.txt');
 else if(/^:fluent_[0-9a-f]{2,6}(?:_[0-9a-f]{2,6})*:$/.test(token)&&item.fileName===token.slice(1,-1)+'.png')paths.push('emoji/'+item.fileName.replace(/\.png$/,'.poster.png'),'emoji/fluent-LICENSE.txt');
 return paths;
}
