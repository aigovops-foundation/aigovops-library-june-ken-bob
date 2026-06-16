// test/residency.test.mjs — #10 data-residency posture flag.
import { test } from 'node:test';
import assert from 'node:assert';
import { residencyTag } from '../src/core/residency.js';

test('defaults to unspecified; reads DATA_RESIDENCY; enclave detection', () => {
  const prevR = process.env.DATA_RESIDENCY; const prevP = process.env.SECRETS_PROFILE;
  delete process.env.DATA_RESIDENCY; delete process.env.SECRETS_PROFILE;
  assert.deepStrictEqual(residencyTag(), { region: 'unspecified', enclave: false });

  process.env.DATA_RESIDENCY = 'EU';
  assert.deepStrictEqual(residencyTag(), { region: 'eu', enclave: false });

  process.env.DATA_RESIDENCY = 'enclave';
  assert.equal(residencyTag().enclave, true);

  process.env.DATA_RESIDENCY = 'us'; process.env.SECRETS_PROFILE = 'enclave';
  assert.equal(residencyTag().enclave, true, 'enclave secrets profile implies enclave residency');

  if (prevR === undefined) delete process.env.DATA_RESIDENCY; else process.env.DATA_RESIDENCY = prevR;
  if (prevP === undefined) delete process.env.SECRETS_PROFILE; else process.env.SECRETS_PROFILE = prevP;
});
