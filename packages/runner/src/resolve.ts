import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { NoBinError, UnknownServerError } from './errors.js';

const WORKSPACE_FILE = 'pnpm-workspace.yaml';
const MCP_SDK_DEP = '@modelcontextprotocol/server';

export interface ResolvedServer {
  name: string;
  binName: string;
  packageName: string;
  packageDir: string;
  entryPath: string;
}

interface DiscoveredPackage {
  packageName: string;
  packageDir: string;
  bins: Record<string, string>;
  mcpSdk: boolean;
}

export function findWorkspaceRoot(start: string): string | undefined {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, WORKSPACE_FILE))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

export function readWorkspaceGlobs(root: string): string[] {
  const file = join(root, WORKSPACE_FILE);
  if (!existsSync(file)) {
    return [];
  }
  return parsePackagesSequence(readFileSync(file, 'utf8'));
}

function parsePackagesSequence(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^packages:\s*$/.test(line));
  if (start === -1) {
    const inline = lines.find((line) => /^packages:\s*\[/.test(line));
    const match = inline?.match(/^packages:\s*\[(.*)\]\s*$/);
    if (!match) {
      return [];
    }
    return match[1]
      .split(',')
      .map((entry) => unquote(entry.trim()))
      .filter((entry) => entry.length > 0);
  }
  const globs: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      continue;
    }
    if (!line.startsWith(' ')) {
      break;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      globs.push(unquote(trimmed.slice(2).trim()));
    }
  }
  return globs;
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function listDirs(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(dir, entry.name));
}

function expandGlob(root: string, pattern: string): string[] {
  const absolute = pattern.startsWith('/') ? pattern : resolve(root, pattern);
  const segments = absolute.split('/');
  const results: string[] = [];
  walk(segments, 0, '/');
  return results;

  function walk(parts: string[], index: number, prefix: string): void {
    if (index === parts.length) {
      results.push(prefix);
      return;
    }
    const segment = parts[index];
    if (segment === '') {
      walk(parts, index + 1, prefix);
      return;
    }
    if (segment === '**') {
      walk(parts, index + 1, prefix);
      for (const dir of listDirs(prefix)) {
        walk(parts, index, dir);
      }
      return;
    }
    if (segment === '*') {
      for (const dir of listDirs(prefix)) {
        walk(parts, index + 1, dir);
      }
      return;
    }
    walk(parts, index + 1, join(prefix, segment));
  }
}

function expandPackageDirs(root: string, globs: string[]): string[] {
  const dirs = new Set<string>();
  for (const glob of globs) {
    for (const dir of expandGlob(root, glob)) {
      if (existsSync(join(dir, 'package.json'))) {
        dirs.add(dir);
      }
    }
  }
  return [...dirs].sort();
}

function shortName(name: string): string {
  const slash = name.lastIndexOf('/');
  return slash === -1 ? name : name.slice(slash + 1);
}

interface PackageJson {
  name?: string;
  bin?: string | Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function discoverPackages(root: string): DiscoveredPackage[] {
  const packages: DiscoveredPackage[] = [];
  for (const dir of expandPackageDirs(root, readWorkspaceGlobs(root))) {
    try {
      const raw = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as PackageJson;
      const name = raw.name ?? basename(dir);
      const bins = typeof raw.bin === 'string' ? { [shortName(name)]: raw.bin } : (raw.bin ?? {});
      packages.push({
        packageName: name,
        packageDir: dir,
        bins,
        mcpSdk: dependsOnMcpSdk(raw),
      });
    } catch {
      // unreadable package.json: not a package we can run
    }
  }
  return packages;
}

function dependsOnMcpSdk(raw: PackageJson): boolean {
  return (
    raw.dependencies?.[MCP_SDK_DEP] !== undefined ||
    raw.devDependencies?.[MCP_SDK_DEP] !== undefined
  );
}

export function resolveServer(name: string, root: string): ResolvedServer {
  const packages = discoverPackages(root);
  const byBin = new Map<string, DiscoveredPackage & { binName: string; target: string }>();
  const byName = new Map<string, DiscoveredPackage>();
  for (const pkg of packages) {
    if (Object.keys(pkg.bins).length === 0) {
      byName.set(basename(pkg.packageDir), pkg);
      byName.set(shortName(pkg.packageName), pkg);
    }
    if (!pkg.mcpSdk) {
      continue;
    }
    for (const [binName, target] of Object.entries(pkg.bins)) {
      byBin.set(binName, { ...pkg, binName, target });
    }
  }
  const hit = byBin.get(name);
  if (hit) {
    return {
      name,
      binName: hit.binName,
      packageName: hit.packageName,
      packageDir: hit.packageDir,
      entryPath: resolve(hit.packageDir, hit.target),
    };
  }
  if (byName.has(name)) {
    throw new NoBinError(name);
  }
  throw new UnknownServerError(name, [...byBin.keys()].sort());
}
