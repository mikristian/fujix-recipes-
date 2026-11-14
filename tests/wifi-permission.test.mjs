import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const source=readFileSync(fileURLToPath(new URL('../wifi-helper.swift',import.meta.url)),'utf8');
const build=readFileSync(fileURLToPath(new URL('../build-wifi-helper.sh',import.meta.url)),'utf8');

test('camera Wi-Fi helper requires an explicit user click before Location authorization',()=>{
  assert.match(source, /@objc private func requestAccess/);
  assert.match(source,/manager\.requestWhenInUseAuthorization\(\)/);
  assert.match(source,/target:self,action:#selector\(requestAccess/);
  assert.match(source,/No Mac network was changed/);
  assert.doesNotMatch(source,/requestLocation\(\)|startUpdatingLocation\(\)|startMonitoringSignificantLocationChanges\(\)/);
  assert.match(build,/NSLocationWhenInUseUsageDescription/);
  assert.match(build,/No location coordinates are requested or stored/);
});

test('helper scans only Fuji-like camera SSIDs and hides unrelated nearby Wi-Fi details',()=>{
  assert.match(source,/name\.hasPrefix\("FUJIFILM"\)/);
  assert.match(source,/name\.contains\("X100VI"\)/);
  assert.match(source,/"networkNamesHidden"/);
  assert.match(source,/"visibleNetworkCount"/);
  assert.match(source,/"permission"/);
  assert.match(source,/network\.ssid/);
  assert.match(source,/ssid\.range\(of:/);
  assert.doesNotMatch(source,/print\(.*password|print\(.*network\.ssid|respond\(.*password/);
});
