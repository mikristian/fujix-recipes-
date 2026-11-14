import assert from 'node:assert/strict';
import {test} from 'node:test';
import {server} from '../server.mjs';

// Read-only smoke contract for the existing FujiX Sync React Recipes view.
// The personal archive, browser state and camera are never mutated.
test('public catalog has no bundled private recipe records', async () => {
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/recipe-hub/catalog`);
    assert.equal(response.status,200);
    const {recipes,total} = await response.json();
    assert.deepEqual(recipes,[]);
    assert.equal(total,0);
  } finally {
    await new Promise((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
