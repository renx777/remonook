// Widget palettes (docs/widgets/palettes.json) are the single source for Android and macOS widget
// colours. Every text pair must keep WCAG AA contrast (4.5:1) in light and dark mode.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const P=JSON.parse(readFileSync(new URL('../docs/widgets/palettes.json',import.meta.url),'utf8'));
const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(x=>x<=0.03928?x/12.92:((x+0.055)/1.055)**2.4);return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];};
const ratio=(a,b)=>{const[x,y]=[lum(a),lum(b)].sort((m,n)=>n-m);return (x+0.05)/(y+0.05);};
const TEXT_PAIRS=[['onSurface','surface'],['onSurface','surfaceAlt'],['muted','surface'],['muted','surfaceAlt'],['eyebrow','surface'],['onPrimary','primary'],['onAccent','accent'],['onHero','hero'],['heroAccent','hero']];
const IDS=['marigold','iris','forest','graphite'];

test('the four palettes exist with every role in light and dark', ()=>{
  assert.deepEqual(Object.keys(P.palettes),IDS);assert.ok(IDS.includes(P.default));
  for(const id of IDS)for(const mode of ['light','dark'])for(const role of Object.keys(P.roles))assert.match(P.palettes[id][mode][role]||'',/^#[0-9A-F]{6}$/,`${id}.${mode}.${role}`);
});

test('every text pair meets 4.5:1 in every palette and mode', ()=>{
  for(const id of IDS)for(const mode of ['light','dark']){const t=P.palettes[id][mode];
    for(const [fg,bg] of TEXT_PAIRS)assert.ok(ratio(t[fg],t[bg])>=4.5,`${id}.${mode} ${fg} on ${bg}: ${ratio(t[fg],t[bg]).toFixed(2)}`);}
  for(const mode of ['light','dark']){const g=P.grades[mode];for(const n of ['again','hard','good'])assert.ok(ratio(g[n+'Fg'],g[n+'Bg'])>=4.5,`grade ${mode} ${n}`);}
});

test('grade buttons differ in lightness, not hue alone', ()=>{
  for(const id of IDS)for(const mode of ['light','dark']){const g=P.grades[mode],easy=P.palettes[id][mode].primary;
    const ls=[g.againBg,g.hardBg,g.goodBg,easy].map(lum);assert.ok(Math.max(...ls)-Math.min(...ls)>0.1,`${id}.${mode} grade backgrounds too close in lightness`);}
});
