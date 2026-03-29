#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import process from 'node:process';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const actions = [
  { key: '1', label: 'Quick suite (frontend + api)', command: [npmCmd, ['run', 'test']] },
  { key: '2', label: 'Frontend suite only', command: [npmCmd, ['run', 'test:unit']] },
  { key: '3', label: 'API suite only', command: [npmCmd, ['run', 'test:api']] },
  { key: '4', label: 'Phase 1 (frontend utilities)', command: [npmCmd, ['run', 'test:phase1']] },
  { key: '5', label: 'Phase 2 (frontend state/hooks)', command: [npmCmd, ['run', 'test:phase2']] },
  { key: '6', label: 'Phase 3 (api validation/services)', command: [npmCmd, ['run', 'test:phase3']] },
  { key: '7', label: 'Phase 4 (api routes isolation)', command: [npmCmd, ['run', 'test:phase4']] },
  { key: '8', label: 'Phase 5 (regression/stability)', command: [npmCmd, ['run', 'test:phase5']] },
  { key: '9', label: 'All phases', command: [npmCmd, ['run', 'test:all:phases']] },
  { key: '10', label: 'Coverage (frontend + api)', command: [npmCmd, ['run', 'test:coverage:all']] },
  { key: '11', label: 'Clean test artifacts (safe)', command: [npmCmd, ['run', 'test:clean']] },
];

function renderMenu() {
  console.log('');
  console.log('MailVoyage Test Runner');
  console.log('Choose what to run:');

  for (const action of actions) {
    console.log(`  ${action.key}. ${action.label}`);
  }

  console.log('  q. Quit');
  console.log('');
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command exited with code ${code}`));
    });
  });
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    while (true) {
      renderMenu();
      const rawChoice = await rl.question('Enter option: ');
      const choice = rawChoice.trim().toLowerCase();

      if (choice === 'q') {
        console.log('Exiting test runner UI.');
        break;
      }

      const selected = actions.find((action) => action.key === choice);

      if (!selected) {
        console.log('Invalid option. Choose a listed number or q.');
        continue;
      }

      console.log('');
      console.log(`Running: ${selected.label}`);

      try {
        await runCommand(selected.command[0], selected.command[1]);
        console.log('Run completed successfully.');
      } catch (error) {
        console.error('Run failed.');
        console.error(error instanceof Error ? error.message : String(error));
      }
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});