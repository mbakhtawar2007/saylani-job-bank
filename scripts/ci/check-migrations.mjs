#!/usr/bin/env node
/**
 * Migration consistency check for CI (no dependencies, runs on plain node).
 *
 * Fails when:
 *   1. meta/_journal.json idx values are not 0..n-1 in order;
 *   2. a journal tag is duplicated, or a migration file has no journal entry
 *      (or vice versa) — the journal is the order drizzle applies migrations;
 *   3. two migrations share a numeric prefix, unless the number is a documented
 *      legacy collision (see below).
 *
 * Legacy collisions: 0014 and 0015 each exist twice (e.g. 0014_job_benefits and
 * 0014_matching). Those migrations are already applied in journal order on every
 * environment; renumbering them would break drizzle's record of what ran. New
 * migrations must use a fresh number — that is what this check enforces.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const migrationsDir = join(repoRoot, 'packages', 'db', 'migrations');
const journalPath = join(migrationsDir, 'meta', '_journal.json');

// Numbers that already collide in history (applied, must not be renumbered).
const LEGACY_NUMBER_COLLISIONS = new Set(['0014', '0015']);

const failures = [];
const fail = (message) => failures.push(message);

const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
const entries = journal.entries ?? [];
const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .map((name) => name.slice(0, -'.sql'.length));

// 1. idx values sequential from 0.
entries.forEach((entry, i) => {
  if (entry.idx !== i) {
    fail(`journal entry ${i} has idx ${entry.idx} (expected ${i}); re-generate with drizzle-kit`);
  }
  if (typeof entry.tag !== 'string' || entry.tag.length === 0) {
    fail(`journal entry ${i} has no tag`);
  }
});

// 2. Tags unique, and journal <-> files agree exactly (order-insensitive:
//    drizzle applies in journal order, files on disk have no order).
const tags = entries.map((entry) => entry.tag);
const duplicateTags = tags.filter((tag, i) => tags.indexOf(tag) !== i);
if (duplicateTags.length > 0) {
  fail(`duplicate journal tags: ${[...new Set(duplicateTags)].join(', ')}`);
}
const journalOnly = tags.filter((tag) => !files.includes(tag));
const fileOnly = files.filter((file) => !tags.includes(file));
if (journalOnly.length > 0) {
  fail(`journal tags with no migration file: ${journalOnly.join(', ')}`);
}
if (fileOnly.length > 0) {
  fail(
    `migration files with no journal entry (add them with drizzle-kit generate): ${fileOnly.join(', ')}`,
  );
}

// 3. Numeric prefixes unique, except the documented legacy collisions.
const byNumber = new Map();
for (const file of files) {
  const number = file.split('_')[0];
  byNumber.set(number, [...(byNumber.get(number) ?? []), file]);
}
for (const [number, names] of byNumber) {
  if (names.length > 1 && !LEGACY_NUMBER_COLLISIONS.has(number)) {
    fail(
      `migration number ${number} is used by ${names.join(' and ')} — ` +
        'give the new migration the next free number (see the 0024/0025 collision in the repo history)',
    );
  }
}

if (failures.length > 0) {
  for (const message of failures) console.error(`✘ check-migrations: ${message}`);
  process.exit(1);
}
console.log(
  `✔ check-migrations: ${entries.length} migrations, journal consistent, no new number collisions`,
);
