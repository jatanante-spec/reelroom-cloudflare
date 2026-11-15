import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('only the eligible next Facebook video is prepared silently and temporarily',()=>{
 assert.match(app,/function scheduleNextFacebookPreparation\(\)/);
 assert.match(app,/connection\.saveData/);
 assert.match(app,/item\.backup_embed_url \|\| state\.fbStreamFailed/);
 assert.match(app,/video\.preload = "metadata"/);
 assert.match(app,/video\.muted = true; video\.defaultMuted = true; video\.playsInline = true/);
 assert.match(app,/clearNextFacebookPreparation\(\)/);
 assert.match(app,/60000/);
});
test('a prepared video is reused, with stale requests and iframe fallback guarded',()=>{
 assert.match(app,/takePreparedFacebook\(item\)/);
 assert.match(app,/const video = preparedVideo \|\| document\.createElement\("video"\)/);
 assert.match(app,/if \(!preparedVideo\) video\.src = url/);
 assert.match(app,/seq !== state\.fbStreamSeq/);
 assert.match(app,/fallbackFacebookIframe\(item, seq\)/);
});
