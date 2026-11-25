import test from 'node:test';
import assert from 'node:assert/strict';
import {labelRegions} from '../src/occlusion-detect.mjs';
import {validMasks} from '../src/occlusion.mjs';
const w=(text,x0,y0,x1,y1,confidence=95)=>({text,confidence,bbox:{x0,y0,x1,y1}});
let n=0;const uuid=()=>'r'+(++n);

test('each text label becomes one occlusion region named after it', ()=>{
  const lines=[[w('Nucleus',63,125,178,148)],[w('Cell',702,125,754,148),w('membrane',769,125,928,148)],[w('Mitoc',63,565,139,588)],[w('dria',199,565,253,588)],[w('lasm',791,565,857,588)],[w('Cy',702,566,738,594)]];
  const r=labelRegions(lines,1000,700,[],{uuid});
  assert.deepEqual(r.map(x=>x.label),['Nucleus','Cell membrane','Mitoc dria','Cy lasm']);
  assert.ok(validMasks(r),'regions satisfy the occlusion rules');
  assert.ok(r.every(x=>x.x>=0&&x.y>=0&&x.x+x.w<=1&&x.y+x.h<=1));
  assert.ok(r[0].x<63/1000&&r[0].x+r[0].w>178/1000,'padding covers the whole word');
});

test('labels far apart on one row stay separate; noise and existing regions are skipped', ()=>{
  const row=[[w('Left',10,100,60,120),w('Right',600,100,680,120),w('|',300,100,305,120),w('xx',700,300,720,320,20)]];
  const r=labelRegions(row,1000,500,[{x:.59,y:.18,w:.1,h:.08}],{uuid});
  assert.deepEqual(r.map(x=>x.label),['Left'],'Right overlaps an existing region, | has no letters, xx is low confidence');
  assert.deepEqual(labelRegions([],1000,500),[]);
  assert.deepEqual(labelRegions(row,0,0),[]);
});

test('at most 100 regions including existing ones', ()=>{
  const lines=Array.from({length:120},(_,i)=>[w('Label'+i,10,i*40,80,i*40+20)]);
  assert.equal(labelRegions(lines,1000,5000,[],{uuid}).length,100);
  assert.equal(labelRegions(lines,1000,5000,Array.from({length:98},(_,i)=>({x:.9,y:i/100,w:.01,h:.005})),{uuid}).length,2);
});
