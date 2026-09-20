import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  HARNESS_DEFINITIONS,
  HARNESS_ORDER,
  configPathSpecs,
  instructionSpecs,
  skillRootSpecs,
  visibleOwnersFor,
} from './harnesses.js';


function exists(file) {
  try { return fs.existsSync(file); } catch { return false; }
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function hashText(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);
}

function expandPath(input, home) {
  return String(input || '')
    .replace(/^~(?=\/|$)/, home)
    .replace(/%LOCALAPPDATA%/gi, process.env.LOCALAPPDATA || '')
    .replace(/%PROGRAMFILES%/gi, process.env.PROGRAMFILES || '');
}

function commandExists(command) {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  try {
    const result = spawnSync(finder, [command], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1500,
    });
    return result.status === 0 && Boolean(result.stdout?.trim());
  } catch {
    return false;
  }
}

function extensionRoots(home) {
  const roots = [
    { editor: 'VS Code', path: path.join(home, '.vscode/extensions') },
    { editor: 'VS Code Insiders', path: path.join(home, '.vscode-insiders/extensions') },
    { editor: 'Cursor', path: path.join(home, '.cursor/extensions') },
  ];
  return roots;
}

function extensionMatches(root, ids) {
  if (!exists(root.path)) return [];
  let names = [];
  try { names = fs.readdirSync(root.path); } catch { return []; }
  const matches = [];
  for (const id of ids || []) {
    for (const name of names) {
      if (name === id || name.startsWith(id + '-')) {
        matches.push({ type: 'ide-extension', detail: `${root.editor}: ${name}` });
      }
    }
  }
  return matches;
}

export function detectInstalledHarnesses({ home = os.homedir(), platform = process.platform, commandCheck = commandExists } = {}) {
  home = path.resolve(home);
  const detected = [];

  for (const key of HARNESS_ORDER) {
    const meta = HARNESS_DEFINITIONS[key];
    const evidence = [];

    for (const command of meta.commands || []) {
      if (commandCheck(command)) evidence.push({ type: 'command', detail: command });
    }

    for (const root of extensionRoots(home)) {
      evidence.push(...extensionMatches(root, meta.vscodeExtensions || []));
    }

    if (platform === 'darwin') {
      for (const app of meta.macApps || []) {
        const expanded = expandPath(app, home);
        if (exists(expanded)) evidence.push({ type: 'app', detail: expanded });
      }
    }

    if (platform === 'win32') {
      for (const app of meta.windowsApps || []) {
        const expanded = expandPath(app, home);
        if (expanded && exists(expanded)) evidence.push({ type: 'app', detail: expanded });
      }
    }

    if (evidence.length) detected.push({ key, label: meta.label, evidence });
  }

  return detected;
}

function walkSkillFiles(root) {
  if (!exists(root)) return [];

  const out = [];
  const stack = [root];
  const visitedDirs = new Set();

  while (stack.length) {
    const dir = stack.pop();

    let realDir;
    try { realDir = fs.realpathSync(dir); } catch { continue; }
    if (visitedDirs.has(realDir)) continue;
    visitedDirs.add(realDir);

    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }

      if (entry.isSymbolicLink()) {
        try {
          const stat = fs.statSync(full);
          if (stat.isDirectory()) stack.push(full);
          else if (stat.isFile() && entry.name === 'SKILL.md') out.push(full);
        } catch {
          // Broken symlink: ignore it rather than failing the whole scan.
        }
        continue;
      }

      if (entry.isFile() && entry.name === 'SKILL.md') out.push(full);
    }
  }

  return out;
}

function parseSkillFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return { hasFrontmatter: false, name: '', description: '' };

  const yaml = match[1];
  const nameMatch = yaml.match(/^name:\s*["']?([^\n"']+)["']?\s*$/m);
  const descriptionMatch = yaml.match(/^description:\s*(.+)$/m);

  return {
    hasFrontmatter: true,
    name: nameMatch?.[1]?.trim() || '',
    description: descriptionMatch?.[1]?.trim()?.replace(/^["']|["']$/g, '') || '',
  };
}

function cleanReferenceTarget(value) {
  let clean = String(value || '').trim().split(/\s+/)[0];
  if (!clean || clean.startsWith('#')) return null;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/i.test(clean)) return null;
  if (clean.includes('*') || clean.includes('<') || clean.includes('>')) return null;
  clean = clean.split('#')[0].split('?')[0].replace(/[),.;:]+$/, '');
  if (!clean) return null;
  try { clean = decodeURIComponent(clean); } catch {}
  return clean;
}

function referencedLocalPaths(content) {
  const found = new Set();

  for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
    const value = cleanReferenceTarget(match[1]);
    if (value) found.add(value);
  }

  for (const match of content.matchAll(/\b(?:scripts|references|assets)\/[A-Za-z0-9._/-]+(?:#[A-Za-z0-9._:-]+)?/g)) {
    const value = cleanReferenceTarget(match[0]);
    if (value) found.add(value);
  }

  for (const match of content.matchAll(/\$\{?(?:CLAUDE_PLUGIN_ROOT|CODEX_PLUGIN_ROOT)\}?\/[A-Za-z0-9._/-]+/g)) {
    found.add(match[0]);
  }

  return [...found];
}

function resolveSkillReference(ref, { skillDir, pluginRoot = null }) {
  const pluginRootMatch = ref.match(/^\$\{?(?:CLAUDE_PLUGIN_ROOT|CODEX_PLUGIN_ROOT)\}?\/(.+)$/);
  if (pluginRootMatch) {
    if (!pluginRoot) return { resolved: null, external: true, unresolvedPluginRoot: true };
    return { resolved: path.resolve(pluginRoot, pluginRootMatch[1]), external: true, unresolvedPluginRoot: false };
  }

  const resolved = path.resolve(skillDir, ref);
  const relativeToSkill = path.relative(skillDir, resolved);
  const insideSkill = !relativeToSkill.startsWith('..') && !path.isAbsolute(relativeToSkill);
  if (insideSkill) return { resolved, external: false, unresolvedPluginRoot: false };

  if (pluginRoot) {
    const relativeToPlugin = path.relative(pluginRoot, resolved);
    const insidePlugin = !relativeToPlugin.startsWith('..') && !path.isAbsolute(relativeToPlugin);
    if (insidePlugin) return { resolved, external: true, unresolvedPluginRoot: false };
  }

  return { resolved: null, external: true, unresolvedPluginRoot: false };
}

function inspectSkillPackage(file, content, { pluginRoot = null } = {}) {
  const skillDir = path.dirname(file);
  const folderName = path.basename(skillDir);
  const frontmatter = parseSkillFrontmatter(content);
  const missingReferences = [];
  const externalReferences = [];

  for (const ref of referencedLocalPaths(content)) {
    const resolution = resolveSkillReference(ref, { skillDir, pluginRoot });
    if (!resolution.resolved) {
      if (resolution.unresolvedPluginRoot) externalReferences.push(ref);
      continue;
    }
    if (!exists(resolution.resolved)) {
      missingReferences.push(ref);
      continue;
    }
    if (resolution.external) externalReferences.push(ref);
  }

  const validName = Boolean(frontmatter.name && /^[a-z0-9-]+$/.test(frontmatter.name));
  const folderMatchesName = !frontmatter.name || frontmatter.name === folderName;

  return {
    frontmatterName: frontmatter.name,
    hasFrontmatter: frontmatter.hasFrontmatter,
    hasDescription: Boolean(frontmatter.description),
    folderName,
    folderMatchesName,
    missingReferences,
    externalReferences,
    packageValid: Boolean(
      frontmatter.hasFrontmatter &&
      validName &&
      frontmatter.description &&
      folderMatchesName &&
      missingReferences.length === 0
    ),
  };
}

function skillName(file, content = null) {
  const body = content ?? readText(file) ?? '';
  const frontmatter = parseSkillFrontmatter(body);
  return frontmatter.name || path.basename(path.dirname(file));
}

function displayPath(file, cwd, home) {
  if (file === cwd || file.startsWith(cwd + path.sep)) return './' + path.relative(cwd, file).replaceAll(path.sep, '/');
  if (file === home || file.startsWith(home + path.sep)) return '~/' + path.relative(home, file).replaceAll(path.sep, '/');
  return file;
}

function normalizePluginRecords(value) {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object');
  return [value];
}

function claudeInstalledPluginRoots(home, cwd, scope) {
  const roots = [];
  const seen = new Set();
  const registries = [
    path.join(home, '.claude', 'plugins', 'installed_plugins.json'),
    path.join(home, '.config', 'claude', 'plugins', 'installed_plugins.json'),
  ];

  for (const registry of registries) {
    const value = readJson(registry);
    const plugins = value?.plugins;
    if (!plugins || typeof plugins !== 'object') continue;

    for (const [pluginId, rawRecords] of Object.entries(plugins)) {
      for (const record of normalizePluginRecords(rawRecords)) {
        if (!record.installPath) continue;
        const root = path.resolve(expandPath(record.installPath, home));
        if (!exists(root)) continue;

        const declaredScope = String(record.scope || 'user').toLowerCase();
        const projectPath = record.projectPath ? path.resolve(expandPath(record.projectPath, home)) : null;
        const projectScoped = declaredScope === 'project' || declaredScope === 'local';
        const appliesToProject = Boolean(
          projectPath &&
          (cwd === projectPath || cwd.startsWith(projectPath + path.sep))
        );
        const resolvedScope = projectScoped ? 'project' : 'global';
        if (resolvedScope !== scope) continue;
        if (projectScoped && projectPath && !appliesToProject) continue;

        const skillsRoot = path.join(root, 'skills');
        if (!exists(skillsRoot)) continue;
        const id = 'claude:' + pluginId + ':' + root;
        if (seen.has(id)) continue;
        seen.add(id);
        roots.push({
          owner: 'claude',
          root: skillsRoot,
          pluginRoot: root,
          pluginHost: 'claude',
          pluginId,
          sourceType: 'plugin',
        });
      }
    }
  }
  return roots;
}

function parseCodexEnabledPluginIds(file) {
  const content = readText(file);
  if (!content) return [];
  const sections = [...content.matchAll(/^\s*\[plugins\.(?:"([^"]+)"|([A-Za-z0-9_.@/-]+))\]\s*$/gm)];
  const ids = [];
  for (let i = 0; i < sections.length; i++) {
    const id = sections[i][1] || sections[i][2];
    const start = sections[i].index + sections[i][0].length;
    const end = i + 1 < sections.length ? sections[i + 1].index : content.length;
    const body = content.slice(start, end);
    if (/^\s*enabled\s*=\s*false\s*$/mi.test(body)) continue;
    ids.push(id);
  }
  return ids;
}

function newestDirectory(root) {
  if (!exists(root)) return null;
  let dirs = [];
  try {
    dirs = fs.readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => {
        const full = path.join(root, entry.name);
        let mtime = 0;
        try { mtime = fs.statSync(full).mtimeMs; } catch {}
        return { full, mtime };
      });
  } catch { return null; }
  dirs.sort((a, b) => b.mtime - a.mtime || b.full.localeCompare(a.full));
  return dirs[0]?.full || null;
}

function codexInstalledPluginRoots(home, scope) {
  if (scope !== 'global') return [];
  const roots = [];
  const seen = new Set();
  const ids = new Set(parseCodexEnabledPluginIds(path.join(home, '.codex', 'config.toml')));

  for (const id of ids) {
    const split = id.lastIndexOf('@');
    if (split <= 0 || split === id.length - 1) continue;
    const plugin = id.slice(0, split);
    const marketplace = id.slice(split + 1);
    const root = newestDirectory(path.join(home, '.codex', 'plugins', 'cache', marketplace, plugin));
    if (!root) continue;
    const skillsRoot = path.join(root, 'skills');
    if (!exists(skillsRoot)) continue;
    const key = 'codex:' + id + ':' + root;
    if (seen.has(key)) continue;
    seen.add(key);
    roots.push({
      owner: 'codex',
      root: skillsRoot,
      pluginRoot: root,
      pluginHost: 'codex',
      pluginId: id,
      sourceType: 'plugin',
    });
  }
  return roots;
}

function installedPluginSkillRoots(home, cwd, scope) {
  return [
    ...claudeInstalledPluginRoots(home, cwd, scope),
    ...codexInstalledPluginRoots(home, scope),
  ];
}

function discoverDynamicRooSkillRoots(base) {
  const specs = [];
  for (const relBase of ['.roo', '.agents']) {
    const dir = path.join(base, relBase);
    if (!exists(dir)) continue;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('skills-')) continue;
      const mode = entry.name.slice('skills-'.length);
      if (!mode) continue;
      specs.push({ owner: 'roo', rel: path.join(relBase, entry.name), mode });
    }
  }
  return specs;
}

function gatherSkills(base, scope, cwd, home) {
  const skills = [];
  const specs = [
    ...skillRootSpecs(scope).map(spec => ({ ...spec, root: path.join(base, spec.rel) })),
    ...discoverDynamicRooSkillRoots(base).map(spec => ({ ...spec, root: path.join(base, spec.rel) })),
    ...installedPluginSkillRoots(home, cwd, scope),
  ];
  const seenPaths = new Set();

  for (const spec of specs) {
    const root = spec.root;
    for (const file of walkSkillFiles(root)) {
      let realFile = file;
      try { realFile = fs.realpathSync(file); } catch {}
      const pathKey = spec.sourceType === 'plugin'
        ? String(spec.pluginId || '') + ':' + realFile
        : realFile;
      if (seenPaths.has(pathKey)) continue;
      seenPaths.add(pathKey);

      const content = readText(file) || '';
      const inspection = inspectSkillPackage(file, content, { pluginRoot: spec.pluginRoot || null });
      const relativeToRoot = path.relative(root, file).split(path.sep);
      const harnessManaged = relativeToRoot.includes('.system');
      skills.push({
        name: skillName(file, content),
        owner: spec.owner,
        scope,
        path: displayPath(file, cwd, home),
        hash: hashText(content),
        bytes: Buffer.byteLength(content),
        harnessManaged,
        mode: spec.mode || null,
        sourceType: spec.sourceType || 'skill-root',
        pluginHost: spec.pluginHost || null,
        pluginId: spec.pluginId || null,
        pluginRoot: spec.pluginRoot ? displayPath(spec.pluginRoot, cwd, home) : null,
        ...inspection,
      });
    }
  }
  return skills;
}

function gatherInstructions(base, scope, specs, cwd, home) {
  const out = [];
  for (const spec of specs) {
    const file = path.join(base, spec.rel);
    if (!exists(file)) continue;
    const content = readText(file) || '';
    out.push({
      owner: spec.owner,
      scope,
      path: displayPath(file, cwd, home),
      hash: hashText(content),
      bytes: Buffer.byteLength(content),
    });
  }
  return out;
}

function walkRuleFiles(root, owner, scope, cwd, home, kind) {
  if (!exists(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name.startsWith('.') || /\.(?:bak|cache|log|tmp|swp)$/i.test(entry.name)) continue;
      const content = readText(full) || '';
      out.push({
        owner,
        scope,
        kind,
        path: displayPath(full, cwd, home),
        hash: hashText(content),
        bytes: Buffer.byteLength(content),
      });
    }
  }
  return out;
}

function gatherRules(cwd, home, { includeProject = true } = {}) {
  const rules = [
    ...walkRuleFiles(path.join(home, '.cursor/rules'), 'cursor', 'global', cwd, home, 'cursor-rule'),
    ...walkRuleFiles(path.join(home, '.copilot/instructions'), 'copilot', 'global', cwd, home, 'copilot-instruction'),
    ...walkRuleFiles(path.join(home, '.roo/rules'), 'roo', 'global', cwd, home, 'roo-rule'),
    ...(includeProject ? [
      ...walkRuleFiles(path.join(cwd, '.cursor/rules'), 'cursor', 'project', cwd, home, 'cursor-rule'),
      ...walkRuleFiles(path.join(cwd, '.github/instructions'), 'copilot', 'project', cwd, home, 'copilot-instruction'),
      ...walkRuleFiles(path.join(cwd, '.roo/rules'), 'roo', 'project', cwd, home, 'roo-rule'),
    ] : []),
  ];

  const rooBases = includeProject ? [[home, 'global'], [cwd, 'project']] : [[home, 'global']];
  for (const [base, scope] of rooBases) {
    const rooDir = path.join(base, '.roo');
    if (!exists(rooDir)) continue;
    let entries = [];
    try { entries = fs.readdirSync(rooDir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('rules-')) continue;
      rules.push(...walkRuleFiles(path.join(rooDir, entry.name), 'roo', scope, cwd, home, 'roo-mode-rule'));
    }
  }
  return rules;
}

function gatherConfigFootprints(cwd, home, { includeProject = true } = {}) {
  const footprints = [];
  const seen = new Set();
  if (includeProject) {
    for (const spec of configPathSpecs('project')) {
      const file = path.join(cwd, spec.rel);
      const id = `project:${spec.key}:${file}`;
      if (!seen.has(id) && exists(file)) {
        seen.add(id);
        footprints.push({ key: spec.key, label: spec.label, scope: 'project', path: displayPath(file, cwd, home) });
      }
    }
  }
  for (const spec of configPathSpecs('global')) {
    const file = path.join(home, spec.rel);
    const id = `global:${spec.key}:${file}`;
    if (!seen.has(id) && exists(file)) {
      seen.add(id);
      footprints.push({ key: spec.key, label: spec.label, scope: 'global', path: displayPath(file, cwd, home) });
    }
  }
  return footprints;
}

function analyzeScope(skills, installedKeys) {
  const managedSkills = skills.filter(skill => skill.harnessManaged);
  const userSkills = skills.filter(skill => !skill.harnessManaged);
  const byName = new Map();
  for (const skill of userSkills) {
    if (!byName.has(skill.name)) byName.set(skill.name, []);
    byName.get(skill.name).push(skill);
  }

  const statuses = [];
  const duplicates = [];
  const drift = [];

  for (const [name, copies] of byName) {
    const hashes = new Set(copies.map(c => c.hash));
    const hasDrift = hashes.size > 1;
    const hasPortableCopy = copies.some(c => c.owner === 'portable');
    const nativeOwners = new Set(copies.filter(c => c.owner !== 'portable').map(c => c.owner));

    if (copies.length > 1) duplicates.push({ name, copies });
    if (hasDrift) drift.push({ name, copies });

    const availableToInstalled = (key) => copies.some(copy =>
      copy.packageValid && (
        copy.pluginHost === key ||
        visibleOwnersFor(key, copy.scope).has(copy.owner)
      )
    );

    let portableAcrossInstalled = false;
    let reason = 'Only one harness-specific copy found.';

    if (installedKeys.length >= 2) {
      const everyInstalledCanSeeIt = installedKeys.every(availableToInstalled);

      if (!hasDrift && everyInstalledCanSeeIt) {
        portableAcrossInstalled = true;
        reason = hasPortableCopy
          ? 'Shared-format skill is available to every installed agent.'
          : 'Identical native copies exist for every installed agent.';
      } else if (hasDrift) {
        reason = 'Same-name copies differ.';
      } else if (hasPortableCopy && installedKeys.includes('claude') && !nativeOwners.has('claude')) {
        reason = 'Shared-format skill is ready for Codex/Cursor; Claude adapter is missing.';
      } else {
        const present = installedKeys.filter(availableToInstalled);
        reason = present.length
          ? `Available to ${present.map(k => HARNESS_DEFINITIONS[k]?.label || k).join(', ')}, but not every installed agent.`
          : 'Not available to any installed agent in a supported location.';
      }
    } else if (hasPortableCopy && !hasDrift) {
      reason = 'Stored in the shared Agent Skills format.';
    } else if (hasDrift) {
      reason = 'Same-name copies differ.';
    }

    const validPortableCopy = copies.some(copy =>
      copy.owner === 'portable' && copy.packageValid
    );

    statuses.push({
      name,
      copies,
      portableAcrossInstalled,
      sharedFormat: hasPortableCopy && !hasDrift,
      portableReady: validPortableCopy && !hasDrift,
      drifted: hasDrift,
      nativeOwners: [...nativeOwners],
      reason,
    });
  }

  const totalSkills = statuses.length;
  const portableAcrossInstalled = statuses.filter(s => s.portableAcrossInstalled).length;
  const sharedFormatSkills = statuses.filter(s => s.sharedFormat).length;
  const portableReadySkills = statuses.filter(s => s.portableReady).length;
  const portableReadyPercent = totalSkills > 0
    ? Math.round(100 * portableReadySkills / totalSkills)
    : null;
  const score = installedKeys.length >= 2 && totalSkills > 0
    ? Math.round(100 * portableAcrossInstalled / totalSkills)
    : null;

  const onlyByHarness = {};
  for (const key of installedKeys) onlyByHarness[key] = 0;
  for (const status of statuses) {
    if (status.portableAcrossInstalled || status.sharedFormat || status.drifted) continue;
    const present = installedKeys.filter(k => status.nativeOwners.includes(k));
    if (present.length === 1) onlyByHarness[present[0]] += 1;
  }

  return {
    score,
    portableReadyPercent,
    totalSkills,
    portableAcrossInstalled,
    sharedFormatSkills,
    portableReadySkills,
    onlyByHarness,
    duplicates,
    drift,
    statuses,
    managedSkillCount: managedSkills.length,
    managedSkills,
  };
}

function buildFindings(globalAnalysis, projectAnalysis, installedHarnesses, footprints) {
  const findings = [];
  const installedKeys = installedHarnesses.map(h => h.key);

  if (installedKeys.length < 2) {
    const label = installedHarnesses[0]?.label || 'No supported agent';
    findings.push({
      level: 'info',
      text: installedKeys.length === 1
        ? `Only ${label} is detected, so a cross-agent portability score is not shown.`
        : 'No supported agent installation was detected, so a cross-agent portability score is not shown.',
    });
  } else if (globalAnalysis.totalSkills > 0) {
    findings.push({
      level: globalAnalysis.portableAcrossInstalled === globalAnalysis.totalSkills ? 'good' : 'medium',
      text: `${globalAnalysis.portableAcrossInstalled} of ${globalAnalysis.totalSkills} global skills are available across every detected agent.`,
    });
  }

  if (globalAnalysis.managedSkillCount) {
    findings.push({
      level: 'info',
      text: `${globalAnalysis.managedSkillCount} harness-managed system skill${globalAnalysis.managedSkillCount === 1 ? '' : 's'} excluded from portability readiness.`,
    });
  }
  if (globalAnalysis.drift.length) findings.push({ level: 'high', text: `${globalAnalysis.drift.length} global skill${globalAnalysis.drift.length === 1 ? '' : 's'} have same-name copies with different contents.` });
  if (projectAnalysis.drift.length) findings.push({ level: 'high', text: `${projectAnalysis.drift.length} project skill${projectAnalysis.drift.length === 1 ? '' : 's'} have same-name copies with different contents.` });

  const staleFootprints = footprints.filter(f => !installedKeys.includes(f.key));
  if (staleFootprints.length) findings.push({ level: 'info', text: `${staleFootprints.length} config footprint${staleFootprints.length === 1 ? '' : 's'} belong to agents that were not detected as installed.` });

  return findings;
}

export function scan({
  cwd = process.cwd(),
  home = os.homedir(),
  installedHarnesses: installedOverride,
  scope = 'both',
} = {}) {
  cwd = path.resolve(cwd);
  home = path.resolve(home);
  if (!['both', 'global'].includes(scope)) throw new Error('Unsupported scan scope. Use both or global.');
  const includeProject = scope === 'both';

  const installedHarnesses = installedOverride
    ? installedOverride.map(key => ({ key, label: HARNESS_DEFINITIONS[key]?.label || key, evidence: [{ type: 'test-override', detail: key }] }))
    : detectInstalledHarnesses({ home });
  const installedKeys = installedHarnesses.map(h => h.key);

  const globalSkills = gatherSkills(home, 'global', cwd, home);
  const projectSkills = includeProject ? gatherSkills(cwd, 'project', cwd, home) : [];
  const instructions = [
    ...gatherInstructions(home, 'global', instructionSpecs('global'), cwd, home),
    ...(includeProject ? gatherInstructions(cwd, 'project', instructionSpecs('project'), cwd, home) : []),
  ];
  const rules = gatherRules(cwd, home, { includeProject });
  const cursorRules = rules.filter(rule => rule.owner === 'cursor');
  const configFootprints = gatherConfigFootprints(cwd, home, { includeProject });

  const globalAnalysis = analyzeScope(globalSkills, installedKeys);
  const projectAnalysis = analyzeScope(projectSkills, installedKeys);
  const findings = buildFindings(globalAnalysis, projectAnalysis, installedHarnesses, configFootprints);

  return {
    version: 3,
    generatedAt: new Date().toISOString(),
    cwd,
    scopeMode: scope,
    projectScopeSkipped: !includeProject,
    privacy: 'local-only',
    installedHarnesses,
    configFootprints,
    global: { skills: globalSkills, ...globalAnalysis },
    project: { skills: projectSkills, ...projectAnalysis },
    instructions,
    cursorRules,
    rules,
    findings,
    scoreDefinition: 'Global score = share of unique global skills available across every detected agent. No score is shown unless at least two supported agents are detected.',
  };
}
