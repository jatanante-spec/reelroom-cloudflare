import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
test('phone and tablet compact spacing excludes TV and preserves compact mode',()=>{
 assert.match(css,/@media \(max-width: 900px\)\s*\{\s*body:not\(\.tv-mode\) \.continue \{ margin-bottom: 9px/);
 assert.match(css,/body:not\(\.tv-mode\) \.rail \.card \{ flex-basis: 185px/);
 assert.match(css,/body:not\(\.tv-mode\) \.active-filters:empty \{ margin-bottom: 0/);
 assert.match(css,/body:not\(\.tv-mode\):not\(\.compact\) \.group-grid \{ row-gap: 13px/);
 assert.match(css,/\.rail \{ display: flex; gap: 12px; overflow-x: auto/);
 assert.match(css,/body:not\(\.tv-mode\) \.rail \.card \{ min-width: 0/);
 assert.match(css,/body:not\(\.tv-mode\) \.rail \.thumb img \{ position: absolute; inset: 0/);
});
