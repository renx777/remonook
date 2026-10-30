import test from 'node:test';
import assert from 'node:assert/strict';
import {renderAsync} from 'pele/lazy';
import {diagramOptions,mountDiagram} from './.build/diagram-renderer.mjs';
import {JSDOM} from 'jsdom';
const corpus={
 flowchart:'flowchart LR\n  A[Start] --> B{Ready?}\n  B -->|Yes| C[Done]',
 sequence:'sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi',
 class:'classDiagram\n  Animal <|-- Duck\n  Animal : +int age',
 state:'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Working',
 er:'erDiagram\n  CUSTOMER ||--o{ ORDER : places',
 gantt:'gantt\n  dateFormat YYYY-MM-DD\n  section Work\n  Task :2026-10-01, 3d',
 pie:'pie title Reading\n  "Read" : 40\n  "Unread" : 60',
 mindmap:'mindmap\n  root((Learning))\n    Notes\n    Practice',
 gitGraph:'gitGraph\n  commit\n  branch develop\n  checkout develop\n  commit',
};
test('Pele renders existing Mermaid diagram families, escapes labels and assigns distinct IDs',async()=>{
 for(const [name,source]of Object.entries(corpus)){
  const result=await renderAsync(source,{...diagramOptions,idPrefix:'test-'+name});
  assert.ok(result.width>0&&result.height>0,name);assert.match(result.svg,/<svg\b/);assert.match(result.svg,/class="pele/);
 }
 const a=await renderAsync('flowchart LR\n accTitle: Reading flow\n A-->B',{...diagramOptions,idPrefix:'first'}),b=await renderAsync('flowchart LR\n accTitle: Reading flow\n A-->B',{...diagramOptions,idPrefix:'second'});
 assert.notEqual(a.svg,b.svg);assert.match(a.svg,/first-/);assert.match(b.svg,/second-/);
 const bad=await renderAsync('flowchart LR\n A["<img src=x onerror=alert(1)>"] --> B\n click B "javascript:alert(1)"',{...diagramOptions,idPrefix:'unsafe'});
 const dom=new JSDOM(bad.svg);assert.equal(dom.window.document.querySelector('script,img,foreignObject,a,[onerror]'),null);dom.window.close();
 await assert.rejects(()=>renderAsync('flowchart LR\n A-->B',{...diagramOptions,maxEdges:0}),e=>e.code==='limit');
});
const tick=()=>new Promise(r=>setTimeout(r,0));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
test('diagram mounts cancel stale imports, destroy observers, fall back only on failure and retain invalid source safely',async()=>{
 const dom=new JSDOM('<span id="host"></span>'),host=dom.window.document.getElementById('host');
 let mounted=0,destroyed=0,legacy=0,states=[],lastOptions;
 const pele={detectType:()=> 'flowchart',load:async()=>true,mount:(element,source,options)=>{mounted++;lastOptions=options;element.innerHTML='<svg class="pele"></svg>';options.onRender({});return{destroy(){destroyed++;}};}};
 const deps={pele:async()=>pele,legacy:async()=>{legacy++;return'<svg id="legacy"></svg>';}};
 const pending=deferred();let stop=mountDiagram(host,'flowchart LR\n A-->B','a',s=>states.push(s),{...deps,pele:()=>pending.promise});stop();pending.resolve(pele);await tick();assert.equal(mounted,0);assert.equal(legacy,0);
 stop=mountDiagram(host,'flowchart LR\n A-->B','b',s=>states.push(s),deps);await tick();assert.equal(host.dataset.renderer,'pele');assert.equal(legacy,0);assert.equal(lastOptions.links,false);assert.equal(lastOptions.images,false);stop();assert.equal(destroyed,1);assert.equal(host.childNodes.length,0);
 const rejectPele={...pele,mount:(element,source,options)=>{options.onError(Object.assign(Error('not supported'),{code:'syntax'}));return{destroy(){destroyed++;}};}};
 stop=mountDiagram(host,'future diagram','c',s=>states.push(s),{...deps,pele:async()=>rejectPele});await tick();assert.equal(host.dataset.renderer,'mermaid');assert.equal(legacy,1);assert.equal(destroyed,2);stop();
 stop=mountDiagram(host,'<script>bad source</script>','d',s=>states.push(s),{pele:async()=>{throw Error('bad');},legacy:async()=>{throw Error('bad');}});await tick();assert.match(states.at(-1).error,/Invalid Mermaid/);assert.equal(host.querySelector('script'),null);stop();
 const legacyPending=deferred();stop=mountDiagram(host,'future diagram','e',s=>states.push(s),{pele:async()=>{throw Error('unsupported');},legacy:()=>legacyPending.promise});await tick();stop();legacyPending.resolve('<svg id="stale"></svg>');await tick();assert.equal(host.childNodes.length,0);
 let loaded=false;stop=mountDiagram(host,'a'.repeat(50_001),'f',s=>states.push(s),{...deps,pele:async()=>{loaded=true;return pele;}});assert.equal(loaded,false);assert.match(states.at(-1).error,/limit/);stop();
 const limited={...pele,mount:(element,source,options)=>{options.onError({code:'limit'});return{destroy(){}};}};
 stop=mountDiagram(host,'flowchart LR\n A-->B','g',s=>states.push(s),{...deps,pele:async()=>limited});await tick();assert.equal(legacy,1,'Limits never trigger legacy rendering');assert.match(states.at(-1).error,/limit/);stop();dom.window.close();
});
