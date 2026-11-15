import { test } from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('selection indicators anchor on each card, with visible selected and empty states',()=>{
 assert.match(css,/\.group-grid \.card \{ position: relative; \}/);
 assert.match(css,/body\.selecting \.selbox \{ display: grid; \}/);
 assert.match(css,/body\.selecting \.card\.selected \.selbox \{ background: #286fdd; color: #fff; \}/);
 assert.match(css,/body\.selecting \.group-grid \.card\.selected \{ box-shadow: 0 0 0 3px #69a5ff; \}/);
 assert.match(app,/aria-pressed="\$\{state\.selected\.has\(item\.id\)\}"/);
});
