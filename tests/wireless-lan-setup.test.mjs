import test from 'node:test';
import assert from 'node:assert/strict';
import {server} from '../server.mjs';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

test('Mac Photos dual-Wi-Fi workflow is read-only until an independent camera route exists',()=>{
  const source=readFileSync(fileURLToPath(new URL('../web/usb-mac-photos.mjs',import.meta.url)),'utf8');
  assert.match(source,/Check simultaneous Wi-Fi readiness/);
  assert.match(source,/api\/direct\/dual-network\/status/);
  assert.match(source,/dual\.mainWifiIsDefault===true&&dual\.cameraOnSeparateInterface===true/);
  assert.match(source,/Only one physical Wi-Fi adapter is present/);
  assert.doesNotMatch(source,/\#fujix-wireless-originals-setup'\)\.addEventListener\('click'.*joinCamera/);
});

test('wireless setup survives original FujiX Sync asset rebuilds and does not collect WPS PIN', async t => {
  const url = await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
  t.after(() => new Promise(resolve => server.close(resolve)));
  for (const pathname of ['/', '/index.html']) {
    const response = await fetch(url + pathname);
    assert.equal(response.status, 200);
    const document = await response.text();
    assert.match(document, /<div id="root"><\/div>/);
    assert.match(document, /wireless-lan-setup\.js/);
    assert.match(document, /wireless-lan-setup\.css/);
  }
  const script = await fetch(url + '/wireless-lan-setup.js');
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type'), /javascript/);
  const source = await script.text();
  assert.match(source, /WPS.*router/);
  assert.match(source, /Check connection/);
  assert.match(source, /Bluetooth repair/);
  assert.match(source, /Attempt one X100VI Wi-Fi photo/);
  assert.match(source, /Camera Photos/);
  assert.match(source, /Tether Studio/);
  assert.match(source, /FujiX Local Tether/);
  assert.match(source, /Start monitoring new shots/);
  assert.match(source, /Identify X100VI on home Wi-Fi/);
  assert.match(source, /Start automatic local RAW\/JPEG transfer/);
  assert.match(source, /api\/direct\/lan\/auto-transfer/);
  assert.match(source, /api\/direct\/lan\/identify/);
  assert.match(source, /api\/direct\/auto-transfer/);
  assert.match(source, /api\/tether\/inbox/);
  assert.match(source, /Save to FujiX Library/);
  assert.match(source, /X100VI Live Monitor/);
  assert.match(source, /Already took a photo with FujiX Sync's Bluetooth shutter/);
  assert.match(source, /Go to Bluetooth → Wi-Fi activation/);
  assert.match(source, /refreshHandoffStatus/);
  assert.match(source, /Request macOS Wi-Fi discovery permission/);
  assert.match(source, /api\/direct\/wifi\/authorize/);
  assert.match(source, /Start native live view/);
  assert.match(source, /Browse camera photos/);
  assert.match(source, /api\/direct\/photos/);
  assert.match(source, /Save to FujiX Library/);
  assert.match(source, /api\/direct\/shutter/);
  assert.match(source, /Review last diagnosis/);
  assert.match(source, /api\/direct\/ble\/open-settings/);
  assert.match(source, /Connect by PIN Code/);
  assert.doesNotMatch(source, /\b\d{8}\b/, 'no camera WPS PIN values are baked into the interface');
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  const css = await fetch(url + '/wireless-lan-setup.css');
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /css/);
});
