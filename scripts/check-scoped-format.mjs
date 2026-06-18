#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const explicitFiles = process.argv.slice(2).filter(Boolean);
const oxfmtExtensions = new Set([
    '.cjs',
    '.css',
    '.js',
    '.json',
    '.jsx',
    '.md',
    '.mjs',
    '.toml',
    '.ts',
    '.tsx',
    '.yaml',
    '.yml'
]);

function commandName(name) {
    return process.platform === 'win32' ? `${name}.cmd` : name;
}

function run(command, args) {
    const result = spawnSync(command, args, {
        cwd: repoRoot,
        stdio: 'inherit',
        shell: process.platform === 'win32'
    });
    if (result.error) {
        console.error(
            `Failed to run ${command}: ${result.error.message || result.error}`
        );
    } else if (result.signal) {
        console.error(`${command} exited from signal ${result.signal}.`);
    }
    return result.status === 0;
}

function gitLines(args) {
    const result = spawnSync('git', args, {
        cwd: repoRoot,
        encoding: 'utf8',
        shell: false
    });
    if (result.status !== 0) {
        return [];
    }
    return result.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

function changedFiles() {
    return [
        ...gitLines(['diff', '--name-only', '--diff-filter=ACMR', '--']),
        ...gitLines(['ls-files', '--others', '--exclude-standard'])
    ];
}

function normalizeFile(file) {
    return path.relative(repoRoot, path.resolve(repoRoot, file));
}

const files = [
    ...new Set(explicitFiles.length ? explicitFiles : changedFiles())
]
    .map(normalizeFile)
    .filter((file) => existsSync(path.join(repoRoot, file)));

const rustFiles = files.filter((file) => file.endsWith('.rs'));
const oxfmtFiles = files.filter((file) =>
    oxfmtExtensions.has(path.extname(file))
);

let ok = true;

if (oxfmtFiles.length > 0) {
    ok = run(commandName('npx'), ['oxfmt', '--check', ...oxfmtFiles]) && ok;
}

if (rustFiles.length > 0) {
    ok = run('rustfmt', ['--edition', '2021', '--check', ...rustFiles]) && ok;
}

if (oxfmtFiles.length === 0 && rustFiles.length === 0) {
    console.log('No scoped files need format checks.');
}

process.exit(ok ? 0 : 1);
