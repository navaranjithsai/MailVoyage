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
    const isWindows = process.platform === 'win32';
    const child = isWindows
      ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `${command} ${args.join(' ')}`], {
          cwd: process.cwd(),
          env: process.env,
          stdio: 'inherit',
        })
      : spawn(command, args, {
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

function printFailureContext(error, command, args) {
  console.error(error instanceof Error ? error.message : String(error));

  const cmd = `${command} ${args.join(' ')}`;
  console.error(`Environment: platform=${process.platform}, node=${process.version}`);
  console.error(`Command: ${cmd}`);

  if (process.platform === 'win32') {
    console.error(`ComSpec: ${process.env.ComSpec || 'cmd.exe'}`);
  }

  if (error && typeof error === 'object') {
    const details = [];
    if ('code' in error && error.code) details.push(`code=${error.code}`);
    if ('errno' in error && error.errno) details.push(`errno=${error.errno}`);
    if ('syscall' in error && error.syscall) details.push(`syscall=${error.syscall}`);
    if ('path' in error && error.path) details.push(`path=${error.path}`);

    if (details.length > 0) {
      console.error(`Failure details: ${details.join(', ')}`);
    }
  }
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
        printFailureContext(error, selected.command[0], selected.command[1]);
      }
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  if (error instanceof Error && error.message === 'readline was closed') {
    process.exitCode = 0;
    return;
  }

  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});