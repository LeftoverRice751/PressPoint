import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as policy from '../../resources/js/password-policy.mjs';

test('one of each class is not strong', () => {
  assert.deepEqual(policy.missingRules('Password1!'), ['2 uppercase', '2 numbers', '2 symbols']);
});

test('two of each class passes', () => {
  assert.deepEqual(policy.missingRules('AAbb12!!xyz'), []);
});

test('empty password misses every rule', () => {
  assert.equal(policy.missingRules('').length, policy.RULE_COUNT);
});

test('constants match app/services/PasswordChange.py', () => {
  // The server enforces these; the meter drifted from them once already.
  const py = readFileSync(new URL('../../app/services/PasswordChange.py', import.meta.url), 'utf8');
  for (const name of ['MIN_LENGTH', 'MIN_UPPER', 'MIN_LOWER', 'MIN_DIGITS', 'MIN_SYMBOLS']) {
    const match = py.match(new RegExp('^' + name + '\\s*=\\s*(\\d+)', 'm'));
    assert.ok(match, name + ' missing from PasswordChange.py');
    assert.equal(policy[name], Number(match[1]), name);
  }
});
