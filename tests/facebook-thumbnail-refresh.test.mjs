import {test} from 'node:test';
import assert from 'node:assert/strict';
import {facebookThumbnailDueAt, refreshExpiringFacebookThumbnails, fetchMetadata} from '../lib/metadata.mjs';
import {makeRepo,memoryAdapter} from '../lib/store.mjs';
const hex = ms => Math.floor(ms / 1000).toString(16);
const now=Date.now(), old=`https://scontent.xx.fbcdn.net/a.jpg?oe=${hex(now-10000)}`, good=`https://scontent.xx.fbcdn.net/b.jpg?oe=${hex(now+3*86400000)}`;
const item=(id,extra={})=>({id,platform:'facebook',media_type:'reel',url:`https://www.facebook.com/reel/${id}`,canonical_url:`https://www.facebook.com/reel/${id}`,thumbnail_url:old,title:'My carefully edited title',post_text:'Saved text',collection:'Health',favorite:true,created_at:`2025-01-0${Number(id)+1}T00:00:00Z`,...extra});
test('expiry check is bounded, respects manual pictures and retry delay',()=>{
 assert.ok(facebookThumbnailDueAt(item('1')) < now);assert.equal(facebookThumbnailDueAt(item('1',{thumbnail_custom:true})),null);
 assert.equal(facebookThumbnailDueAt(item('1',{thumbnail_url:'https://evil.fbcdn.net.example/x?oe=12345678'})),null);
 assert.equal(facebookThumbnailDueAt(item('1',{media_type:'post'})),null);
 assert.ok(facebookThumbnailDueAt(item('1',{thumbnail_refresh_attempt_at:new Date().toISOString()}))>now+11*3600000);
});
test('repair changes only signed thumbnail; batch cap and retry after failure',async()=>{
 const repo=makeRepo(memoryAdapter(),{noSeed:true});for(let i=0;i<5;i++) await repo.insert(item(String(i)));
 const original=globalThis.fetch;let n=0;globalThis.fetch=async()=>{n++;return new Response(`<meta property="og:image" content="${good}"><meta property="og:title" content="Wrong new title">`,{status:200});};
 try {const res=await refreshExpiringFacebookThumbnails(repo,99);assert.equal(n,4);assert.equal(res.remaining,1);let all=await repo.list();let a=all[0];assert.equal(a.thumbnail_url,good);assert.equal(a.title,'My carefully edited title');assert.equal(a.post_text,'Saved text');assert.equal(a.collection,'Health');assert.equal(a.favorite,true);assert.ok(a.thumbnail_refresh_attempt_at);globalThis.fetch=async()=>new Response('<html>no preview</html>',{status:200});await refreshExpiringFacebookThumbnails(repo);all=await repo.list();assert.equal(all[4].thumbnail_url,old);assert.ok(facebookThumbnailDueAt(all[4])>now);assert.equal((await refreshExpiringFacebookThumbnails(repo)).attempted,0);
 }finally{globalThis.fetch=original}
});
test('atomic check protects a thumbnail chosen while refresh is in flight',async()=>{
 const repo=makeRepo(memoryAdapter(),{noSeed:true});await repo.insert(item('1'));await repo.update('1',{thumbnail_url:'https://example.com/my.jpg',thumbnail_custom:true});assert.equal(await repo.updateThumbnailIfUnchanged('1',old,{thumbnail_url:good}),false);assert.equal((await repo.list())[0].thumbnail_url,'https://example.com/my.jpg');
});
test('normal metadata refresh also preserves explicitly custom picture',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response(`<meta property="og:image" content="${good}"><meta property="og:title" content="title">`);try{let r=await fetchMetadata(item('1',{thumbnail_custom:true}));assert.equal(r.thumbnail_url,undefined);}finally{globalThis.fetch=original}
});

test('thumbnail endpoint requires authentication and editing another field keeps auto classification',async()=>{
 const {handler}=await import('../lib/api-core.mjs');const {fakeD1}=await import('./helpers.mjs');let env={DB:fakeD1(),NO_SEED:'1',REELROOM_PASSWORD:'password'};const request=(path,method='GET',body)=>new Request('https://example.com'+path,{method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
 assert.equal((await handler(request('/api/refresh-facebook-thumbnails','POST'),env)).status,401);
 env={DB:fakeD1(),NO_SEED:'1'};const repo=makeRepo((await import('../lib/store.mjs')).d1Adapter(env.DB),{noSeed:true});await repo.insert(item('123'));let r=await handler(request('/api/items/123','PATCH',{title:'Edited',thumbnail_url:old}),env);let x=await r.json();assert.equal(x.title,'Edited');assert.notEqual(x.thumbnail_custom,true);
 r=await handler(request('/api/items/123','PATCH',{thumbnail_url:'https://example.com/chosen.jpg'}),env);x=await r.json();assert.equal(x.thumbnail_custom,true);
});
