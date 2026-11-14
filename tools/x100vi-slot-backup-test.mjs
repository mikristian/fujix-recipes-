import { strict as assert } from 'node:assert';
import { validateSlotBackup, PROPERTY_IDS } from './x100vi-slot-backup.mjs';

function fixture() {
  const slots = Array.from({length:7}, (_,index) => {
    const n = index+1;
    const properties = Object.fromEntries(PROPERTY_IDS.map(id => [id, '0100']));
    properties.D18C = Buffer.from([n,0]).toString('hex');
    properties.D18D = Buffer.from([3,67,0,48+n,0,0,0]).toString('hex');
    return {slot:n,properties};
  });
  return {format:'x100vi-c-slots-readonly-v1',model:'X100VI',serial:'TEST-SERIAL-001',rounds:[0,1].map(() => ({model:'X100VI',serial:'TEST-SERIAL-001',evidence:'external-readonly-capture',slots:structuredClone(slots)}))};
}
const good=fixture();
assert.equal(validateSlotBackup(good).slots.length,7);
assert.equal(validateSlotBackup(good).roundsCompared,2);
assert.equal(validateSlotBackup(good).hardwareVerified,false);
assert.equal(validateSlotBackup(good).automaticReadOnlyScanSupported,false);
const cases = [
  ['missing serial',x=>{x.serial='';}],
  ['model spoof',x=>{x.model='X-T5';}],
  ['missing slot',x=>{x.rounds[1].slots.pop();}],
  ['duplicate slot',x=>{x.rounds[1].slots[6].slot=1;}],
  ['different serial',x=>{x.rounds[1].serial='OTHER';}],
  ['missing property',x=>{delete x.rounds[0].slots[0].properties.D19D;}],
  ['readback mismatch',x=>{x.rounds[1].slots[3].properties.D19D='0200';}],
  ['wrong selected slot',x=>{x.rounds[0].slots[0].properties.D18C='0200';}],
  ['bad hex',x=>{x.rounds[0].slots[0].properties.D19D='00zz';}],
  ['partial rounds',x=>{x.rounds.pop();}],
  ['unsupported provenance',x=>{x.rounds[0].evidence='guessed';}],
  ['PTP missing string terminator',x=>{x.rounds[0].slots[0].properties.D18D='03430031004100';}],
  ['PTP embedded null name',x=>{x.rounds[0].slots[0].properties.D18D='03430000000000';}],
  ['oversized raw property',x=>{x.rounds[0].slots[0].properties.D18E='ab'.repeat(4097);}],
  ['unknown capture field',x=>{x.overwrite=true;}],
  ['unknown slot field',x=>{x.rounds[0].slots[0].verified=true;}],
  ['serial with spaces',x=>{x.serial=' FAKE ';}],
];
for (const [description,mutate] of cases) {
  const bad=fixture();mutate(bad);
  assert.throws(() => validateSlotBackup(bad),undefined,description);
}
console.log(`PASS: valid double capture and ${cases.length} rejected failure fixtures`);
