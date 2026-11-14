#!/usr/bin/env node
// Offline plan/validator only. No camera APIs, USB access, subprocesses, or writes.
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

export const STAGES = Object.freeze([
  { id: 'handshake', opcode: '0x1001', params: [], access: 'read', implementation: 'native-helper' },
  { id: 'usb-mode', opcode: '0x1015', params: ['0xD16E'], access: 'read', implementation: 'native-helper' },
  { id: 'open-session', opcode: '0x1002', params: [1], access: 'session', implementation: 'filmkit-reference-only' },
  { id: 'upload-object-info', opcode: '0x900C', params: [0, 0, 0], access: 'upload', implementation: 'filmkit-reference-only', object_format: '0xF802', virtual_name: 'FUP_FILE.dat' },
  { id: 'upload-raf', opcode: '0x900D', params: [], access: 'upload', implementation: 'filmkit-reference-only' },
  { id: 'read-profile', opcode: '0x1015', params: ['0xD185'], access: 'read', implementation: 'filmkit-reference-only' },
  { id: 'write-profile', opcode: '0x1016', params: ['0xD185'], access: 'write', implementation: 'filmkit-reference-only', profile: 'exact-camera-returned-bytes' },
  { id: 'trigger-conversion', opcode: '0x1016', params: ['0xD183'], access: 'write', implementation: 'filmkit-reference-only', payload_u16: 0 },
  { id: 'poll-result', opcode: '0x1007', params: [4294967295, 0, 0], access: 'read', implementation: 'filmkit-reference-only' },
  { id: 'download-result', opcode: '0x1009', params: ['runtime-returned-object-handle'], access: 'read', implementation: 'filmkit-reference-only' },
  { id: 'delete-temporary-result', opcode: '0x100B', params: ['runtime-returned-object-handle'], access: 'delete', implementation: 'filmkit-reference-only' },
  { id: 'close-session', opcode: '0x1003', params: [], access: 'session', implementation: 'filmkit-reference-only' },
]);
const planError = (code) => Object.assign(new Error(code), { code });
const sha = /^[a-f0-9]{64}$/;
const exact = (a,b) => JSON.stringify(a) === JSON.stringify(b);
export function manifestFor({ name, size, sha256 }) {
  if (typeof name !== 'string' || !/^[^/\\\0]{1,255}\.raf$/i.test(name) ||
      !Number.isSafeInteger(size) || size < 16 || size > 4294967295 ||
      typeof sha256 !== 'string' || !sha.test(sha256)) throw planError('invalid_raf_metadata');
  return {
    schema: 'fujix-camera-conversion-preflight/v1', dry_run: true, transmits: false,
    camera: 'X100VI', required_usb_mode: 6, conversion_enabled: false,
    raf: { name, size, sha256 },
    steps: STAGES.map((s) => structuredClone(s)),
  };
}
export function validateManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw planError('invalid_manifest');
  const expected = manifestFor(value.raf ?? {});
  if (!exact(value, expected)) throw planError('manifest_mismatch');
  return { ok: true, dry_run: true, transmits: false, stages: STAGES.length,
    conversion_available: false, source_sha256: value.raf.sha256 };
}
async function sourceMetadata(path) {
  const stat = statSync(path);
  if (!stat.isFile() || stat.size < 16 || stat.size > 4294967295) throw planError('invalid_raf_size');
  const fd = openSync(path, 'r');
  const buf = Buffer.alloc(16);
  try { if (readSync(fd, buf, 0, 16, 0) !== 16 || !buf.toString('ascii').startsWith('FUJIFILMCCD-RAW')) throw planError('invalid_raf_magic'); }
  finally { closeSync(fd); }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  const after = statSync(path);
  if (stat.size !== after.size || stat.mtimeMs !== after.mtimeMs) throw planError('raf_changed_while_hashing');
  return { name: basename(path), size: stat.size, sha256: hash.digest('hex') };
}
async function cli(argv) {
  if (argv.length === 2 && argv[0] === '--plan') {
    const data = manifestFor(await sourceMetadata(argv[1]));
    console.log(JSON.stringify(data, null, 2)); return;
  }
  if (argv.length === 2 && argv[0] === '--validate') {
    const data = JSON.parse(readFileSync(argv[1], 'utf8'));
    console.log(JSON.stringify(validateManifest(data))); return;
  }
  throw planError('usage: --plan <local.raf> | --validate <manifest.json>');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv.slice(2)).catch((error) => {
    console.error(JSON.stringify({ok:false, error:error.code || 'invalid_input', transmits:false}));
    process.exitCode = 2;
  });
}
