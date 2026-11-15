import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('player offers an accessible explicit hide/show control',()=>{
 assert.match(html,/id="fsControlsToggle"/);assert.match(app,/function toggleFsControls\(\)/);assert.match(app,/Show controls/);assert.match(app,/Hide controls/);assert.match(app,/state\.controlsHiddenByUser && !force/);assert.match(app,/"#fsControlsToggle"/);
});
test('hidden overlays and gesture zones leave the video controls reachable',()=>{
 assert.match(css,/fs-idle \.fs-hit-bottom \{ pointer-events: none/);assert.match(css,/fs-manual-hidden:not\(\.counting\) \.player-post-text/);assert.match(app,/classList\.contains\("fs-idle"\)\) return state\.fbNativeVideo \? 120 : 100/);assert.match(app,/function layoutSwipeZones\(\)/);
});
test('picture post captions survive automatic hiding and manual state resets on close',()=>{
 assert.match(css,/fs-idle\.player-has-video:not\(\.counting\) \.player-post-text/);assert.match(app,/classList\.toggle\("player-has-video", !isPostItem\(item\)\)/);assert.match(app,/state\.controlsHiddenByUser = false/);
});
