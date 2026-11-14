#!/usr/bin/env node
// Offline integrity verifier. Deliberately contains no USB or camera transport.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const HEX = /^(?:[a-f0-9]{2})+$/;
export const PROPERTY_IDS = ['D18C','D18D',...Array.from({length:24}, (_,i) => (0xD18E+i).toString(16).toUpperCase())];
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const assert = (condition, reason) => { if (!condition) throw new Error(reason); };
const keys = (object, allowed, context) => {
  assert(object && typeof object === 'object' && !Array.isArray(object), `${context}: expected object`);
  assert(Object.keys(object).every(key => allowed.includes(key)), `${context}: unknown field`);
};
const hex = (s, context) => {
  assert(typeof s === 'string' && HEX.test(s) && s.length <= 8192, `${context}: invalid hex payload`);
  return Buffer.from(s, 'hex');
};

/**
 * Receives two separate, independently acquired read-only capture rounds.
 * Each round contains complete payloads for all 7 camera-selected slots.
 * Metadata and hashes are derived from actual bytes, never trusted inputs.
 * This verifier cannot prove that submitted data originated from hardware.
 */
export function validateSlotBackup(capture) {
  keys(capture, ['format','model','serial','rounds'], 'capture');
  assert(capture.format === 'x100vi-c-slots-readonly-v1', 'unexpected format');
  assert(capture.model === 'X100VI', 'model must equal X100VI');
  assert(typeof capture.serial === 'string' && capture.serial.trim() === capture.serial && capture.serial.length >= 3 && capture.serial.length <= 128 && /^[\x21-\x7e]+$/.test(capture.serial), 'missing or invalid explicit device serial');
  assert(Array.isArray(capture.rounds) && capture.rounds.length === 2, 'two complete independent readback rounds required');
  const normalized = capture.rounds.map((round, roundIndex) => {
    keys(round, ['model','serial','slots','evidence'], `round ${roundIndex + 1}`);
    assert(round.model === capture.model && round.serial === capture.serial, 'device identity mismatch between rounds');
    assert(round.evidence === 'external-readonly-capture', 'unverified capture provenance');
    assert(Array.isArray(round.slots) && round.slots.length === 7, 'exactly C1-C7 required in each round');
    const seen = new Set();
    return round.slots.map(slot => {
      keys(slot, ['slot','properties'], 'slot');
      assert(Number.isInteger(slot.slot) && slot.slot >= 1 && slot.slot <= 7 && !seen.has(slot.slot), 'duplicate, absent or invalid slot');
      seen.add(slot.slot);
      keys(slot.properties, PROPERTY_IDS, 'properties');
      assert(Object.keys(slot.properties).length === PROPERTY_IDS.length, `C${slot.slot}: incomplete property inventory`);
      const canonical = {};
      for (const id of PROPERTY_IDS) canonical[id] = hex(slot.properties[id], `C${slot.slot} property ${id}`).toString('hex');
      const active = Buffer.from(canonical.D18C,'hex');
      assert(active.length === 2 && active.readUInt16LE(0) === slot.slot, `C${slot.slot}: D18C selection proof absent`);
      const rawName = Buffer.from(canonical.D18D,'hex');
      assert(rawName.length >= 3 && rawName.length === 1 + rawName[0]*2 && rawName[0] > 0, `C${slot.slot}: invalid PTP name bytes`);
      assert(rawName[rawName.length-1] === 0 && rawName[rawName.length-2] === 0, `C${slot.slot}: missing PTP name terminator`);
      const name = rawName.subarray(1,rawName.length-2).toString('utf16le');
      assert(name.length > 0 && !name.includes('\0') && !name.includes('\ufffd'), `C${slot.slot}: invalid slot name`);
      return { slot:slot.slot, name, properties:canonical, sha256:sha256(Buffer.from(JSON.stringify(canonical))) };
    }).sort((a,b) => a.slot-b.slot);
  });
  for (let slot = 0; slot < 7; slot++) {
    assert(normalized[0][slot].slot === slot+1 && normalized[1][slot].slot === slot+1, `C${slot+1} missing`);
    assert(normalized[0][slot].sha256 === normalized[1][slot].sha256, `C${slot+1} repeat readback hash mismatch`);
  }
  const slots = normalized[0].map(({slot,name,properties,sha256}) => ({slot,name,sha256,propertyHashes:Object.fromEntries(Object.entries(properties).map(([id,value]) => [id,sha256Bytes(value)]))}));
  const document = {format:'x100vi-c-slots-offline-consistent-v1', hardwareVerified:false, restoreVerified:false, automaticReadOnlyScanSupported:false, model:capture.model, serial:capture.serial, roundsCompared:2, slots};
  return {...document, manifestSha256:sha256(Buffer.from(JSON.stringify(document)))};
}
function sha256Bytes(value) { return sha256(Buffer.from(value, 'hex')); }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assert(process.argv.length === 4 && process.argv[2] === '--validate', 'usage: node tools/x100vi-slot-backup.mjs --validate capture.json');
    const data = readFileSync(process.argv[3]);
    assert(data.length <= 2_000_000, 'capture exceeds size limit');
    const output = validateSlotBackup(JSON.parse(data.toString('utf8')));
    process.stdout.write(JSON.stringify({ok:true,...output},null,2)+'\n');
  } catch (error) {
    process.stderr.write(JSON.stringify({ok:false,error:error.message})+'\n');
    process.exitCode=2;
  }
}
