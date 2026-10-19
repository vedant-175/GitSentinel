import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatTime, formatDateTime } from './date-format';

describe('date-format utilities', () => {
  test('formatDate handles null and undefined gracefully', () => {
    assert.equal(formatDate(null), 'recent');
    assert.equal(formatDate(undefined), 'recent');
    assert.equal(formatDate('invalid-date'), 'recent');
  });

  test('formatDate formats valid date objects and ISO strings deterministically', () => {
    const d = new Date(2026, 9, 18, 14, 30, 0); // Oct 18, 2026
    assert.equal(formatDate(d), 'Oct 18, 2026');
    assert.equal(formatDate(d.toISOString()), formatDate(d));
  });

  test('formatTime formats valid time deterministically', () => {
    const d = new Date(2026, 9, 18, 9, 5, 7);
    assert.equal(formatTime(d), '09:05:07');
    assert.equal(formatTime(null), '');
  });

  test('formatDateTime formats valid date and time deterministically', () => {
    const d = new Date(2026, 9, 18, 14, 5, 9);
    assert.equal(formatDateTime(d), 'Oct 18, 2026 14:05:09');
    assert.equal(formatDateTime(null), '');
  });
});
