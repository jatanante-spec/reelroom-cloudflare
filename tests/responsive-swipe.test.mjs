import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('shorter deliberate swipes are recognized without weakening caption or player controls',()=>{
 assert.match(app,/Date\.now\(\) - s\.t > 1500/);
 assert.match(app,/Math\.abs\(dy\) > 45 && Math\.abs\(dy\) > Math\.abs\(dx\) \* 1\.4/);
 assert.match(app,/e\.touches\.length !== 1/);
 assert.match(app,/shellEl\.addEventListener\("touchcancel"/);
 assert.match(app,/closest\("\.player-post-text"\)\) return/);
 assert.match(app,/function swipeControlBarHeight\(\)/);
});
