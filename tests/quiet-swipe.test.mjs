import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('normal swipe is quiet but list boundaries still explain themselves',()=>{
 const swipe=app.slice(app.indexOf('  function swipeStep(dir)'),app.indexOf('  function embedWithApi('));
 assert.match(swipe,/flashSwipeHint\("Start of list"\)/);
 assert.match(swipe,/flashSwipeHint\("End of list"\)/);
 assert.doesNotMatch(swipe,/flashSwipeHint\(dir/);
 assert.match(swipe,/stepPlayer\(target - state\.playerIndex\)/);
});
