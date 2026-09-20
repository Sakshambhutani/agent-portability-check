export const HARNESS_ORDER = [
  'codex',
  'claude',
  'cursor',
  'gemini',
  'copilot',
  'opencode',
  'roo',
];

export const HARNESS_DEFINITIONS = {
  codex: {
    label: 'Codex',
    commands: ['codex'],
    vscodeExtensions: ['openai.chatgpt'],
    skillRoots: {
      global: [{ owner: 'codex', rel: '.codex/skills' }],
      project: [{ owner: 'codex', rel: '.codex/skills' }],
    },
    visibleOwners: {
      global: ['portable'],
      project: ['portable'],
    },
    configPaths: {
      global: ['.codex'],
      project: ['.codex'],
    },
    instructions: {
      global: [{ owner: 'codex', rel: '.codex/AGENTS.md' }],
      project: [],
    },
    acceptedInstructionOwners: ['shared', 'codex'],
    requireFolderNameMatch: false,
    fix: 'Move the canonical skill package to the shared .agents/skills location.',
  },

  claude: {
    label: 'Claude Code',
    commands: ['claude'],
    vscodeExtensions: ['anthropic.claude-code'],
    skillRoots: {
      global: [{ owner: 'claude', rel: '.claude/skills' }],
      project: [{ owner: 'claude', rel: '.claude/skills' }],
    },
    visibleOwners: {
      global: ['claude'],
      project: ['claude'],
    },
    configPaths: {
      global: ['.claude'],
      project: ['.claude'],
    },
    instructions: {
      global: [{ owner: 'claude', rel: '.claude/CLAUDE.md' }],
      project: [{ owner: 'claude', rel: 'CLAUDE.md' }],
    },
    acceptedInstructionOwners: ['claude'],
    requireFolderNameMatch: false,
    needsPortableAdapter: true,
    adapterRoot: '.claude/skills',
    fix: 'Add a Claude-discoverable adapter pointing at the canonical .agents/skills package.',
  },

  cursor: {
    label: 'Cursor',
    cloudLabel: 'Cursor Cloud',
    commands: ['agent', 'cursor'],
    macApps: ['/Applications/Cursor.app', '~/Applications/Cursor.app'],
    windowsApps: [
      '%LOCALAPPDATA%/Programs/Cursor/Cursor.exe',
      '%PROGRAMFILES%/Cursor/Cursor.exe',
    ],
    skillRoots: {
      global: [{ owner: 'cursor', rel: '.cursor/skills' }],
      project: [{ owner: 'cursor', rel: '.cursor/skills' }],
    },
    visibleOwners: {
      global: ['portable', 'cursor', 'claude', 'codex'],
      project: ['portable', 'cursor', 'claude', 'codex'],
    },
    configPaths: {
      global: ['.cursor'],
      project: ['.cursor'],
    },
    instructions: {
      global: [],
      project: [],
    },
    acceptedInstructionOwners: ['shared', 'cursor'],
    requireFolderNameMatch: true,
    fix: 'Move the canonical skill package to the shared .agents/skills location.',
    cloud: true,
  },

  gemini: {
    label: 'Gemini CLI',
    commands: ['gemini'],
    skillRoots: {
      global: [{ owner: 'gemini', rel: '.gemini/skills' }],
      project: [{ owner: 'gemini', rel: '.gemini/skills' }],
    },
    visibleOwners: {
      global: ['portable', 'gemini'],
      project: ['portable', 'gemini'],
    },
    configPaths: {
      global: ['.gemini'],
      project: ['.gemini'],
    },
    instructions: {
      global: [{ owner: 'gemini', rel: '.gemini/GEMINI.md' }],
      project: [{ owner: 'gemini', rel: 'GEMINI.md' }],
    },
    acceptedInstructionOwners: ['gemini'],
    requireFolderNameMatch: true,
    fix: 'Move the canonical skill package to the interoperable .agents/skills location.',
  },

  copilot: {
    label: 'GitHub Copilot',
    cloudLabel: 'GitHub Copilot Cloud Agent',
    commands: ['copilot'],
    vscodeExtensions: ['github.copilot', 'github.copilot-chat'],
    skillRoots: {
      global: [{ owner: 'copilot', rel: '.copilot/skills' }],
      project: [
        { owner: 'copilot', rel: '.github/skills' },
      ],
    },
    visibleOwners: {
      global: ['portable', 'copilot'],
      project: ['portable', 'copilot', 'claude'],
    },
    configPaths: {
      global: ['.copilot'],
      project: ['.github/copilot-instructions.md', '.github/skills', '.github/instructions', '.github/mcp.json'],
    },
    instructions: {
      global: [{ owner: 'copilot', rel: '.copilot/copilot-instructions.md' }],
      project: [{ owner: 'copilot', rel: '.github/copilot-instructions.md' }],
    },
    acceptedInstructionOwners: ['shared', 'copilot'],
    requireFolderNameMatch: true,
    fix: 'Move the canonical skill package to the interoperable .agents/skills location.',
    cloud: true,
  },

  opencode: {
    label: 'OpenCode',
    commands: ['opencode'],
    skillRoots: {
      global: [{ owner: 'opencode', rel: '.config/opencode/skills' }],
      project: [{ owner: 'opencode', rel: '.opencode/skills' }],
    },
    visibleOwners: {
      global: ['portable', 'opencode', 'claude'],
      project: ['portable', 'opencode', 'claude'],
    },
    configPaths: {
      global: ['.config/opencode'],
      project: ['.opencode', 'opencode.json', 'opencode.jsonc'],
    },
    instructions: {
      global: [{ owner: 'opencode', rel: '.config/opencode/AGENTS.md' }],
      project: [],
    },
    acceptedInstructionOwners: ['shared', 'opencode'],
    requireFolderNameMatch: true,
    fix: 'Move the canonical skill package to the interoperable .agents/skills location.',
  },

  roo: {
    label: 'Roo Code',
    vscodeExtensions: ['rooveterinaryinc.roo-cline'],
    skillRoots: {
      global: [{ owner: 'roo', rel: '.roo/skills' }],
      project: [{ owner: 'roo', rel: '.roo/skills' }],
    },
    visibleOwners: {
      global: ['portable', 'roo'],
      project: ['portable', 'roo'],
    },
    configPaths: {
      global: ['.roo'],
      project: ['.roo', '.roorules'],
    },
    instructions: {
      global: [],
      project: [{ owner: 'roo', rel: '.roorules' }],
    },
    acceptedInstructionOwners: ['shared', 'roo'],
    requireFolderNameMatch: true,
    fix: 'Move the canonical skill package to the interoperable .agents/skills location.',
    dynamicSkillPrefixes: ['skills-'],
  },
};

export const SHARED_SKILL_ROOT = { owner: 'portable', rel: '.agents/skills' };
export const SHARED_PROJECT_INSTRUCTIONS = [{ owner: 'shared', rel: 'AGENTS.md' }];

export function harnessDefinition(key) {
  return HARNESS_DEFINITIONS[key] || null;
}

export function targetKeys() {
  return [...HARNESS_ORDER];
}

export function targetLabels() {
  return Object.fromEntries(HARNESS_ORDER.map(key => [key, HARNESS_DEFINITIONS[key].label]));
}

export function skillRootSpecs(scope) {
  const roots = [SHARED_SKILL_ROOT];
  for (const key of HARNESS_ORDER) {
    for (const spec of HARNESS_DEFINITIONS[key].skillRoots?.[scope] || []) roots.push(spec);
  }
  const seen = new Set();
  return roots.filter(spec => {
    const id = `${spec.owner}:${spec.rel}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function instructionSpecs(scope) {
  const specs = scope === 'project' ? [...SHARED_PROJECT_INSTRUCTIONS] : [];
  for (const key of HARNESS_ORDER) {
    for (const spec of HARNESS_DEFINITIONS[key].instructions?.[scope] || []) specs.push(spec);
  }
  const seen = new Set();
  return specs.filter(spec => {
    const id = `${spec.owner}:${spec.rel}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function configPathSpecs(scope) {
  const specs = [];
  for (const key of HARNESS_ORDER) {
    for (const rel of HARNESS_DEFINITIONS[key].configPaths?.[scope] || []) {
      specs.push({ key, label: HARNESS_DEFINITIONS[key].label, rel });
    }
  }
  return specs;
}

export function visibleOwnersFor(target, scope = 'global') {
  return new Set(HARNESS_DEFINITIONS[target]?.visibleOwners?.[scope] || []);
}

export function acceptsInstructionOwner(target, owner) {
  return Boolean(HARNESS_DEFINITIONS[target]?.acceptedInstructionOwners?.includes(owner));
}
