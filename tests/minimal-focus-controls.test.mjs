import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
test('minimal focus controls keep actions reachable with remote and accessible labels',()=>{
 for(const id of ['fsPrevBtn','fsNextBtn','fsSoundBtn','fsFavBtn','fsMoreBtn','fsMoreOrganizeBtn','fsShuffleBtn','fsMoreFullPostBtn','fsMoreAdjustBtn']) assert.ok(html.includes(`id="${id}"`));
 assert.match(html,/id="fsFavBtn"[^>]*aria-pressed="false"/);
 assert.match(app,/fav\.setAttribute\("aria-pressed", String\(!!item\.favorite\)\)/);
 assert.match(app,/on\("#fsMoreOrganizeBtn".*openOrg\(\[it\.id\]\)/);
 assert.match(css,/body:not\(\.tv-mode\) \.player-shell \.fs-bar > \.fs-btn \{/);
 assert.match(css,/body:not\(\.tv-mode\) \.player-shell\.pseudo-fs \.player-organize \{ display: none; \}/);
 assert.match(css,/body\.tv-mode \.player-shell\.pseudo-fs #fsPrevBtn/);
});
