import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
test('player has a collection and tags summary and Organize control',()=>{assert.match(html,/id="playerOrgSummary"/);assert.match(html,/id="playerOrgBtn"/);assert.match(app,/function renderPlayerOrg\(item\)/);assert.match(app,/renderPlayerOrg\(item\);/);assert.match(css,/\.player-org-button:focus-visible/)});
test('organizing preserves the current queue and uses the existing organizer',()=>{assert.match(app,/state\.playerQueue = currentList\(\)\.map/);assert.match(app,/if \(item\) openOrg\(\[item\.id\]\)/);assert.match(app,/state\.playerQueue = null/);assert.match(app,/if \(!\$\("#orgModal"\)\.hidden\) return/)});
test('organizer is reachable in fullscreen and modal keys stay inside',()=>{assert.match(app,/\$\("#playerShell"\)\.appendChild\(orgModal\)/);assert.match(css,/\.player-shell > #orgModal/);assert.match(app,/const guarded = topGuardModal\(\)/);assert.match(app,/focusCol !== null/)});
