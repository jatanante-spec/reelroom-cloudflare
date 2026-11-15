import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');

test('compact sound button can mute and remembers off', () => {
  assert.match(app, /sound\.status === "on" && canHostUnmute\(platform\)/);
  assert.match(app, /sound\.sessionOn = false; saveSoundSession\(false\)/);
  assert.match(app, /sendMute\(platform\); updateSoundUI\(\)/);
  assert.match(css, /min-height: 44px; min-width: 44px/);
  assert.match(css, /right: 14px; left: auto/);
});

test('restore waits for playback and happens once per video', () => {
  assert.match(app, /function restoreSoundAfterPlayback\(platform\)/);
  assert.match(app, /sound\.restoreTried = true/);
  assert.match(app, /restoreSoundAfterPlayback\("facebook"\)/);
  assert.match(app, /restoreSoundAfterPlayback\(bridge\.platform\)/);
  assert.match(app, /sound\.seq !== seq/);
});

test('blocked sound may fall back to muted playback', () => {
  assert.match(app, /sound\.status = "fallback"; sound\.fallback = true/);
  assert.match(app, /video\.muted = true;[\s\S]{0,200}video\.play\(\)/);
  assert.match(app, /if \(bridge\.playerState === 2\) \{[\s\S]{0,150}sendMute\(platform\)/);
  assert.match(app, /sound\.fallback && hostable \? "Sound\?"/);
});
