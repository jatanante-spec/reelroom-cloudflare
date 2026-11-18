import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('hidden collections are local reversible filters and excluded from video mix',()=>{
 for(const id of ['collectionHideToggle','collectionHidePanel','collectionHideChoices','hiddenCollectionsNotice','showAllHiddenCollections']) assert.ok(html.includes(`id="${id}"`));
 assert.match(app,/function collectionIsHidden/);assert.match(app,/if \(hideFilterActive\(\)\) list = list\.filter/);
 assert.match(app,/!collectionIsHidden\(i\) && !isLinkItem\(i\)/);
 assert.match(app,/!collectionIsHidden\(i\) && i\.last_opened_at/);
 assert.match(app,/prefs\.hiddenCollections = \[\]; savePrefs\(\); render\(\)/);
 assert.match(app,/state\.view !== "history" && state\.view !== "duplicates"/);
});
