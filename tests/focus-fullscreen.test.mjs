import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('true shell fullscreen hides chrome and retains a safe focus target',()=>{
 assert.match(app,/function focusFullscreen\(\) \{ return document\.fullscreenElement === \$\("#playerShell"\)/);
 assert.match(css,/fs-focus-mode\.fs-idle:not\(\.counting\) \.fs-shell-fullscreen/);
 assert.match(css,/fs-focus-mode\.fs-idle:not\(\.counting\) \.fs-controls-toggle/);
 assert.match(html,/id="playerShell"[^>]*tabindex="-1"/);
 assert.match(app,/shell\.focus\(\{ preventScroll: true \}\)/);
});
test('remote, touch and iframe edge provide paths back to controls',()=>{
 assert.match(app,/Tap the picture or top edge to show controls/);
 assert.match(app,/\["ArrowUp", "ArrowDown", "Enter", " ", "Tab"\]\.includes\(e\.key\)/);
 assert.match(app,/focusFullscreen\(\) \|\| shellEl\.classList\.contains\("fs-idle"\)/);
 assert.match(app,/state\.lastSwipeAt = Date\.now\(\)/);
});
