import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('possible duplicates are suggestions and require explicit confirmed deletion',()=>{
 assert.match(html,/data-view="duplicates"/);
 assert.match(html,/Nothing is removed automatically/);
 assert.match(app,/function duplicateGroups\(items\)/);
 assert.match(app,/!isLinkItem\(i\) && !isPostItem\(i\)/);
 assert.match(app,/!generic\.test\(title\)/);
 assert.match(app,/item\.external_id && item\.platform/);
 assert.match(app,/duplicate-remove.*data-act="delete"/);
 assert.match(app,/if \(!confirm\(`Delete/);
});
