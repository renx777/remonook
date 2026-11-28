import test from 'node:test';import assert from 'node:assert/strict';
import {movieSearchEnabled,movieQuery,movieTargets,normalizeMovie,searchMovies,applyMoviePosters} from '../src/movie-search.mjs';
import {empty} from './.build/data.mjs';import {bullet} from '../src/domain.mjs';import {noteTrait} from '../src/traits-block.mjs';
test('MovieSearch activates explicitly and preserves unrelated notes while updating Poster URL',()=>{const d=empty();d.tables.bullets=[bullet('s',{text:'Shelf #MovieSearch'}),bullet('m',{parentId:'s',text:'The Thing (1982)'}),bullet('t',{parentId:'m',text:'Traits',traitsBlock:true}),bullet('y',{parentId:'t',text:'Year: 1982'}),bullet('p',{parentId:'t',position:1,text:'Poster: https://old.test/x.jpg'})];assert.ok(movieSearchEnabled(d.tables.bullets[0].text));assert.ok(!movieSearchEnabled('#MovieSearchExtra'));assert.deepEqual(movieQuery(d.tables.bullets[1],d),{title:'The Thing',year:'1982'});assert.deepEqual(movieTargets(d,'s').map(n=>n.id),['m']);const proposal={id:'m',text:'The Thing (1982)',before:'https://old.test/x.jpg',movie:{poster:'https://image.test/poster.jpg'}};const next=applyMoviePosters(d,[proposal]);assert.equal(noteTrait(next,'m','Poster'),proposal.movie.poster);assert.equal(noteTrait(d,'m','Poster'),'https://old.test/x.jpg');assert.equal(noteTrait(next,'m','Year'),'1982');assert.throws(()=>applyMoviePosters(next,[proposal]),/changed/);assert.throws(()=>applyMoviePosters({...d,tables:{...d.tables,bullets:d.tables.bullets.filter(n=>n.id!=='m')}},[proposal]),/changed/);});
test('provider mapping rejects absent and unsafe posters',()=>{assert.equal(normalizeMovie('omdb',{imdbID:'tt1',Title:'Movie',Poster:'N/A'}).poster,'');assert.equal(normalizeMovie('tmdb',{id:1,title:'Movie',poster_path:'/abc.jpg'}).poster,'https://image.tmdb.org/t/p/w500/abc.jpg');assert.equal(normalizeMovie('tmdb',{id:1,poster_path:'//evil.test/x'}).poster,'');});
test('lookups use fixed provider hosts, omit credentials and sanitize provider failures',async()=>{const original=globalThis.fetch;try{globalThis.fetch=async(u,options)=>{assert.equal(u.origin,'https://www.omdbapi.com');assert.equal(u.searchParams.get('s'),'The Thing');assert.equal(u.searchParams.get('y'),'1982');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');return Response.json({Response:'True',Search:[{imdbID:'tt1',Title:'The Thing',Year:'1982',Poster:'https://image.test/a.jpg'}]});};assert.equal((await searchMovies('omdb','secret','The Thing','1982'))[0].title,'The Thing');globalThis.fetch=async()=>Response.json({Response:'False',Error:'Movie not found!'});assert.deepEqual(await searchMovies('omdb','secret','none'),[]);globalThis.fetch=async()=>{throw Error('secret in provider URL');};await assert.rejects(searchMovies('tmdb','secret','x'),e=>!e.message.includes('secret'));}finally{globalThis.fetch=original;}});

test('v2: matching ignores case, punctuation and articles, prefers year then a clearly popular result',async()=>{
 const {bestMatch,normTitle}=await import('../src/movie-search.mjs');
 assert.equal(normTitle('Spider-Man: No Way Home'),normTitle('spider man no way home'));
 assert.equal(normTitle('The Thing'),'thing');
 const r=[{id:'1',title:'The Thing',year:'1982',popularity:40},{id:'2',title:'The Thing',year:'2011',popularity:30},{id:'3',title:'Thing',year:'1950',popularity:2}];
 assert.equal(bestMatch(r,{title:'The Thing',year:'1982'}).match.id,'1');
 assert.equal(bestMatch(r,{title:'The Thing'}).confidence,'ambiguous');
 assert.equal(bestMatch([{id:'9',title:'Inception',year:'2010',popularity:90},{id:'8',title:'Inception',year:'2014',popularity:1}],{title:'inception'}).match.id,'9');
 assert.equal(bestMatch([],{title:'Nope'}).confidence,'none');
 assert.equal(bestMatch([{id:'5',title:'Dune: Part Two',year:'2024'}],{title:'Dune',year:'2024'}).confidence,'likely');
});

test('v2: plans fill missing Traits, keep the user Rating, reuse Poster as the cover and refuse stale notes',async()=>{
 const {planMovieTraits,applyMoviePlans,createMovieNote,savedMovieId,isTmdbToken}=await import('../src/movie-search.mjs');
 const d=empty();d.tables.bullets=[bullet('s',{text:'Movies #views'}),bullet('m',{parentId:'s',text:'Alien'}),bullet('t',{parentId:'m',text:'Traits',traitsBlock:true}),bullet('y',{parentId:'t',text:'Year: 1979'}),bullet('p',{parentId:'t',position:1,text:'Poster: https://old.test/a.jpg'}),bullet('r',{parentId:'t',position:2,text:'Rating: ★★★★★'})];
 const movie={id:'348',title:'Alien',year:'1979',poster:'https://image.tmdb.org/t/p/w500/x.jpg',director:'Ridley Scott',genres:'Horror, Science Fiction',runtime:'117 min',rating:'8.2',url:'https://www.themoviedb.org/movie/348'};
 const fill=planMovieTraits(d,'m','tmdb',movie);
 assert.deepEqual(fill.map(c=>c.key),['Director','Genre','Runtime','TMDB rating','TMDB']);
 const over=planMovieTraits(d,'m','tmdb',movie,undefined,true);assert.ok(over.some(c=>c.key==='Poster'&&c.after===movie.poster));assert.ok(!over.some(c=>c.key==='Cover'||c.key==='Rating'));
 const next=applyMoviePlans(d,[{id:'m',text:'Alien',changes:fill}]);
 assert.equal(noteTrait(next,'m','Director'),'Ridley Scott');assert.equal(noteTrait(next,'m','Rating'),'★★★★★');assert.equal(savedMovieId(next,'m','tmdb'),'348');
 assert.throws(()=>applyMoviePlans(d,[{id:'m',text:'Aliens',changes:fill}]),/changed/);
 let n=0;const created=createMovieNote(d,'s','tmdb',movie,undefined,()=>'n'+(n++));
 const note=created.doc.tables.bullets.find(b=>b.id===created.id);assert.equal(note.text,'Alien');assert.equal(note.parentId,'s');
 assert.equal(noteTrait(created.doc,created.id,'Cover'),movie.poster);assert.equal(noteTrait(created.doc,created.id,'Year'),'1979');
 assert.ok(!created.doc.tables.bullets.some(b=>b.parentId&&created.doc.tables.bullets.find(x=>x.id===b.parentId)?.traitsBlock&&!b.text),'no empty Trait rows');
 assert.ok(isTmdbToken('eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ4In0.sig_-1'));assert.ok(!isTmdbToken('0123456789abcdef0123456789abcdef'));
});

test('v2: a v4 read token is sent as a bearer header, never in the URL',async()=>{
 const {searchMovies,movieDetails}=await import('../src/movie-search.mjs');const original=globalThis.fetch;const token='eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ4In0.sig';
 try{globalThis.fetch=async(u,o)=>{assert.equal(u.searchParams.get('api_key'),null);assert.equal(o.headers.Authorization,'Bearer '+token);
  return Response.json(u.pathname.includes('/search/')?{results:[{id:1,title:'Alien',release_date:'1979-05-25',poster_path:'/a.jpg',popularity:5}]}:{id:1,title:'Alien',release_date:'1979-05-25',poster_path:'/a.jpg',runtime:117,genres:[{name:'Horror'}],vote_average:8.16,vote_count:9,credits:{crew:[{job:'Director',name:'Ridley Scott'}]}});};
  assert.equal((await searchMovies('tmdb',token,'Alien'))[0].year,'1979');
  const m=await movieDetails('tmdb',token,'1');assert.equal(m.director,'Ridley Scott');assert.equal(m.runtime,'117 min');assert.equal(m.rating,'8.2');
 }finally{globalThis.fetch=original;}
});

test('collections sort by date created and last edited, and search titles and Trait values',async()=>{
 const {arrangeCollection,searchCollection,noteModified}=await import('../src/traits-block.mjs');const {index}=await import('../src/domain.mjs');
 const d=empty();d.tables.bullets=[bullet('s',{text:'Movies #views'}),bullet('a',{parentId:'s',text:'Alien'}),bullet('ta',{parentId:'a',text:'Traits',traitsBlock:true}),bullet('da',{parentId:'ta',text:'Director: Ridley Scott'}),bullet('b',{parentId:'s',position:1,text:'Brazil'}),bullet('c',{parentId:'s',position:2,text:'Clue'})];
 d.web.noteTimes={a:{createdAt:300,updatedAt:300},b:{createdAt:100,updatedAt:900},c:{createdAt:200,updatedAt:200},da:{createdAt:300,updatedAt:1000}};
 const kids=d.tables.bullets.filter(n=>n.parentId==='s'),view=v=>({filter:'',conditions:[],match:'all',sort:'',dir:'asc',...v});
 assert.deepEqual(arrangeCollection(d,kids,view({sort:'__created',dir:'desc'})).map(n=>n.id),['a','c','b']);
 assert.equal(noteModified(d,'a',index(d.tables.bullets)),1000,'a Trait edit counts as editing the movie');
 assert.deepEqual(arrangeCollection(d,kids,view({sort:'__modified',dir:'desc'})).map(n=>n.id),['a','b','c']);
 assert.deepEqual(searchCollection(d,kids,'ridley').map(n=>n.id),['a']);assert.deepEqual(searchCollection(d,kids,'BRA').map(n=>n.id),['b']);assert.equal(searchCollection(d,kids,'  ').length,3);
});

test('a synced provider key travels with sync but never into a backup file',async()=>{
 const {setSyncedKey,syncedMovieKeys}=await import('./.build/movie-keys.mjs').catch(()=>({}));
 const {archive,parseArchive,withNodes}=await import('./.build/data.mjs');const {projectBuckets,applyDocument}=await import('../src/sync-buckets.mjs');
 let d=withNodes(empty(),[bullet('n',{text:'Note'})]);d={...d,web:{...d.web,providerKeys:{tmdb:{key:'synced-secret-key',updatedAt:1}}}};
 const blob=await archive(d,new Map());assert.ok(!(await blob.text()).includes('synced-secret-key'),'not in the backup zip');
 const zip=await (await import('jszip')).default.loadAsync(await blob.arrayBuffer());assert.ok(!(await zip.file('remo.json').async('string')).includes('synced-secret-key'));
 const {repairDocument}=await import('../src/sync-checks.mjs');const repaired=repairDocument(structuredClone(d));assert.ok(!repaired||repaired.doc?.web?.providerKeys?.tmdb?.key==='synced-secret-key','sync validation keeps it');
 if(setSyncedKey){const cleared=setSyncedKey(d,'tmdb','');assert.deepEqual(syncedMovieKeys(cleared),{});}
});
