import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('the non-TV big player has one app sound button, retaining sound and TV behavior',()=>{
 assert.match(css,/body:not\(\.tv-mode\) \.player-shell:fullscreen \.sound-helper,\s*body:not\(\.tv-mode\) \.player-shell\.pseudo-fs \.sound-helper \{ display: none !important; \}/);
 assert.match(app,/fsSoundBtn\.addEventListener\("click"/);
 assert.match(css,/body\.tv-mode \.player-shell\.pseudo-fs #fsSoundBtn/);
 assert.match(app,/function swipeControlBarHeight\(\)/);
});
