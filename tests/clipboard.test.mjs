import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { parseClipboard, outlineClipboardHtml } from './.build/clipboard.mjs';
import { bullet, pasteOutline, rows, marks, validate } from '../src/domain.mjs';
const dom = new JSDOM('');
globalThis.DOMParser = dom.window.DOMParser;
const simple = input => parseClipboard(input).lines.map(({ depth, text, listType, taskState, codeLanguage }) => ({ depth, text, listType, taskState, codeLanguage }));
const styleAt = (line, at) => marks(line.formatting, line.text.length).filter(m => m.start <= at && m.end > at).map(m => m.style).sort();

test('plain text accepts tabs, two/four-space nesting, dedents, blank bullets and literal whitespace', () => {
  for (const indent of ['  ', '    ', '\t']) {
    const lines = parseClipboard(`Parent\n${indent}Child\n${indent}${indent}Grandchild\n${indent}Other child\nSibling`).lines;
    assert.deepEqual(lines.map(l => l.depth), [0,1,2,1,0]);
  }
  assert.equal(parseClipboard(' two words ').lines[0].text, ' two words ');
  assert.deepEqual(parseClipboard('Parent\n\nSibling').lines.map(l => l.text), ['Parent', '', 'Sibling']);
});

test('Markdown retains nested lists, checkboxes, inline styles, heading sections and fenced code', () => {
  const result = parseClipboard('# Study\n\n- **Parent**\n  1. Child with `code`\n     - [x] Finished\n- [ ] Next\n\n```python\nprint("hi")\n  # keep indent\n```\n\n# Other');
  assert.equal(result.format, 'Markdown');
  assert.deepEqual(result.lines.map(l => [l.depth, l.text, l.taskState]), [[0,'Study','NONE'],[1,'Parent','NONE'],[2,'Child with code','NONE'],[3,'Finished','DONE'],[1,'Next','TODO'],[1,'print("hi")\n  # keep indent','NONE'],[0,'Other','NONE']]);
  assert.deepEqual(styleAt(result.lines[1], 2), ['BOLD']);
  assert.equal(result.lines[2].listType, 'ORDERED');
  assert.deepEqual(styleAt(result.lines[2], 12), ['CODE']);
  assert.equal(result.lines[5].codeLanguage, 'python');
});

test('OPML preserves outline hierarchy, Unicode, entities, notes and formatted attributes', () => {
  const result = parseClipboard('<?xml version="1.0"?><opml version="2.0"><head><title>Ignore title</title></head><body><outline text="Parent &amp; 😀"><outline text="&lt;b&gt;Child&lt;/b&gt;" _note="A note"><outline text="Grandchild"/></outline><outline text="Sibling child"/></outline><outline text="Other"/></body></opml>');
  assert.equal(result.format, 'OPML');
  assert.deepEqual(result.lines.map(l => [l.depth,l.text]), [[0,'Parent & 😀'],[1,'Child'],[2,'A note'],[2,'Grandchild'],[1,'Sibling child'],[0,'Other']]);
  assert.deepEqual(styleAt(result.lines[1], 0), ['BOLD']);
  assert.throws(() => parseClipboard('<opml><body><outline text="broken"></body>'), /incomplete or invalid/);
  assert.throws(() => parseClipboard({text:'',opml:'<!DOCTYPE opml [<!ENTITY x SYSTEM "https://example.com">]><opml><body/></opml>'}), /entities/);
});

test('formatted HTML preserves nested lists, inline colors/highlights and avoids scripts or external embeds', () => {
  const { lines } = parseClipboard({ text:'', html:'<ul><li><b>Parent</b><ul><li><span style="color:rgb(36,99,187);background-color:#ffe082"><u>Child</u></span><ol><li>Grandchild</li></ol></li><li>Other child</li></ul></li><li><i>Sibling</i></li></ul><script>alert(1)</script><iframe src="https://evil.test">bad</iframe>' });
  assert.deepEqual(lines.map(l => [l.depth,l.text]), [[0,'Parent'],[1,'Child'],[2,'Grandchild'],[1,'Other child'],[0,'Sibling']]);
  assert.deepEqual(styleAt(lines[1],0), ['COLOR_2463BB','HIGHLIGHT_FFE082','UNDERLINE']);
  const spaced = parseClipboard({ text: ' world ', html:'<b> world </b>' }).lines[0];
  assert.equal(spaced.text, ' world ');
  assert.ok(styleAt(spaced, 1).includes('BOLD'));
});

test('structured paste replaces selections once and preserves prefix, suffix, children and all formatting', () => {
  const original = [bullet('p', {text:'ABCDEF', formatting:'0:2:BOLD;4:6:ITALIC',collapsed:true}), bullet('old', {parentId:'p',text:'Existing child'})];
  const {lines} = parseClipboard('- **One**\n  - `Child`\n- *Last*');
  const result = pasteOutline(original, 'p', 2, 4, lines, ['child','last']);
  validate(result.nodes);
  assert.deepEqual(rows(result.nodes).map(r => [r.depth,r.bullet.text]), [[0,'ABOne'],[1,'Child'],[1,'Existing child'],[0,'LastEF']]);
  assert.ok(styleAt(result.nodes.find(n => n.id === 'p'), 2).includes('BOLD'));
  assert.ok(styleAt(result.nodes.find(n => n.id === 'child'), 1).includes('CODE'));
  assert.ok(styleAt(result.nodes.find(n => n.id === 'last'), 0).includes('ITALIC'));
  assert.ok(styleAt(result.nodes.find(n => n.id === 'last'), 4).includes('ITALIC'));
  const single = pasteOutline([original[0]], 'p', 2, 4, parseClipboard('**X**').lines, []);
  assert.equal(single.nodes[0].text,'ABXEF');
  assert.equal(single.caret, 3);
  assert.ok(styleAt(single.nodes[0], 2).includes('BOLD'));
  assert.ok(styleAt(single.nodes[0], 3).includes('ITALIC'));
});

test('Remo branch HTML round trips structure, masks, list/task metadata and code without executing markup', () => {
  const source = [
    {depth:0,text:'Parent 😀',formatting:'0:6:BOLD;7:9:MASK',listType:'NONE',taskState:'NONE',codeLanguage:''},
    {depth:1,text:'Child',formatting:'0:5:COLOR_2463BB;0:5:HIGHLIGHT_FFE082',listType:'ORDERED',taskState:'DONE',codeLanguage:''},
    {depth:2,text:'const x = "<script>";\n  return x',formatting:'',listType:'NONE',taskState:'NONE',codeLanguage:'javascript'},
    {depth:0,text:'Sibling',formatting:'',listType:'UNORDERED',taskState:'TODO',codeLanguage:''},
  ];
  const html = outlineClipboardHtml(source);
  assert.doesNotMatch(html, /<script>/);
  const result = parseClipboard({text:'',html}).lines;
  assert.deepEqual(result.map(l => [l.depth,l.text,l.listType,l.taskState,l.codeLanguage]),source.map(l => [l.depth,l.text,l.listType,l.taskState,l.codeLanguage]));
  for (let i=0;i<source.length;i++) for(let at=0;at<source[i].text.length;at++) assert.deepEqual(styleAt(result[i],at),styleAt(source[i],at));
});

test('a fenced block nested under a Markdown list item keeps its parent text and code indentation', () => {
  const {lines} = parseClipboard('- Example\n\n  ```python\n  print(1)\n    # indent\n  ```\n\n  - Explanation\n- Next');
  assert.deepEqual(lines.map(l => [l.depth,l.text,l.codeLanguage]),[[0,'Example',''],[1,'print(1)\n  # indent','python'],[1,'Explanation',''],[0,'Next','']]);
});

test('external whole-line theme colors normalize while deliberate inline colors and Remo colors survive', () => {
  for (const html of ['<p style="color:#777777"><b>Readable text</b></p>', '<span style="color:#a0a0a0">Readable text</span>', '<ul><li><span style="color:#666666">Readable text</span></li></ul>']) {
    const row = parseClipboard({text:'',html}).lines[0];
    assert.equal(row.text,'Readable text');
    assert.ok(!marks(row.formatting,row.text.length).some(m=>m.style.startsWith('COLOR_')));
  }
  const part = parseClipboard({text:'',html:'<p>Keep <span style="color:#777777">grey emphasis</span> here</p>'}).lines[0];
  assert.ok(styleAt(part,6).includes('COLOR_777777'));
  const own = parseClipboard({text:'',html:'<p><span data-remo-color="777777" style="color:#777777">Chosen grey</span></p>'}).lines[0];
  assert.ok(styleAt(own,0).includes('COLOR_777777'));
  const colored = parseClipboard({text:'',html:'<p style="color:#777777">Default <span style="color:#2463bb">blue</span></p>'}).lines[0];
  assert.deepEqual(styleAt(colored,9),['COLOR_2463BB']);
});

test('pasted HTML and plain-text markers are structure, not repeated characters', () => {
  const {lines}=parseClipboard({text:'',html:'<ul><li><b>• Parent 😀</b><ul><li>◦ Child</li></ul></li><li>• Sibling</li></ul>'});
  assert.deepEqual(lines.map(l=>[l.depth,l.text,l.listType]),[[0,'Parent 😀','UNORDERED'],[1,'Child','UNORDERED'],[0,'Sibling','UNORDERED']]);
  assert.ok(styleAt(lines[0],0).includes('BOLD'));
  for(const glyph of ['•','◦','▪','‣','∙','●','○']) assert.equal(parseClipboard(`${glyph} One`).lines[0].text,'One');
  const word=parseClipboard({text:'',html:'<p style="mso-list:l0 level1 lfo1;color:#999"><span style="mso-list:Ignore">•&nbsp;</span><b>Parent</b></p><p style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">o&nbsp;</span>Child</p>'}).lines;
  assert.deepEqual(word.map(l=>[l.depth,l.text]),[[0,'Parent'],[1,'Child']]);
  const task=parseClipboard({text:'',html:'<li>☑ Finished</li>'}).lines[0];
  assert.equal(task.text,'Finished');assert.equal(task.taskState,'DONE');
});

test('list cleanup preserves numbered lists, literal code, and intentional text copied within Remo', () => {
  assert.equal(parseClipboard({text:'',html:'<ol><li>1. First</li><li>2. Second</li></ol>'}).lines[1].text,'Second');
  assert.equal(parseClipboard('```text\n• keep literal\n```').lines[0].text,'• keep literal');
  assert.equal(parseClipboard('- `- literal code`').lines[0].text,'- literal code');
  const source=[{depth:0,text:'• intentional text',formatting:'0:18:COLOR_777777',listType:'UNORDERED',taskState:'NONE',codeLanguage:''}];
  const result=parseClipboard({text:'',html:outlineClipboardHtml(source)}).lines[0];
  assert.equal(result.text,source[0].text);assert.equal(result.formatting,source[0].formatting);
});

test('headings and dividers survive formatted copy, nesting and paste without duplicate nodes', () => {
  const source = [
    {depth:0,text:'Section',formatting:'0:7:BOLD',listType:'NONE',taskState:'NONE',codeLanguage:'',blockStyle:'h1'},
    {depth:1,text:'Subsection',formatting:'',listType:'NONE',taskState:'NONE',codeLanguage:'',blockStyle:'h2'},
    {depth:1,text:'',formatting:'',listType:'NONE',taskState:'NONE',codeLanguage:'',blockStyle:'divider'},
    {depth:0,text:'Body',formatting:'',listType:'NONE',taskState:'NONE',codeLanguage:'',blockStyle:'paragraph'},
  ];
  const result = parseClipboard({text:'',html:outlineClipboardHtml(source)}).lines;
  assert.deepEqual(result.map(({depth,text,blockStyle})=>({depth,text,blockStyle})),source.map(({depth,text,blockStyle})=>({depth,text,blockStyle})));
  const pasted = pasteOutline([bullet('target')], 'target', 0, 0, result, ['sub','divider','body']);
  assert.equal(pasted.nodes.find(node=>node.id==='target').blockStyle,'h1');
  assert.equal(pasted.nodes.find(node=>node.id==='divider').blockStyle,'divider');
  const markdown = parseClipboard('# Title\n\nBody\n\n---\n\n## Subtitle').lines;
  assert.deepEqual(markdown.map(node=>node.blockStyle || 'paragraph'),['h1','paragraph','divider','h2']);
});
