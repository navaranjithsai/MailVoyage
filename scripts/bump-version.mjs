#!/usr/bin/env node
// ──────────────────────────────────────────────────────────────
// MailVoyage — Local CalVer Version Bumper
//
// Usage:
//   node scripts/bump-version.mjs            # auto CalVer
//   node scripts/bump-version.mjs 2026.2.99  # manual override
//
// What it does:
//   1. Fetches latest git tags
//   2. Calculates next CalVer version (YYYY.M.BUILD)
//   3. Updates package.json + api/package.json
//   4. Prints the new version (no commit — you decide when)
//
// The CI pipeline then reads this version from package.json
// instead of calculating it, keeping everything in sync.
// ──────────────────────────────────────────────────────────────

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Helpers ────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf-8', cwd: ROOT, ...opts }).trim();
}

function readPkg(relativePath) {
  const full = resolve(ROOT, relativePath);
  return JSON.parse(readFileSync(full, 'utf-8'));
}

function writePkg(relativePath, data) {
  const full = resolve(ROOT, relativePath);
  writeFileSync(full, JSON.stringify(data, null, 2) + '\n');
}

// ── Ensure we're in a git repo ─────────────────────────────────

try {
  run('git rev-parse --git-dir');
} catch {
  console.error('✗ Not a git repository. Run this from the project root.');
  process.exit(1);
}

// ── Fetch latest tags from remote ──────────────────────────────

console.log('⟳ Fetching latest tags from remote...');
try {
  run('git fetch --tags --quiet');
} catch {
  console.warn('⚠ Could not fetch remote tags (offline?). Using local tags only.');
}

// ── Calculate version ──────────────────────────────────────────

const manualVersion = process.argv[2];
let version;

if (manualVersion) {
  // Manual override: node scripts/bump-version.mjs 2026.2.99
  version = manualVersion.replace(/^v/, '');
  console.log(`⤷ Manual version override: ${version}`);
} else {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1-12, no zero-padding
  const prefix = `v${year}.${month}`;

  let latestBuild = 0;
  try {
    const tags = run(`git tag --list "${prefix}.*" --sort=-version:refname`);
    if (tags) {
      const firstTag = tags.split('\n')[0];
      const match = firstTag.match(/\.(\d+)$/);
      if (match) latestBuild = parseInt(match[1], 10);
    }
  } catch {
    // No tags found — start at build 1
  }

  const nextBuild = latestBuild + 1;
  version = `${year}.${month}.${nextBuild}`;
}

// ── Read current version ───────────────────────────────────────

const rootPkg = readPkg('package.json');
const apiPkg = readPkg('api/package.json');
const oldVersion = rootPkg.version;

if (oldVersion === version) {
  console.log(`✓ Already at version ${version}. Nothing to bump.`);
  process.exit(0);
}

// ── Update package.json files ──────────────────────────────────

rootPkg.version = version;
apiPkg.version = version;

writePkg('package.json', rootPkg);
writePkg('api/package.json', apiPkg);

// ── Summary ────────────────────────────────────────────────────

console.log('');
console.log('┌─────────────────────────────────────────┐');
console.log(`│  Version bumped: ${oldVersion.padEnd(12)} → ${version.padEnd(8)} │`);
console.log('├─────────────────────────────────────────┤');
console.log('│  ✓ package.json                         │');
console.log('│  ✓ api/package.json                     │');
console.log('├─────────────────────────────────────────┤');
console.log('│  Next steps:                            │');
console.log('│  1. git add -A                          │');
console.log('│  2. git commit -m "your message"        │');
console.log('│  3. git push origin main                │');
console.log('│  CI handles: tag, Docker, Release       │');
console.log('└─────────────────────────────────────────┘');
console.log('');
