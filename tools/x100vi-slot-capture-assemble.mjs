#!/usr/bin/env node
// Assemble 14 separately saved read-only CURRENT-slot captures into a strict
// two-round offline integrity manifest. Never opens USB or selects slots.
// It *cannot* prove that a JSON capture originated from actual camera hardware.
import { readdirSync, lstatSync, readFileSync, openSync, writeSync, fsyncSync, closeSync, unlinkSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateSlotBackup, PROPERTY_IDS } from './x100vi-slot-backup.mjs';

const fail = (error) => { throw new Error(error); };
function parseCapture(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 100 || stat.size > 65_536)
    fail('capture_invalid_size_or_type');
  const record = JSON.parse(readFileSync(path, 'utf8'));
  if (!record || record.ok !== true || record.model !== 'X100VI' ||
      record.onlyCurrentSlot !== true || record.writeCommands !== false ||
      record.complete26Properties !== true ||
      record.source !== 'ImageCaptureCore PTP read-only') fail('capture_not_complete_readonly_x100vi');
  if (!Number.isInteger(record.activeSlot) || record.activeSlot < 1 || record.activeSlot > 7)
    fail('missing_current_slot_identity');
  if (typeof record.serial !== 'string' || record.serial.length < 3 || record.serial.length > 128 ||
      !/^[\x21-\x7e]+$/.test(record.serial)) fail('invalid_camera_serial');
  const keys = Object.keys(record.properties ?? {});
  if (keys.length !== PROPERTY_IDS.length || !keys.every(key => PROPERTY_IDS.includes(key)))
    fail('incomplete_raw_properties');
  const props = Object.fromEntries(PROPERTY_IDS.map(id => [id, record.properties[id]?.hex]));
  return {slot: record.activeSlot, serial: record.serial, props};
}
function oneRound(directory) {
  const entries = readdirSync(directory).filter(name => name.endsWith('.json'));
  if (entries.length !== 7) fail('round_requires_exactly_7_capture_files');
  const captures = entries.map(name => parseCapture(join(directory, name)));
  const serial = captures[0]?.serial;
  if (!captures.every(c => c.serial === serial)) fail('serial_mismatch_within_round');
  const slots = captures.map(c => ({slot: c.slot, properties: c.props})).sort((a,b) => a.slot-b.slot);
  if (!slots.every((c, i) => c.slot === i+1)) fail('missing_or_duplicate_physical_slot');
  return {model:'X100VI', serial, evidence:'external-readonly-capture', slots};
}

export function assembleCapturedRounds(round1, round2) {
  if (resolve(round1) === resolve(round2)) fail('rounds_must_be_independently_captured');
  const first = oneRound(round1);
  const second = oneRound(round2);
  if (first.serial !== second.serial) fail('different_camera_identity_between_rounds');
  const manifest = {format:'x100vi-c-slots-readonly-v1', model:'X100VI', serial:first.serial,
    rounds:[first,second]};
  const validated = validateSlotBackup(manifest);
  if (validated.hardwareVerified !== false || validated.restoreVerified !== false) fail('unexpected_hardware_claim');
  return {manifest, validation:validated};
}

function cli(args) {
  if (args.length !== 6 || args[0] !== '--round1' || args[2] !== '--round2' || args[4] !== '--output')
    fail('usage: --round1 /path/to/7-captures --round2 /path/to/7-captures --output /new/audit.json');
  const round1 = args[1], round2 = args[3], output = args[5];
  if (!output.endsWith('.json')) fail('output_must_be_json');
  const result = assembleCapturedRounds(round1, round2);
  const data = JSON.stringify(result.manifest,null,2)+'\n';
  const fd = openSync(output, 'wx', 0o600);
  try {
    if (writeSync(fd,data) !== Buffer.byteLength(data)) fail('short_audit_write');
    fsyncSync(fd);
  } catch (error) {
    try { unlinkSync(output); } catch {}
    throw error;
  }
  finally { closeSync(fd); }
  process.stdout.write(JSON.stringify({ok:true, offline:true, hardwareVerified:false,
    restoreVerified:false, automaticReadOnlyScanSupported:false, sourceRounds:2,
    slots:7, manifestSha256:result.validation.manifestSha256,
    output:basename(output)},null,2)+'\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { cli(process.argv.slice(2)); }
  catch (error) { process.stderr.write(JSON.stringify({ok:false,error:error.message})+'\n'); process.exitCode=2; }
}
