// The MCP server over stdio, driven by the official SDK client, against the
// mock. Skipped (with a message) when the SDK is not installed in connectors/.
// Also checks the config mcp-install writes for each agent.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { installMcp, AGENTS, stripTomlServer } from '../lib/mcp-install.mjs';
import { KEYS, setup } from './helpers.mjs';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(DIR, 'mcp', 'server.mjs');
const hasSdk = fs.existsSync(path.join(DIR, 'node_modules', '@modelcontextprotocol', 'sdk', 'package.json'));

let h;
before(async () => {
  h = await setup();
});
after(async () => {
  await h?.close();
});

describe('MCP server over stdio', { skip: hasSdk ? false : 'the MCP SDK is not installed (npm install inside connectors/)' }, () => {
  let client;
  let transport;
  let root;
  let stderr = '';

  before(async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
    root = h.newRoot();
    transport = new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { SYSTEMROOT: process.env.SYSTEMROOT ?? '', PATH: process.env.PATH ?? '', ...h.env(root) }, stderr: 'pipe' });
    transport.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    client = new Client({ name: 'film-gen-test', version: '1.0.0' });
    await client.connect(transport);
  });

  after(async () => {
    await client?.close();
  });

  const args = { kind: 'image', provider: 'google', model: 'gemini-3.1-flash-image', film: 'mcp', name: 'still', promptFile: 'prompts/shot.txt', resolution: '1K' };

  test('initialise and list the three tools', async () => {
    const info = client.getServerVersion();
    assert.equal(info.name, 'film-gen');
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ['estimate', 'generate', 'ledger']);
    const gen = tools.find((t) => t.name === 'generate');
    assert.ok(gen.inputSchema.required.includes('token'), 'generate requires the token');
  });

  test('generate without an estimate token is refused and spends nothing', async () => {
    h.mock.reset();
    const r = await client.callTool({ name: 'generate', arguments: { ...args, token: 'not-a-token' } });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /call estimate/);
    assert.equal(h.mock.log.length, 0);
  });

  test('estimate, then generate with its token, writes the file; the token works once', async () => {
    h.mock.reset();
    const est = await client.callTool({ name: 'estimate', arguments: args });
    assert.ok(!est.isError, est.content?.[0]?.text);
    assert.equal(est.structuredContent.estimateUsd, 0.067);
    assert.deepEqual(est.structuredContent.refusals, []);
    const token = est.structuredContent.token;
    assert.match(token, /^[0-9a-f]{32}$/);
    assert.equal(h.mock.log.length, 0, 'estimate sends nothing');

    const changed = await client.callTool({ name: 'generate', arguments: { ...args, resolution: '4K', token } });
    assert.equal(changed.isError, true, 'a token only covers the arguments that were estimated');
    assert.match(changed.content[0].text, /differ/);

    const gen = await client.callTool({ name: 'generate', arguments: { ...args, token } });
    assert.ok(!gen.isError, gen.content?.[0]?.text);
    assert.equal(gen.structuredContent.file, 'public/films/mcp/media/still.png');
    assert.deepEqual(fs.readFileSync(path.join(root, 'public', 'films', 'mcp', 'media', 'still.png')), h.fx.png);

    const again = await client.callTool({ name: 'generate', arguments: { ...args, name: 'still', token } });
    assert.equal(again.isError, true, 'single use');
  });

  test('ledger reports the spend', async () => {
    const r = await client.callTool({ name: 'ledger', arguments: { film: 'mcp' } });
    assert.ok(!r.isError);
    assert.equal(r.structuredContent.films[0].spentUsd, 0.067);
  });

  test('params that would change the price behind the estimate are refused (review 1)', async () => {
    const r = await client.callTool({ name: 'estimate', arguments: { ...args, name: 'p-mcp', params: { imageConfig: { imageSize: '4K' } } } });
    assert.equal(r.isError, true, r.content?.[0]?.text);
    assert.match(r.content[0].text, /imageConfig/);
  });

  test('a usage mistake comes back as a tool error and the server keeps running', async () => {
    const bad = await client.callTool({ name: 'estimate', arguments: { ...args, kind: 'video' } });
    assert.equal(bad.isError, true);
    assert.match(bad.content[0].text, /makes image/);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 3);
  });

  test('a refused generate comes back as a tool error and sends nothing', async () => {
    const omni = { kind: 'video', provider: 'google', model: 'gemini-omni-1.1-flash', film: 'mcp', name: 'omni', prompt: 'a slow push in on a lit window', resolution: '1080p' };
    const est = await client.callTool({ name: 'estimate', arguments: omni });
    assert.ok(!est.isError);
    assert.equal(est.structuredContent.priceKnown, false);
    assert.ok(est.structuredContent.refusals.some((r) => /unknown/.test(r)));
    h.mock.reset();
    const gen = await client.callTool({ name: 'generate', arguments: { ...omni, token: est.structuredContent.token } });
    assert.equal(gen.isError, true);
    assert.match(gen.content[0].text, /unknown-price/);
    assert.equal(h.mock.log.length, 0, 'nothing was sent');
  });

  test('nothing the server said carries a key', () => {
    for (const k of Object.values(KEYS)) assert.ok(!stderr.includes(k));
    h.assertNoKeys(root);
  });
});

describe('mcp-install', () => {
  test('writes each agent\'s documented format with absolute paths and no secrets', () => {
    const root = h.newRoot();
    for (const agent of AGENTS) {
      const r = installMcp({ agent, root, nodePath: '/usr/bin/node' });
      assert.equal(r.written, true, `${agent}: ${r.notes.join(' ')}`);
      const text = fs.readFileSync(r.file, 'utf8');
      for (const k of Object.values(KEYS)) assert.ok(!text.includes(k));
      assert.ok(!/KEY|TOKEN/.test(text.replace(/tool_timeout_sec|startup_timeout_sec/g, '')), `${agent}: no key names either`);
      if (agent === 'codex') {
        assert.match(text, /^\[mcp_servers\.film-gen\]$/m);
        assert.match(text, /^command = '\/usr\/bin\/node'$/m);
        assert.match(text, /^tool_timeout_sec = 1800$/m);
        continue;
      }
      const j = JSON.parse(text);
      const entry = { claude: j.mcpServers?.['film-gen'], cursor: j.mcpServers?.['film-gen'], gemini: j.mcpServers?.['film-gen'], vscode: j.servers?.['film-gen'], opencode: j.mcp?.['film-gen'] }[agent];
      assert.ok(entry, `${agent} entry`);
      if (agent === 'opencode') {
        assert.equal(entry.type, 'local');
        assert.deepEqual(entry.command, ['/usr/bin/node', SERVER]);
        assert.equal(j.$schema, 'https://opencode.ai/config.json');
      } else {
        assert.equal(entry.command, '/usr/bin/node');
        assert.deepEqual(entry.args, [SERVER]);
      }
      if (agent === 'claude') assert.equal(entry.timeout, 1_800_000);
      if (agent === 'vscode' || agent === 'claude' || agent === 'cursor') assert.equal(entry.type, 'stdio');
    }
    assert.ok(fs.existsSync(path.join(root, '.mcp.json')));
    assert.ok(fs.existsSync(path.join(root, '.codex', 'config.toml')));
    assert.ok(fs.existsSync(path.join(root, '.cursor', 'mcp.json')));
    assert.ok(fs.existsSync(path.join(root, '.gemini', 'settings.json')));
    assert.ok(fs.existsSync(path.join(root, '.vscode', 'mcp.json')));
    assert.ok(fs.existsSync(path.join(root, 'opencode.json')));
  });

  test('merges into existing config, replaces its own entry, and leaves unreadable files alone', () => {
    const root = h.newRoot();
    fs.writeFileSync(path.join(root, '.mcp.json'), JSON.stringify({ mcpServers: { other: { type: 'stdio', command: 'x' } } }));
    installMcp({ agent: 'claude', root, nodePath: 'node-a' });
    installMcp({ agent: 'claude', root, nodePath: 'node-b' });
    const j = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8'));
    assert.deepEqual(Object.keys(j.mcpServers).sort(), ['film-gen', 'other']);
    assert.equal(j.mcpServers['film-gen'].command, 'node-b');

    fs.mkdirSync(path.join(root, '.codex'), { recursive: true });
    fs.writeFileSync(path.join(root, '.codex', 'config.toml'), 'model = "x"\n\n[mcp_servers.film-gen]\ncommand = \'old\'\n\n[mcp_servers.film-gen.env]\nA = "1"\n\n[mcp_servers.keep]\ncommand = "k"\n');
    installMcp({ agent: 'codex', root, nodePath: 'node-c' });
    const toml = fs.readFileSync(path.join(root, '.codex', 'config.toml'), 'utf8');
    assert.equal((toml.match(/\[mcp_servers\.film-gen\]/g) ?? []).length, 1);
    assert.ok(!toml.includes("'old'"));
    assert.ok(!toml.includes('[mcp_servers.film-gen.env]'));
    assert.ok(toml.includes('[mcp_servers.keep]'));
    assert.ok(toml.includes('model = "x"'));

    fs.mkdirSync(path.join(root, '.vscode'), { recursive: true });
    fs.writeFileSync(path.join(root, '.vscode', 'mcp.json'), '{ // a comment\n "servers": {} }');
    const r = installMcp({ agent: 'vscode', root });
    assert.equal(r.written, false);
    assert.match(r.snippet, /"servers"/);
    assert.equal(stripTomlServer('[mcp_servers.film-gen]\na=1'), '');
  });
});
