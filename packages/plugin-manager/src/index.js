const fg = require("fast-glob");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

/**
 * Load repo config from .gitai.yml
 */
function loadConfig(repoRoot) {
  const cfgPath = path.resolve(repoRoot, ".gitai.yml");
  if (!fs.existsSync(cfgPath)) {
    throw new Error(".gitai.yml not found – run `gitai init` first");
  }
  return yaml.load(fs.readFileSync(cfgPath, "utf8"));
}

/**
 * Normalize and load analyzer plugins.
 * Entries can be string or object { path, options }.
 */
function loadPlugins(entries, repoRoot) {
  return entries.map((entry) => {
    let pluginPath;
    let options = {};
    if (typeof entry === "string") {
      pluginPath = entry;
    } else if (entry && entry.path) {
      pluginPath = entry.path;
      options = entry.options || {};
    } else {
      throw new Error(`Invalid plugin entry: ${JSON.stringify(entry)}`);
    }

    const fullPath = pluginPath.startsWith(".")
      ? path.resolve(repoRoot, pluginPath)
      : pluginPath;
    const mod = require(fullPath);
    if (typeof mod.analyze !== "function") {
      throw new Error(`${pluginPath} has no analyze() export`);
    }
    return { name: pluginPath, analyze: mod.analyze, options };
  });
}

/**
 * Normalize and load formatter plugins.
 * Similar structure but expects format() export.
 */
function loadFormatters(entries, repoRoot) {
  return entries.map((entry) => {
    let pluginPath;
    let options = {};
    if (typeof entry === 'string') {
      pluginPath = entry;
    } else if (entry && entry.path) {
      pluginPath = entry.path;
      options = entry.options || {};
    } else {
      throw new Error(`Invalid formatter entry: ${JSON.stringify(entry)}`);
    }

    const fullPath = pluginPath.startsWith('.')
      ? path.resolve(repoRoot, pluginPath)
      : pluginPath;
    const mod = require(fullPath);
    if (typeof mod.format !== 'function') {
      throw new Error(`${pluginPath} has no format() export`);
    }
    return { name: pluginPath, format: mod.format, options };
  });
}

/**
 * Analyze files/directories.
 */
async function analyze(dir, cfg) {
  const repoRoot = process.cwd();
  const plugins = loadPlugins(cfg.plugins || [], repoRoot);
  const entries = _resolveEntries(dir);

  const findings = [];
  for (const file of entries) {
    const source = fs.readFileSync(file, "utf8");
    for (const { name, analyze: fn, options } of plugins) {
      const result = await fn({ file, source, config: cfg, options });
      result.forEach((f) => findings.push({ plugin: name, ...f }));
    }
  }
  return findings;
}

/**
 * Run formatting plugins on files/directories.
 * Returns array of changed file paths.
 * Honors cfg.formatDir if dir is ".".
 */
async function format(dir, cfg) {
  const repoRoot = process.cwd();
  const formatters = loadFormatters(cfg.formatters || [], repoRoot);
  const targetDir = dir === '.' && cfg.formatDir ? cfg.formatDir : dir;
  const entries = _resolveEntries(targetDir);
  const changed = [];

  for (const { format: fn, options } of formatters) {
    const results = await fn({ files: entries, config: cfg, options });
    changed.push(...results);
  }

  // Deduplicate and return
  return Array.from(new Set(changed));
}

/**
 * Helper to resolve dir or file to list of .js/.ts files
 */
function _resolveEntries(dir) {
  const target = path.resolve(process.cwd(), dir);
  if (fs.existsSync(target) && fs.statSync(target).isFile()) {
    return [target];
  }
  // Directory
  return fg.sync(["**/*.js", "**/*.ts"], {
    cwd: target,
    absolute: true,
    ignore: ["**/node_modules/**"],
  });
}

module.exports = { loadConfig, loadPlugins, loadFormatters, analyze, format };