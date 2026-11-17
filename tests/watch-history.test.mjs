import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
test('watch history uses last-opened times and includes completed videos without web links or picture posts',()=>{
 assert.match(html,/data-view="history"/);assert.match(html,/id="watchHistoryBtn"/);
 assert.match(app,/state\.view === "history"\) list = list\.filter\(\(i\) => !isLinkItem\(i\) && !isPostItem\(i\)/);
 assert.match(app,/Date\.parse\(b\.last_opened_at\) - Date\.parse\(a\.last_opened_at\)/);
 assert.match(app,/state\.view === "history"\) state\.playerQueue = list\.map/);
 assert.match(app,/Opened \$\{esc\(historyDate\(item\)\)\}/);
 assert.match(css,/body\.watch-history-view/);
});
