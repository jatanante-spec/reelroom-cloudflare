import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
test('sound controls show an icon but keep accessible labels and a 44px target', () => {
  assert.match(css, /#soundHelperText \{[^}]*width: 1px; height: 1px/);
  assert.match(css, /width: 44px; height: 44px/);
  assert.match(app, /helper\.setAttribute\("aria-label", helpLabel\)/);
  assert.match(app, /fsBtn\.textContent = icon/);
  assert.match(app, /fsBtn\.setAttribute\("aria-label", fsBtn\.title\)/);
  assert.match(html, /id="fsSoundBtn"[^>]*>🔇<\/button>/);
});
