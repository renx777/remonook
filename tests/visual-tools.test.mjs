import test from 'node:test';import assert from 'node:assert/strict';
import{bullet,encode,marks}from'../src/domain.mjs';
import{diagramLabels,changeDiagramLabel,replaceVisualRange,saveDiagram,drawingFile}from'../src/visual-notes.mjs';
import{adjustOcclusionMask,validMasks}from'../src/occlusion.mjs';
test('guided diagram labels preserve connections, quotes and surrounding note formatting',()=>{
 const text='flowchart TD\n A[Start here] --> B{Make a decision}';const fields=diagramLabels(text);assert.deepEqual(fields.map(f=>f.value),['Start here','Make a decision']);
 const changed=changeDiagramLabel(text,fields[0],'Read "this" first');assert.match(changed,/A\["Read &quot;this&quot; first"\] --> B\{Make a decision\}/);
 assert.equal(diagramLabels(changed)[0].value,'Read "this" first');
 const node=bullet('a',{text:'Before old after',formatting:encode([{start:0,end:6,style:'BOLD'},{start:7,end:10,style:'ITALIC'},{start:11,end:16,style:'UNDERLINE'}])});
 const next=replaceVisualRange(node,7,10,'replacement');assert.equal(next.text,'Before replacement after');assert.ok(marks(next.formatting,next.text.length).some(m=>m.style==='ITALIC'&&m.start===7&&m.end===18));assert.ok(marks(next.formatting,next.text.length).some(m=>m.style==='UNDERLINE'&&m.start===19));
 const sequence='sequenceDiagram\n Alice->>Bob: Hello\n Bob-->>Alice: Welcome';assert.deepEqual(diagramLabels(sequence).map(f=>f.value),['Hello','Welcome']);
});
test('diagram editing keeps unrelated text and preserves concurrent versions automatically',()=>{
 const original='```mermaid\nflowchart LR\n A-->B\n```',base='Keep this\n'+original+'\nAnd this',node=bullet('n',{text:base});const target={id:'n',original,base,start:10};
 const saved=saveDiagram([node],target,'flowchart LR\n A-->C');assert.match(saved[0].text,/Keep this\n```mermaid\nflowchart LR\n A-->C\n```\nAnd this/);
 const concurrent={...node,text:base.replace('A-->B','A-->D')};const versions=saveDiagram([concurrent],target,'flowchart LR\n A-->C',()=> 'version');assert.equal(versions[0].text,concurrent.text);assert.equal(versions[1].parentId,'n');assert.match(versions[1].text,/A-->C/);
 assert.throws(()=>saveDiagram([],target,'flowchart LR\n A-->C'),/no longer/);assert.equal(drawingFile({credit:'My sketch.excalidraw.png'}),true);assert.equal(drawingFile({credit:'ordinary.png'}),false);
});
test('occlusion adjustments clamp move and resize at every boundary without changing region identity',()=>{
 const mask={id:'r',x:.2,y:.3,w:.25,h:.2,label:'Answer'};
 for(const patch of [{x:-1,y:2},{w:3,h:0},{x:3,w:.1},{y:-5,h:4},{x:.9,y:.99},{w:.01,h:.01}]){const next=adjustOcclusionMask(mask,patch);assert.equal(next.id,mask.id);assert.equal(next.label,mask.label);assert.ok(validMasks([next]),JSON.stringify(next));}
 assert.equal(adjustOcclusionMask(mask,{x:NaN}),mask);
});

test('editing a known repeated diagram changes only its selected occurrence',()=>{
 const original='```mermaid\nflowchart LR\n A-->B\n```',base=original+'\nBetween\n'+original,node=bullet('n',{text:base}),start=base.lastIndexOf(original);
 const saved=saveDiagram([node],{id:'n',original,base,start},'flowchart LR\n A-->C');
 assert.equal(saved.length,1);assert.equal(saved[0].text,original+'\nBetween\n```mermaid\nflowchart LR\n A-->C\n```');
 const changed={...node,text:'Concurrent preface\n'+base};
 const versions=saveDiagram([changed],{id:'n',original,base,start},'flowchart LR\n A-->C',()=> 'version');
 assert.equal(versions.length,2);assert.equal(versions[0].text,changed.text);
});
