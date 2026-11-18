import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
test('For You uses only saved videos with honest reasons and keeps its own viewing queue',()=>{
 for(const id of ['fyStart','fyPanel','fyPlay','fyBack','fyFavorite','fyNext','fyPrev','fyEmpty']) assert.ok(html.includes(`id="${id}"`));
 assert.match(app,/function forYouVideos\(\) \{ return state\.items\.filter\(\(i\) => !collectionIsHidden\(i\) && !isLinkItem\(i\) && !isPostItem\(i\)\); \}/);
 assert.match(app,/!i\.last_opened_at/); assert.match(app,/30 \* 86400000/);
 assert.match(app,/picked\.has\(bucket\[bucket\.length - 1\]\.id\)/);
 assert.match(app,/if \(forYouIds\) state\.playerQueue = list\.map/);
 assert.match(app,/if \(state\.forYouPlaying && item && state\.forYouOpen\)/);
 assert.match(app,/history\.pushState\(\{ reelroom: "for-you" \}/);
 assert.match(css,/body\.for-you-open \.main > \.groups/);
});
