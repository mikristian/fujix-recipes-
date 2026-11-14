import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
test('Shoot & Review mounts inside Library instead of a floating auto-open popup',()=>{
  const script=readFileSync(path.join(root,'web','tether-capture.mjs'),'utf8');
  const css=readFileSync(path.join(root,'web','tether-capture.css'),'utf8');
  assert.match(script,/fujix-capture-inline-target/);
  assert.match(script,/body\.hidden=true/);
  assert.match(script,/if\(inlineTarget&&dock\.parentElement!==inlineTarget\)inlineTarget\.append\(dock\)/);
  assert.match(css,/#fujix-capture-dock\{position:relative/);
  assert.doesNotMatch(css,/#fujix-capture-dock\{position:fixed/);
  const macPhotoControls=readFileSync(path.join(root,'web','usb-mac-photos.mjs'),'utf8');
  const shootPick=readFileSync(path.join(root,'web','live-shoot-pick.mjs'),'utf8');
  assert.match(macPhotoControls,/fujix-mac-controls-inline-target/);
  assert.match(macPhotoControls,/#fujix-mac-photo-floating\{position:relative/);
  assert.match(shootPick,/fujix-mac-controls-inline-target/);
});
