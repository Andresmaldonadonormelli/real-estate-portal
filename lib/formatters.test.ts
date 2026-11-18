import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { transactionMonthKey } from './calculations.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('October 1 stays in October when the calendar date is read directly', () => {
  assert.equal(transactionMonthKey('2026-10-01'), '2026-10');
});

test('Chase dates do not move back a day in Eastern Time', () => {
  const script = `
    import { transactionMonthKey } from './lib/calculations.ts';
    import { formatDateShort } from './lib/formatters.ts';
    const shifted = new Date('2026-10-16').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (shifted !== 'Oct 15') throw new Error('Eastern Time did not shift a UTC date parse: ' + shifted);
    const oldMonth = new Date('2026-10-01');
    const oldKey = oldMonth.getFullYear() + '-' + String(oldMonth.getMonth() + 1).padStart(2, '0');
    if (oldKey !== '2026-09') throw new Error('Eastern Time did not shift the month bucket: ' + oldKey);
    for (const [iso, label] of [['2026-10-16', 'Oct 16'], ['2026-10-15', 'Oct 15'], ['2026-10-14', 'Oct 14'], ['2026-10-13', 'Oct 13']]) {
      const actual = formatDateShort(iso);
      if (actual !== label) throw new Error(iso + ' displayed ' + actual);
    }
    if (transactionMonthKey('2026-10-01') !== '2026-10') throw new Error('October 1 left October');
  `;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], {
    cwd: root,
    env: { ...process.env, TZ: 'America/New_York' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
