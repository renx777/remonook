import test from 'node:test';
import assert from 'node:assert/strict';
import {socialPost,sharedWebLink,socialPostHeight} from '../src/social-posts.mjs';
import {mediaLinks} from '../src/media.mjs';
import {addBookmark,bookmarkUrl} from '../src/bookmarks.mjs';
import {incomingShare} from '../src/android-share.mjs';
const empty=()=>({revision:1,columns:{bullets:[],media:[],decks:[]},tables:{bullets:[],media:[],decks:[],cards:[]},web:{}});
test('public post URLs produce provider-owned embeds and canonical identities',()=>{
 const variants=['https://x.com/jack/status/20?s=20','https://twitter.com/jack/status/20/photo/1','https://mobile.twitter.com/jack/status/20','https://x.com/i/web/status/20'];
 for(const url of variants){const p=socialPost(url);assert.equal(p.href,'https://x.com/i/web/status/20');assert.equal(new URL(p.embed).origin,'https://platform.twitter.com');assert.equal(new URL(p.embed).searchParams.get('dnt'),'true');}
 assert.equal(mediaLinks(variants.join(' ')).length,1);
 const reddit=socialPost('https://old.reddit.com/r/place/comments/tqbguc/412022/?utm_source=share');assert.equal(reddit.embed,'https://embed.reddit.com/r/place/comments/tqbguc/412022/?ref_source=embed&ref=share&embed=true');
 assert.equal(socialPost('https://www.reddit.com/r/pics/comments/1jqpqc/comment/cbhf6pf/').title,'Reddit comment');
 assert.equal(socialPost('https://instagram.com/reel/ABC_123/?igsh=track').embed,'https://www.instagram.com/reel/ABC_123/embed/');
 assert.equal(socialPost('https://instagram.com/p/ABC_123/').title,'Instagram post');
});
test('profiles, private messages, arbitrary paths and spoofed origins never become embeds',()=>{
 for(const url of ['https://x.com/jack','https://x.com/messages/20','https://x.com.evil.test/a/status/20','https://user:pass@x.com/a/status/20','javascript:alert(1)','https://reddit.com/r/place/s/short','https://instagram.com/stories/user/123/','https://www.instagram.com.evil.test/p/abc/','https://x.com/a/status/20/%22%3E%3Cscript%3E','https://reddit.com/r/a/comments/id/../../bad/'])assert.equal(socialPost(url),null,url);
});
test('shared captions retain original text, deduplicate aliases, and reject ambiguous links',()=>{
 const text='A useful thread\nhttps://twitter.com/jack/status/20?s=1).';assert.equal(sharedWebLink(text),'https://twitter.com/jack/status/20?s=1');
 assert.equal(sharedWebLink('https://a.test https://b.test'),null);assert.equal(sharedWebLink('https://user:secret@x.com/a/status/20'),null);
 const first=addBookmark(empty(),'https://x.com/jack/status/20?s=1');const again=addBookmark(first.doc,'https://twitter.com/jack/status/20');assert.equal(again.bookmark.id,first.bookmark.id);assert.equal(first.bookmark.title,'Post on X');assert.equal(bookmarkUrl('https://example.com/a?keep=1#heading'),'https://example.com/a?keep=1');
 const entry={schema:1,id:crypto.randomUUID(),receivedAt:Date.now()},capture=incomingShare(empty(),entry,text,'bookmark');assert.equal(Object.values(capture.doc.web.bookmarks)[0].url,'https://x.com/i/web/status/20');assert(capture.doc.tables.bullets.some(n=>n.text===text));assert.equal(incomingShare(capture.doc,entry,text,'bookmark').doc,capture.doc);
});
test('resize messages accept only bounded provider protocols',()=>{
 assert.equal(socialPostHeight({type:'resize.embed',data:800},'reddit'),800);assert.equal(socialPostHeight('{"type":"resize.embed","data":9000}','reddit'),1000);
 assert.equal(socialPostHeight({'twttr.embed':{method:'twttr.private.resize',params:[{height:350}]}},'twitter'),350);
 for(const data of [{type:'resize.embed',data:'500'},{type:'resize.embed',data:Infinity},{type:'navigate',url:'https://evil.test'},'invalid','x'.repeat(9000)])assert.equal(socialPostHeight(data,'reddit'),null);
});
