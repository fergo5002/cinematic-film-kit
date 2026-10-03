// Writes the film-gen MCP server into one agent's project config. No key is
// written anywhere: the server reads the kit's .env itself.
//
// Formats checked against each agent's docs (all read 2026-10-01):
//   claude    .mcp.json, mcpServers, type stdio, per-server "timeout" in ms
//             https://code.claude.com/docs/en/mcp
//   codex     .codex/config.toml (trusted projects), [mcp_servers.<name>],
//             command, args, cwd, startup_timeout_sec, tool_timeout_sec
//             https://developers.openai.com/codex/mcp
//   cursor    .cursor/mcp.json, mcpServers, type stdio
//             https://cursor.com/docs/mcp
//   gemini    .gemini/settings.json, mcpServers, command, args, cwd, timeout in ms
//             https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md
//   vscode    .vscode/mcp.json, servers, type stdio, command, args, cwd
//             https://code.visualstudio.com/docs/copilot/reference/mcp-configuration
//   opencode  opencode.json, mcp, type local, command as an array, cwd, enabled
//             https://opencode.ai/docs/mcp-servers/

import fs from 'node:fs';
import path from 'node:path';
import { CONNECTORS_DIR } from './env.mjs';

export const AGENTS = Object.freeze(['claude', 'codex', 'cursor', 'gemini', 'vscode', 'opencode']);
const NAME = 'film-gen';
const TOOL_TIMEOUT_MS = 1_800_000;

function tomlString(s) {
  return !s.includes("'") && !/[\r\n]/.test(s) ? `'${s}'` : JSON.stringify(s);
}

function readJson(file) {
  if (!fs.existsSync(file)) return { ok: true, data: {} };
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) return { ok: true, data: {} };
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, data: null };
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

// Removes an existing [mcp_servers.film-gen] table and its sub-tables.
export function stripTomlServer(text, name = NAME) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let skipping = false;
  const own = new RegExp(`^\\s*\\[mcp_servers\\.(?:"${name}"|${name.replace(/[-.]/g, '\\$&')})(?:\\..*)?\\]\\s*$`);
  for (const line of lines) {
    if (/^\s*\[/.test(line)) skipping = own.test(line);
    if (!skipping) out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

export function installMcp({ agent, root, print = false, nodePath = process.execPath }) {
  const server = path.join(CONNECTORS_DIR, 'mcp', 'server.mjs');
  const notes = ['The config holds absolute paths: run mcp-install again if you move the kit or change your Node install.'];
  let file;
  let snippet;
  let apply;

  switch (agent) {
    case 'claude': {
      file = path.join(root, '.mcp.json');
      const entry = { type: 'stdio', command: nodePath, args: [server], timeout: TOOL_TIMEOUT_MS };
      snippet = JSON.stringify({ mcpServers: { [NAME]: entry } }, null, 2);
      apply = () => {
        const r = readJson(file);
        if (!r.ok) return false;
        r.data.mcpServers = { ...(r.data.mcpServers ?? {}), [NAME]: entry };
        writeJson(file, r.data);
        return true;
      };
      notes.push('Claude Code asks you to approve a project server from .mcp.json the first time it starts.');
      break;
    }
    case 'codex': {
      file = path.join(root, '.codex', 'config.toml');
      snippet = [
        `[mcp_servers.${NAME}]`,
        `command = ${tomlString(nodePath)}`,
        `args = [${tomlString(server)}]`,
        `cwd = ${tomlString(root)}`,
        'startup_timeout_sec = 20',
        `tool_timeout_sec = ${TOOL_TIMEOUT_MS / 1000}`,
      ].join('\n');
      apply = () => {
        const before = fs.existsSync(file) ? stripTomlServer(fs.readFileSync(file, 'utf8')) : '';
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, `${before ? `${before}\n\n` : ''}${snippet}\n`, 'utf8');
        return true;
      };
      notes.push('Codex reads .codex/config.toml only in a trusted project; otherwise put the same block in ~/.codex/config.toml.');
      break;
    }
    case 'cursor': {
      file = path.join(root, '.cursor', 'mcp.json');
      const entry = { type: 'stdio', command: nodePath, args: [server] };
      snippet = JSON.stringify({ mcpServers: { [NAME]: entry } }, null, 2);
      apply = () => {
        const r = readJson(file);
        if (!r.ok) return false;
        r.data.mcpServers = { ...(r.data.mcpServers ?? {}), [NAME]: entry };
        writeJson(file, r.data);
        return true;
      };
      notes.push('Cursor documents no per-tool timeout; a long video job may outlast its wait. The CLI has no such limit.');
      break;
    }
    case 'gemini': {
      file = path.join(root, '.gemini', 'settings.json');
      const entry = { command: nodePath, args: [server], cwd: root, timeout: TOOL_TIMEOUT_MS };
      snippet = JSON.stringify({ mcpServers: { [NAME]: entry } }, null, 2);
      apply = () => {
        const r = readJson(file);
        if (!r.ok) return false;
        r.data.mcpServers = { ...(r.data.mcpServers ?? {}), [NAME]: entry };
        writeJson(file, r.data);
        return true;
      };
      notes.push('Gemini CLI strips variables named like *KEY* and *TOKEN* from a server\'s environment, so keep keys in the kit\'s .env, which the server reads itself.');
      break;
    }
    case 'vscode': {
      file = path.join(root, '.vscode', 'mcp.json');
      const entry = { type: 'stdio', command: nodePath, args: [server], cwd: root };
      snippet = JSON.stringify({ servers: { [NAME]: entry } }, null, 2);
      apply = () => {
        const r = readJson(file);
        if (!r.ok) return false;
        r.data.servers = { ...(r.data.servers ?? {}), [NAME]: entry };
        writeJson(file, r.data);
        return true;
      };
      break;
    }
    case 'opencode': {
      file = path.join(root, 'opencode.json');
      const entry = { type: 'local', command: [nodePath, server], cwd: root, enabled: true };
      snippet = JSON.stringify({ $schema: 'https://opencode.ai/config.json', mcp: { [NAME]: entry } }, null, 2);
      apply = () => {
        if (fs.existsSync(path.join(root, 'opencode.jsonc'))) return false;
        const r = readJson(file);
        if (!r.ok) return false;
        if (!r.data.$schema) r.data = { $schema: 'https://opencode.ai/config.json', ...r.data };
        r.data.mcp = { ...(r.data.mcp ?? {}), [NAME]: entry };
        writeJson(file, r.data);
        return true;
      };
      notes.push('OpenCode\'s timeout option covers fetching the tool list only, not a running tool.');
      break;
    }
    default:
      throw new Error(`unknown agent ${agent}`);
  }

  if (!fs.existsSync(path.join(CONNECTORS_DIR, 'node_modules', '@modelcontextprotocol', 'sdk'))) {
    notes.push('The MCP SDK is not installed yet: run npm install inside connectors/ before starting the agent.');
  }
  if (print) return { agent, file, written: false, snippet, notes };
  const written = apply();
  if (!written) notes.push(`${path.basename(file)} exists but could not be read as plain JSON (comments?), so it was left alone. Add the snippet above by hand.`);
  return { agent, file, written, snippet, notes };
}
