import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { HARNESS_ORDER, harnessDefinition } from './harnesses.js';

const KNOWN_COMMANDS = new Set([
  'node','npm','npx','pnpm','yarn','bun','deno',
  'python','python3','pip','pip3','uv','poetry','pytest','ruff',
  'git','gh','jq','curl','wget','make',
  'docker','kubectl','helm','terraform',
  'aws','gcloud','az','go','cargo','rustc','eslint','tsc','playwright',
  'vercel','supabase','agent-browser','wrangler','netlify','firebase','railway','flyctl',
  'bash','sh','zsh',
  'gemini','copilot','opencode',
]);

const COMMON_ENV = new Set([
  'HOME','PATH','PWD','OLDPWD','SHELL','USER','LOGNAME','TMP','TEMP','TMPDIR',
  'CI','TERM','LANG','LC_ALL','NODE_ENV',
  'CLAUDE_PLUGIN_ROOT','CODEX_PLUGIN_ROOT','CLAUDE_PROJECT_DIR',
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

function nearbyContext(content, index, radius = 220) {
  const start = Math.max(0, Number(index || 0) - radius);
  return content.slice(start, Number(index || 0));
}

function looksOptionalContext(text) {
  return /\b(?:example|examples|for example|e\.g\.|optional|optionally|alternative|alternatively|such as|if you (?:use|have|want|need)|one of|either)\b/i.test(text);
}

function looksRequiredContext(text) {
  return /\b(?:required|requires|requirement|prerequisite|must|needs? to|depend(?:s|ency)? on|install before|make sure .* installed)\b/i.test(text);
}

export function classifyCommands(content) {
  const required = new Set();
  const optional = new Set();

  const add = (name, index) => {
    const context = nearbyContext(content, index);
    if (looksRequiredContext(context)) required.add(name);
    else if (looksOptionalContext(context)) optional.add(name);
    else required.add(name);
  };

  for (const fence of content.matchAll(/```(?:bash|sh|shell|zsh)\s*\n([\s\S]*?)```/gi)) {
    for (const line of fence[1].split('\n')) {
      for (const command of commandFromLine(line)) add(command, fence.index);
    }
  }
  for (const inline of content.matchAll(/`([^`\n]+)`/g)) {
    const value = inline[1].trim();
    if (value.length > 180) continue;
    for (const command of commandFromLine(value)) add(command, inline.index);
  }

  for (const name of required) optional.delete(name);
  return { required: [...required].sort(), optional: [...optional].sort() };
}

export function extractCommands(content) {
  const classified = classifyCommands(content);
  return [...new Set([...classified.required, ...classified.optional])].sort();
}

export function extractEnvVars(content) {
  const required = new Set();
  const optional = new Set();

  const add = (name, index, explicitOptional = false) => {
    if (COMMON_ENV.has(name)) return;
    const context = nearbyContext(content, index);
    if (explicitOptional || (!looksRequiredContext(context) && looksOptionalContext(context))) optional.add(name);
    else required.add(name);
  };

  for (const match of content.matchAll(/\$\{([A-Z][A-Z0-9_]*)(?::-([^}]*))?\}/g)) {
    add(match[1], match.index, match[2] !== undefined);
  }
  for (const match of content.matchAll(/\$\{env:([A-Z][A-Z0-9_]*)\}/g)) {
    add(match[1], match.index);
  }
  for (const regex of [
    /\bprocess\.env\.([A-Z][A-Z0-9_]*)\b/g,
    /\bos\.getenv\(\s*["']([A-Z][A-Z0-9_]*)["']\s*\)/g,
    /\bgetenv\(\s*["']([A-Z][A-Z0-9_]*)["']\s*\)/g,
  ]) {
    for (const match of content.matchAll(regex)) add(match[1], match.index);
  }
  for (const match of content.matchAll(/(^|[^$\{])\$([A-Z][A-Z0-9_]*)\b/gm)) {
    add(match[2], match.index);
  }

  for (const name of required) optional.delete(name);
  return { required: [...required].sort(), optional: [...optional].sort() };
}

export function extractMcpServers(content) {
  const servers = new Set();
  for (const match of content.matchAll(/\bmcp__([A-Za-z0-9_-]+)__/g)) servers.add(match[1]);
  for (const match of content.matchAll(/\bMcp\(\s*([A-Za-z0-9_-]+)\s*:/gi)) servers.add(match[1]);
  return [...servers].sort();
}

function readJson(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    try { return JSON.parse(raw); } catch {}
    const withoutComments = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(withoutComments);
  } catch {
    return null;
  }
}

function collectMcpServersFromJson(value, out = new Set()) {
  if (!value || typeof value !== 'object') return out;
  if (value.mcpServers && typeof value.mcpServers === 'object') {
    for (const name of Object.keys(value.mcpServers)) out.add(name);
  }
  if (value.mcp?.servers && typeof value.mcp.servers === 'object') {
    for (const name of Object.keys(value.mcp.servers)) out.add(name);
  }
  if (value.mcp && typeof value.mcp === 'object' && !Array.isArray(value.mcp)) {
    for (const [name, config] of Object.entries(value.mcp)) {
      if (name === 'servers' || !config || typeof config !== 'object' || Array.isArray(config)) continue;
      if ('command' in config || 'url' in config || 'type' in config) out.add(name);
    }
  }
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === 'object') collectMcpServersFromJson(nested, out);
  }
  return out;
}

function collectBareMcpServers(value, out = new Set()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [name, config] of Object.entries(value)) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) continue;
    if ('command' in config || 'url' in config || 'type' in config) out.add(name);
  }
  return out;
}

function addJsonServers(out, files, { bare = false } = {}) {
  for (const file of files) {
    const value = readJson(file);
    for (const name of collectMcpServersFromJson(value)) out.add(name);
    if (bare) for (const name of collectBareMcpServers(value)) out.add(name);
  }
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
  const out = Object.fromEntries(HARNESS_ORDER.map(key => [key, new Set()]));
  out.cursorCloud = new Set();

  for (const file of [path.join(home,'.codex','config.toml'), path.join(cwd,'.codex','config.toml')]) {
    for (const name of parseCodexMcpServers(file)) out.codex.add(name);
  }

  addJsonServers(out.claude, [path.join(home,'.claude.json'), path.join(cwd,'.mcp.json')]);
  addJsonServers(out.cursor, [path.join(home,'.cursor','mcp.json'), path.join(cwd,'.cursor','mcp.json')]);
  addJsonServers(out.gemini, [path.join(home,'.gemini','settings.json'), path.join(cwd,'.gemini','settings.json')]);

  addJsonServers(out.copilot, [
    path.join(home,'.copilot','mcp-config.json'),
    path.join(cwd,'.mcp.json'),
    path.join(cwd,'.github','mcp.json'),
  ], { bare: true });

  addJsonServers(out.opencode, [
    path.join(home,'.config','opencode','opencode.json'),
    path.join(home,'.config','opencode','opencode.jsonc'),
    path.join(cwd,'opencode.json'),
    path.join(cwd,'opencode.jsonc'),
    path.join(cwd,'.opencode','opencode.json'),
    path.join(cwd,'.opencode','opencode.jsonc'),
  ]);

  const rooFiles = [path.join(cwd,'.roo','mcp.json')];
  if (process.platform === 'darwin') {
    rooFiles.push(
      path.join(home,'Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json'),
      path.join(home,'Library/Application Support/Code - Insiders/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json'),
      path.join(home,'Library/Application Support/Cursor/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json'),
    );
  } else if (process.platform === 'win32') {
    const appdata = process.env.APPDATA || '';
    if (appdata) {
      rooFiles.push(
        path.join(appdata,'Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json'),
        path.join(appdata,'Code - Insiders/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json'),
        path.join(appdata,'Cursor/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json'),
      );
    }
  } else {
    rooFiles.push(
      path.join(home,'.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json'),
      path.join(home,'.config/Code - Insiders/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json'),
      path.join(home,'.config/Cursor/User/globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json'),
    );
  }
  addJsonServers(out.roo, rooFiles);

  return out;
}

export function normalizeMcpServers(input, context) {
  if (!input) return discoverMcpServers(context);
  const out = {};
  for (const key of [...HARNESS_ORDER, 'cursorCloud']) out[key] = new Set(input[key] || []);
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
  const classifiedCommands = classifyCommands(content);
  const scriptInterpreters = extractScriptInterpreters(resolvedReferences);
  const requiredCommands = new Set([...classifiedCommands.required, ...scriptInterpreters]);
  const optionalCommands = new Set(classifiedCommands.optional.filter(name => !requiredCommands.has(name)));
  const envVars = extractEnvVars(content);
  const mcpRefs = extractMcpServers(content);
  const blockers = [];

  const commandResults = [
    ...[...requiredCommands].sort().map(name => {
      if (runtime === 'cloud') {
        const label = harnessDefinition(target)?.cloudLabel || `${harnessDefinition(target)?.label || target} Cloud`;
        blockers.push(`${label} must provide CLI "${name}"; a local install does not prove cloud availability.`);
        return { name, required: true, available: null, needsSetup: true, runtime: 'cloud' };
      }
      const available = Boolean(commandCheck(name));
      if (!available) blockers.push(`Required CLI "${name}" was not found on this machine.`);
      return { name, required: true, available, needsSetup: !available, runtime: 'local' };
    }),
    ...[...optionalCommands].sort().map(name => {
      const available = runtime === 'cloud' ? null : Boolean(commandCheck(name));
      return { name, required: false, available, needsSetup: false, runtime };
    }),
  ];

  const environment = [
    ...envVars.required.map(name => {
      if (runtime === 'cloud') {
        const label = harnessDefinition(target)?.cloudLabel || `${harnessDefinition(target)?.label || target} Cloud`;
        blockers.push(`Required environment variable "${name}" must be configured as a cloud secret for ${label}.`);
        return { name, required: true, available: null, needsCloudSecret: true };
      }
      const available = Boolean(env[name]);
      if (!available) blockers.push(`Required environment variable "${name}" is not set.`);
      return { name, required: true, available, needsCloudSecret: false };
    }),
    ...envVars.optional.map(name => ({
      name,
      required: false,
      available: runtime === 'cloud' ? null : Boolean(env[name]),
      needsCloudSecret: false,
    })),
  ];

  const mcpKey = target === 'cursor' && runtime === 'cloud' ? 'cursorCloud' : target;
  const configured = mcpServers[mcpKey] || new Set();
  const mcpResults = mcpRefs.map(name => {
    const available = configured.has(name);
    if (!available) {
      if (runtime === 'cloud') {
        const label = harnessDefinition(target)?.cloudLabel || `${harnessDefinition(target)?.label || target} Cloud`;
        blockers.push(`MCP server "${name}" is referenced but is not known to be configured for ${label}.`);
      } else {
        blockers.push(`MCP server "${name}" is referenced but not configured for ${harnessDefinition(target)?.label || target}.`);
      }
    }
    return { name, available, runtime };
  });

  return {
    blockers,
    commands: commandResults,
    environment,
    mcpServers: mcpResults,
    evidence: {
      commandRequirementClassification: true,
      authenticationTested: false,
      executionTested: false,
    },
  };
}
