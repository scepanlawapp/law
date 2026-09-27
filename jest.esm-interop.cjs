// Jest cannot `require()` ESM-only packages (plain Node 22 can). Mastra's CJS
// build pulls in several, so Jest configs that load `@law/mastra` must let the
// transformer compile them. The list is derived from the installed dependency
// tree so it survives Mastra upgrades.
const { existsSync, readFileSync } = require("node:fs");
const { dirname, join } = require("node:path");

function readManifest(dir) {
  const file = join(dir, "package.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

function isEsmOnly(manifest) {
  if (manifest.type !== "module") return false;
  const exportsJson = JSON.stringify(manifest.exports ?? {});
  return (
    !exportsJson.includes('"require"') &&
    !String(manifest.main ?? "").endsWith(".cjs")
  );
}

/** Node-style lookup: nearest `node_modules/<name>` walking up from `fromDir`. */
function resolvePackageDir(name, fromDir) {
  let dir = fromDir;
  while (dir.startsWith(__dirname)) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function esmOnlyDependencies(roots) {
  const seen = new Set();
  const esm = new Set();
  const visit = (name, fromDir) => {
    const dir = resolvePackageDir(name, fromDir);
    if (!dir || seen.has(dir)) return;
    seen.add(dir);
    const manifest = readManifest(dir);
    if (!manifest) return;
    if (isEsmOnly(manifest)) esm.add(name);
    for (const dep of Object.keys({
      ...manifest.dependencies,
      ...manifest.peerDependencies,
    })) {
      visit(dep, dir);
    }
  };
  roots.forEach((name) => visit(name, __dirname));
  return [...esm].sort();
}

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * `transformIgnorePatterns` entry that still transforms Mastra's ESM-only
 * dependencies plus any `extraPackages` a project already needed.
 */
function mastraTransformIgnorePatterns(extraPackages = []) {
  const packages = [
    ...extraPackages,
    // Its CJS build keeps native `import()` calls (e.g. `import("p-map")`),
    // which Jest only supports under --experimental-vm-modules; babel turns
    // them into `require()` of the (also transformed) ESM dependencies.
    "@mastra/core",
    ...esmOnlyDependencies([
      "@mastra/core",
      "@mastra/pg",
      "@mastra/observability",
    ]),
  ];
  return [`/node_modules/(?!(${packages.map(escape).join("|")})/)`];
}

/** Transform for compiled `.js`/`.mjs`/`.cjs` files from node_modules. */
const esmJsTransform = [
  "babel-jest",
  { presets: [["@babel/preset-env", { targets: { node: "current" } }]] },
];

module.exports = { mastraTransformIgnorePatterns, esmJsTransform };
