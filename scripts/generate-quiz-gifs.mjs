// Original, offline reaction art. Re-run with: node scripts/generate-quiz-gifs.mjs
import gifenc from "gifenc";
const { GIFEncoder } = gifenc;
import { mkdir, writeFile } from "node:fs/promises";
const width = 160, height = 120;
const palette = [[245,246,250],[36,42,55],[160,214,148],[255,211,100],[167,146,217],[241,166,121],[255,255,255],[237,126,163],[86,171,216],[218,225,235]];
await mkdir("src/assets/reactions", { recursive: true });
for (const [name, type] of [["victory-wiggle",0],["tiny-trophy",1],["brain-buffering",2],["plot-twist",3]]) {
  const gif = GIFEncoder();
  for (let frame = 0; frame < 20; frame++) {
    const data = new Uint8Array(width * height), t = frame / 20 * Math.PI * 2;
    const dot = (x,y,c) => { x=Math.round(x); y=Math.round(y); if(x>=0&&x<width&&y>=0&&y<height)data[y*width+x]=c; };
    const ellipse = (cx,cy,rx,ry,c) => { for(let y=Math.floor(cy-ry);y<=cy+ry;y++)for(let x=Math.floor(cx-rx);x<=cx+rx;x++)if(((x-cx)/rx)**2+((y-cy)/ry)**2<=1)dot(x,y,c); };
    const rect = (x,y,w,h,c) => { for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)dot(i,j,c); };
    const line = (x,y,xx,yy,c,size=2) => { const n=Math.max(Math.abs(xx-x),Math.abs(yy-y),1); for(let a=0;a<=n;a++)ellipse(x+(xx-x)*a/n,y+(yy-y)*a/n,size,size,c); };
    ellipse(80,104,34,5,9);
    const dx = Math.sin(t)*5, dy = (type<2 ? -Math.abs(Math.sin(t))*8 : Math.sin(t)*2);
    if(type===1) {
      ellipse(80+dx,55+dy,29,27,3); rect(65+dx,48+dy,30,27,3); rect(76+dx,74+dy,8,18,3); rect(59+dx,90+dy,42,7,3);
      line(54+dx,47+dy,43+dx,49+dy,3,4); line(43+dx,49+dy,49+dx,68+dy,3,4); line(106+dx,47+dy,117+dx,49+dy,3,4); line(117+dx,49+dy,111+dx,68+dy,3,4);
    } else {
      ellipse(80+dx,67+dy,38,32,type===0?2:type===2?4:5);
      line(48+dx,73+dy,31+dx,60+Math.sin(t)*12,1,3);
      line(111+dx,73+dy,128+dx,type===3?48:60-Math.sin(t)*12,1,3);
      ellipse(64+dx,99+dy,11,4,1); ellipse(96+dx,99+dy,11,4,1);
    }
    if(type===0) { rect(54+dx,53+dy,23,13,1); rect(84+dx,53+dy,23,13,1); line(76+dx,57+dy,85+dx,57+dy,1); line(59+dx,56+dy,67+dx,56+dy,6,1); }
    else { ellipse(66+dx,59+dy,3,5,1); ellipse(94+dx,59+dy,3,5,1); }
    if(type<2) { ellipse(80+dx,76+dy,11,8,1); rect(69+dx,67+dy,24,8,type===0?2:3); }
    else if(type===2) { ellipse(80+dx,80+dy,5,4,1); for(let i=0;i<3;i++)ellipse(68+i*12,21,3,3,frame%12/4>=i?4:9); }
    else { line(73+dx,80+dy,87+dx,76+dy,1,2); ellipse(105+dx,49+dy,15,8,5); line(119+dx,68+dy,105+dx,49+dy,5,6); }
    if(type<2)for(let i=0;i<12;i++){const x=(i*37+frame*3)%156,y=(i*19+frame*5)%104;rect(x,y,3,5,[3,7,8][i%3]);}
    gif.writeFrame(data,width,height,{palette,delay:80,repeat:2});
  }
  gif.finish();
  await writeFile(`src/assets/reactions/${name}.gif`,gif.bytes());
}
