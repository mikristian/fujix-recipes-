import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const cli = join(dirname(fileURLToPath(import.meta.url)), 'fujix-camera-bridge-cli.mjs');
function call(args) {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  assert.equal(r.error, undefined);
  return r;
}
const help = call(['--help']);
assert.equal(help.status, 0);
assert.match(help.stdout, /--capabilities/);
const convert = call(['--convert', '/tmp/sample.raf']);
assert.equal(convert.status, 3);
assert.equal(JSON.parse(convert.stdout).error, 'conversion_not_validated');
const malformed = call(['--unexpected']);
assert.equal(malformed.status, 64);
assert.equal(JSON.parse(malformed.stdout).conversion_available, false);
const emptyConvert = call(['--convert']);
assert.equal(emptyConvert.status, 3);
assert.equal(JSON.parse(emptyConvert.stdout).conversion_available, false);
console.log('4 offline bridge CLI assertions passed; camera was not accessed');
