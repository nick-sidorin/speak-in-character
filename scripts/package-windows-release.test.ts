import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = resolve('scripts/package-windows-release.sh');
const archive = 'SpeakInCharacter-v0.10.5-Windows-x64-portable.zip';
let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'speak release '));
  mkdirSync(join(workspace, 'staging', 'win-unpacked', 'resources'), { recursive: true });
});
afterEach(() => rmSync(workspace, { recursive: true, force: true }));

function packageRelease() {
  return spawnSync('bash', [script], {
    cwd: workspace,
    env: {
      ...process.env,
      VERSION: 'v0.10.5',
      GITHUB_WORKSPACE: workspace,
      GITHUB_OUTPUT: join(workspace, 'github-output'),
    },
    encoding: 'utf8',
  });
}

describe('portable Windows release packaging', () => {
  it('packages the renamed app at the ZIP root with a matching checksum', () => {
    writeFileSync(join(workspace, 'staging', 'win-unpacked', 'SpeakInCharacter.exe'), 'app');
    writeFileSync(join(workspace, 'staging', 'win-unpacked', 'resources', 'app.asar'), 'resources');
    writeFileSync(join(workspace, 'repository-file.txt'), 'not part of the application');

    const result = packageRelease();
    expect(result.status, result.stderr).toBe(0);
    const files = execFileSync('unzip', ['-Z1', join(workspace, archive)], { encoding: 'utf8' }).trim().split('\n');
    expect(files.sort()).toEqual(['SpeakInCharacter.exe', 'resources/', 'resources/app.asar']);
    const digest = createHash('sha256').update(readFileSync(join(workspace, archive))).digest('hex');
    expect(readFileSync(join(workspace, 'SHA256SUMS.txt'), 'utf8')).toBe(`${digest}  ${archive}\n`);
    expect(readFileSync(join(workspace, 'github-output'), 'utf8')).toBe(`archive=${archive}\n`);
  });

  it('fails before creating an archive when only the old executable name is present', () => {
    writeFileSync(join(workspace, 'staging', 'win-unpacked', 'InCharacter.exe'), 'old app');

    const result = packageRelease();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('No SpeakInCharacter.exe found');
    expect(existsSync(join(workspace, archive))).toBe(false);
    expect(existsSync(join(workspace, 'SHA256SUMS.txt'))).toBe(false);
    expect(existsSync(join(workspace, 'github-output'))).toBe(false);
  });
});
