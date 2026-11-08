import test from 'node:test';
import assert from 'node:assert/strict';
import {branchCopy} from '../src/workspace-branch.mjs';
import {bullet} from '../src/domain.mjs';

test('Copy to…: a branch gets fresh ids, keeps its shape and text, and drops mirror links',()=>{
 const doc={tables:{bullets:[bullet('top',{text:'Trip'}),bullet('a',{parentId:'top',text:'Flights',position:0}),bullet('b',{parentId:'a',text:'BLR → GOI',position:0}),bullet('c',{parentId:'top',text:'Hotel',position:1,mirrorSourceId:'x',mirrorRootId:'x'}),bullet('other',{text:'Unrelated',position:1})]}};
 const copy=branchCopy(doc,'top',7);
 assert.equal(copy.length,4,'the branch only');
 assert.ok(copy.every(n=>!['top','a','b','c','other'].includes(n.id)),'fresh ids');
 const byText=Object.fromEntries(copy.map(n=>[n.text,n]));
 assert.equal(byText.Trip.parentId,null);assert.equal(byText.Trip.position,7,'placed at the top level, after existing bullets');
 assert.equal(byText.Flights.parentId,byText.Trip.id);assert.equal(byText['BLR → GOI'].parentId,byText.Flights.id);
 assert.equal(byText.Hotel.mirrorSourceId,undefined,'mirror links do not cross workspaces');
 assert.throws(()=>branchCopy(doc,'missing',0),/no longer exists/);
});
