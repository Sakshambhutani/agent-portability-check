import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const KNOWN_COMMANDS = new Set([
  'node','npm','npx','pnpm','yarn','bun','deno',
  'python','python3','pip','pip3','uv','poetry','pytest','ruff',
  'git','gh','jq','curl','wget','make',
  'docker','kubectl','helm','terraform',
  'aws','gcloud','az','go','cargo','rustc','eslint','tsc','playwright',
  'bash','sh','zsh',
]);

const COMMON_ENV = new Set([
  'HOME','PATH','PWD','OLDPWD','SHELL','USER','LOGNAME','TMP','TEMP','TMPDIR',
  'CI','TERM','LANG','LC_ALL','NODE_ENV',
]);

export function defaultCommandCheck(command) {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  try {
    const result = spawnSync(finder, [command], {
      encoding: 'utf8',
      stdio: ['ignore','pipe','ignore'],
      timeout: 1200,
    });
    return result.status === 0 && Boolean(result.stdout?.trim());
  } catch {
    return false;
  }
}

function commandFromLine(line) {
  let cleaned = line.trim().replace(/^[$>]\s*/, '').replace(/^sudo\s+/, '');
  if (!cleaned || cleaned.startsWith('#')) return [];
  const commands = [];
  for (const segment of cleaned.split(/(?:&&|\|\||;|\|)/)) {
    let part = segment.trim();
    if (!part) continue;
    part = part.replace(/^(?:[A-Z_][A-Z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)+/, '');
    const token = part.match(/^([A-Za-z0-9._-]+)/)?.[1];
    if (token && KNOWN_COMMANDS.has(token)) commands.push(token);
  }
  return commands;
}

export function extractCommands(content) {
  const commands = new Set();
  for (const fence of content.matchAll(/```(?:bash|sh|shell|zsh)\s*\n([\s\S]*?)```/gi)) {
    for (const line of fence[1].split('\n')) {
      for (const command of commandFromLine(line)) commands.add(command);
    }
  }
  for (const inline of content.matchAll(/`([^`\n]+)`/g)) {
    const value = inline[1].trim();
    if (value.length > 180) continue;
    for (const command of commandFromLine(value)) commands.add(command);
  }
  return [...commands].sort();
}

export function extractEnvVars(content) {
  const required = new Set();
  const optional = new Set();
  for (const match of content.matchAll(/\$\{([A-Z][A-Z0-9_]*)(?::-([^}]*))?\}/g)) {
    if (COMMON_ENV.has(match[1])) continue;
    if (match[2] !== undefined) optional.add(match[1]);
    else required.add(match[1]);
  }
  for (const match of content.matchAll(/\$\{env:([A-Z][A-Z0-9_]*)\}/g)) {
    if (!COMMON_ENV.has(match[1])) required.add(match[1]);
  }
  for (const regex of [
    /\bprocess\.env\.([A-Z][A-Z0-9_]*)\b/g,
    /\bos\.getenv\(\s*["']([A-Z][A-Z0-9_]*)["']\s*\)/g,
    /\bgetenv\(\s*["']([A-Z][A-Z0-9_]*)["']\s*\)/g,
  ]) {
    for (const match of content.matchAll(regex)) {
      if (!COMMON_ENV.has(match[1])) required.add(match[1]);
    }
  }
  for (const match of content.matchAll(/(^|[^$\{])\$([A-Z][A-Z0-9_]*)\b/gm)) {
    if (!COMMON_ENV.has(match[2])) required.add(match[2]);
  }
  for (const name of optional) required.delete(name);
  return { required: [...required].sort(), optional: [...optional].sort() };
}

export function extractMcpServers(content) {
  const servers = new Set();
  for (const match of content.matchAll(/\bmcp__([A-Za-z0-9_-]+)__/g)) servers.add(match[1]);
  for (const match of content.matchAll(/\bMcp\(\s*([A-Za-z0-9_-]+)\s*:/gi)) servers.add(match[1]);
  return [...servers].sort();
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function collectMcpServersFromJson(value, out = new Set()) {
  if (!value || typeof value !== 'object') return out;
  if (value.mcpServers && typeof value.mcpServers === 'object') {
    for (const name of Object.keys(value.mcpServers)) out.add(name);
  }
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === 'object') collectMcpServersFromJson(nested, out);
  }
  return out;
}

function parseCodexMcpServers(file) {
  const out = new Set();
  let content = '';
  try { content = fs.readFileSync(file, 'utf8'); } catch { return out; }
  for (const match of content.matchAll(/^\s*\[mcp_servers\.(?:"([^"]+)"|([A-Za-z0-9_-]+))\]\s*$/gm)) {
    out.add(match[1] || match[2]);
  }
  return out;
}

export function discoverMcpServers({ cwd, home }) {
  const codex = new Set();
  const claude = new Set();
  const cursor = new Set();
  for (const file of [path.join(home,'.codex','config.toml'), path.join(cwd,'.codex','config.toml')]) {
    for (const name of parseCodexMcpServers(file)) codex.add(name);
  }
  for (const file of [path.join(home,'.claude.json'), path.join(cwd,'.mcp.json')]) {
    const value = readJson(file);
    for (const name of collectMcpServersFromJson(value)) claude.add(name);
  }
  for (const file of [path.join(home,'.cursor','mcp.json'), path.join(cwd,'.cursor','mcp.json')]) {
    const value = readJson(file);
    for (const name of collectMcpServersFromJson(value)) cursor.add(name);
  }
  return { codex, claude, cursor, cursorCloud: new Set() };
}

export function normalizeMcpServers(input, context) {
  if (!input) return discoverMcpServers(context);
  const out = {};
  for (const key of ['codex','claude','cursor','cursorCloud']) out[key] = new Set(input[key] || []);
  return out;
}

export function extractScriptInterpreters(resolvedReferences) {
  const found = new Set();
  for (const ref of resolvedReferences || []) {
    if (!ref.relative.startsWith('scripts/')) continue;
    let firstLine = '';
    try { firstLine = fs.readFileSync(ref.absolute, 'utf8').split('\n',1)[0]; } catch { continue; }
    const envShebang = firstLine.match(/^#!\/usr\/bin\/env\s+([A-Za-z0-9._-]+)/);
    const directShebang = firstLine.match(/^#!.*\/([A-Za-z0-9._-]+)(?:\s|$)/);
    const interpreter = envShebang?.[1] || directShebang?.[1];
    if (interpreter && KNOWN_COMMANDS.has(interpreter)) found.add(interpreter);
  }
  return [...found];
}

export function evaluateDependencies({ content, resolvedReferences, target, runtime, env, commandCheck, mcpServers }) {
  const commands = new Set([...extractCommands(content), ...extractScriptInterpreters(resolvedReferences)]);
  const envVars = extractEnvVars(content);
  const mcpRefs = extractMcpServers(content);
  const blockers = [];

  const commandResults = [...commands].sort().map(name => {
    if (runtime === 'cloud') {
      blockers.push(`Cursor Cloud must provide CLI "${name}"; a local install does not prove cloud availability.`);
      return { name, available: null, needsSetup: true, runtime: 'cloud' };
    }
    const available = Boolean(commandCheck(name));
    if (!available) blockers.push(`Required CLI "${name}" was not found on this machine.`);
    return { name, available, needsSetup: !available, runtime: 'local' };
  });

  const environment = [
    ...envVars.required.map(name => {
      if (runtime === 'cloud') {
        blockers.push(`Required environment variable "${name}" must be configured as a cloud secret for Cursor Cloud.`);
        return { name, required: true, available: null, needsCloudSecret: true };
      }
      const available = Boolean(env[name]);
      if (!available) blockers.push(`Required environment variable "${name}" is not set.`);
      return { name, required: true, available, needsCloudSecret: false };
    }),
    ...envVars.optional.map(name => ({ name, required: false, available: Boolean(env[name]), needsCloudSecret: false })),
  ];

  const mcpKey = target === 'cursor' && runtime === 'cloud' ? 'cursorCloud' : target;
  const configured = mcpServers[mcpKey] || new Set();
  const mcpResults = mcpRefs.map(name => {
    const available = configured.has(name);
    if (!available) {
      if (target === 'cursor' && runtime === 'cloud') blockers.push(`MCP server "${name}" is referenced but is not known to be configured for Cursor Cloud.`);
      else blockers.push(`MCP server "${name}" is referenced but not configured for ${target}.`);
    }
    return { name, available, runtime };
  });

  return { blockers, commands: commandResults, environment, mcpServers: mcpResults };
}
