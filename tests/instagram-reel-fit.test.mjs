import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
test('Instagram reels use a fitted and clipped preview with foldable captions',()=>{
 assert.match(app,/reel: \{ top: 0\.1125, w: 1\.0000, h: 1\.2500 \}/);
 assert.match(app,/aspectCache\.get\(item\?\.id\)/);assert.match(app,/const pictureW = aspect \? Math\.min\(1, 1\.25 \* aspect\) : 1/);
 assert.match(css,/\.ig-window\.cropping\.ig-reel-crop/);assert.match(app,/ig-reel-crop/);
 assert.match(app,/const folded = item\.platform === "instagram"/);
 assert.match(app,/postText\.classList\.toggle\("folded", folded\)/);
 assert.match(app,/setAttribute\("aria-expanded", String\(!folded\)\)/);
});
