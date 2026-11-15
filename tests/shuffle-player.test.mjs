import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('shuffle keeps the playing item, excludes web links and restores the original queue',()=>{
 assert.match(html,/id="fsShuffleBtn"[^>]*aria-pressed="false"/);
 assert.match(app,/shuffle: false/);
 assert.match(app,/state\.playerBaseQueue = list\.map\(\(item\) => item\.id\)/);
 assert.match(app,/item\.id !== currentId && !isLinkItem\(item\)/);
 assert.match(app,/Math\.floor\(Math\.random\(\) \* \(i \+ 1\)\)/);
 assert.match(app,/state\.playerQueue = \[currentId, \.\.\.others\]/);
 assert.match(app,/state\.playerQueue = state\.playerBaseQueue \|\|/);
 assert.match(app,/on\("#fsShuffleBtn", togglePlayerShuffle\)/);
});
