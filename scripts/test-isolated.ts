import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function collectTestFiles(): Promise<string[]> {
  const files: string[] = [];
  await collectTestFilesInDirectory('src', files);
  return files.toSorted((a, b) => a.localeCompare(b));
}

async function collectTestFilesInDirectory(
  directory: string,
  files: string[],
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      await collectTestFilesInDirectory(path, files);
      continue;
    }

    if (path.endsWith('.test.ts') || path.endsWith('.test.tsx')) {
      files.push(path);
    }
  }
}

function runTestFile(file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    const child = spawn(
      pnpm,
      ['exec', 'vitest', 'run', '--config', 'vitest.config.ts', file],
      {
        stdio: 'inherit',
      },
    );

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Test failed: ${file}`));
    });
  });
}

async function main() {
  const files = await collectTestFiles();

  if (files.length === 0) {
    console.log('No test files found.');
    return;
  }

  console.log(`Running ${files.length} test files in isolated processes...`);

  for (const file of files) {
    console.log(`\nRunning ${file}`);
    await runTestFile(file);
  }

  console.log('\nAll isolated tests passed.');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
