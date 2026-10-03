#!/usr/bin/env node
// npm test: the tool tests (tools/test), then the connectors' own `npm test` when their packages
// are installed (connectors/node_modules). When they are not, the connectors' tests are reported
// SKIPPED, never as a pass. No test here touches the network.
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {ROOT} from './lib/kit.mjs';

console.log('== tool tests (tools/test) ==');
const tools = spawnSync(process.execPath, ['--test', 'tools/test/*.test.mjs'], {cwd: ROOT, stdio: 'inherit'});

const connectors = path.join(ROOT, 'connectors');
let conn = null;
if (!existsSync(path.join(connectors, 'package.json'))) console.log('\nSKIPPED  connector tests: there is no connectors/ folder');
else if (!existsSync(path.join(connectors, 'node_modules'))) console.log('\nSKIPPED  connector tests: connectors/node_modules is missing (run npm ci in connectors/ to include them)');
else {
	console.log('\n== connector tests (connectors, npm test) ==');
	conn = spawnSync('npm test', {cwd: connectors, stdio: 'inherit', shell: true});
}

const failed = tools.status !== 0 || (conn && conn.status !== 0);
console.log(`\ntool tests ${tools.status === 0 ? 'passed' : 'FAILED'}; connector tests ${conn ? (conn.status === 0 ? 'passed' : 'FAILED') : 'SKIPPED'}`);
process.exitCode = failed ? 1 : 0;
