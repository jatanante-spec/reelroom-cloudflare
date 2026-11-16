import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('touch player hides arrows only while swipe is enabled and centers speaker',()=>{
 assert.match(css,/@media \(pointer: coarse\)\s*\{/);
 assert.match(css,/body:not\(\.tv-mode\) \.player-shell:not\(\.swipe-nav-off\) \.fs-bar #fsPrevBtn/);
 assert.match(css,/body:not\(\.tv-mode\) \.player-shell:not\(\.swipe-nav-off\) \.fs-bar #fsNextBtn \{ display: none; \}/);
 assert.match(css,/position: absolute; left: 50%; top: 50%; transform: translate\(-50%, -50%\)/);
 assert.match(app,/classList\.toggle\("swipe-nav-off", prefs\.swipeNav === "off"\)/);
 assert.match(app,/\[\$\("#fsNextBtn"\), \$\("#fsMoreBtn"\)\]\.find\(isVisible\)/);
});
