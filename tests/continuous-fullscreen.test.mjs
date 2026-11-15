import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
test('fullscreen has an accessible control for the stable player shell',()=>{
 assert.match(html,/id="fsShellFullscreenBtn"/);
 assert.match(html,/aria-label="Enter ReelRoom fullscreen"/);
 assert.match(app,/fsShellFullscreenBtn"\)\.addEventListener\("click"/);
 assert.match(app,/await shell\.requestFullscreen\(\)/);
 assert.match(app,/document\.fullscreenElement === \$\("#playerShell"\)/);
 assert.match(css,/\.fs-shell-fullscreen:focus-visible/);
});
test('unsupported fullscreen is explained instead of silently promising success',()=>{
 assert.match(app,/showFullscreenStatus\("Your browser did not allow fullscreen/);
 assert.match(html,/id="fsFullscreenStatus" role="status"/);
});
