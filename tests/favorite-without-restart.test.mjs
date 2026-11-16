import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('favoriting and marking watched update labels without rebuilding player',()=>{
 const area=app.slice(app.indexOf('  function preservePlayerQueue()'),app.indexOf('  async function deleteItem(item)'));
 assert.match(area,/state\.playerQueue = currentList\(\)\.map/);
 assert.match(area,/current\.id !== id/);
 assert.match(area,/syncPlayerFlags\(item\.id\)/);
 assert.doesNotMatch(area,/renderPlayer\(/);
 assert.match(area,/stored\.favorite = updated\.favorite/);
});
