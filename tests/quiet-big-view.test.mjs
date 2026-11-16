import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
test('ordinary big view hides top chrome and lets taps and keyboard reveal it',()=>{
 assert.match(app,/function quietBigView\(\) \{ return focusFullscreen\(\) \|\| \(pseudoFs\(\) && !tvEnabled\(\)\); \}/);
 assert.match(css,/body:not\(\.tv-mode\) \.player-shell\.pseudo-fs\.fs-idle:not\(\.counting\) \.fs-controls-toggle/);
 assert.match(css,/body:not\(\.tv-mode\) \.player-shell\.pseudo-fs\.fs-idle:not\(\.counting\) \.fs-shell-fullscreen/);
 assert.match(app,/if \(quietBigView\(\)\) hideFsControls\(true\); else showFsControls\(\);\s*stepPlayer/);
 assert.match(app,/if \(!quietBigView\(\) \|\| state\.moreOpen/);
 assert.match(app,/quietBigView\(\) && \$\("#playerShell"\)\?\.classList\.contains\("fs-idle"\)/);
});
