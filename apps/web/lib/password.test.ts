import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from './password';

test('password hashing: hashes and verifies correct password', () => {
  const password = 'SuperSecretPassword123!';
  const hash = hashPassword(password);

  assert.ok(hash);
  assert.ok(hash.includes(':'));
  assert.equal(verifyPassword(password, hash), true);
  assert.equal(verifyPassword('WrongPassword', hash), false);
  assert.equal(verifyPassword('', hash), false);
  assert.equal(verifyPassword(password, null), false);
  assert.equal(verifyPassword(password, 'invalid-format'), false);
});
