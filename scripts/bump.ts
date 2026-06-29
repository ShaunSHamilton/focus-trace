//! Bumps the versions of the `package.json`, `backend/Cargo.toml`, and `backend/tauri.conf.json`
//! Required arg: patch, minor, major

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

type BumpType = "patch" | "minor" | "major";

const bumpType = process.argv[2] as BumpType;

if (!["patch", "minor", "major"].includes(bumpType)) {
  console.error(`Usage: bun scripts/bump.ts <patch|minor|major>`);
  process.exit(1);
}

function bumpVersion(version: string, type: BumpType): string {
  const [major, minor, patch] = version.split(".").map(Number);
  switch (type) {
    case "major": return `${major + 1}.0.0`;
    case "minor": return `${major}.${minor + 1}.0`;
    case "patch": return `${major}.${minor}.${patch + 1}`;
  }
}

const root = resolve(import.meta.dir, "..");

// package.json
const pkgPath = resolve(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const oldVersion = pkg.version;
const newVersion = bumpVersion(oldVersion, bumpType);
pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// backend/tauri.conf.json
const tauriConfPath = resolve(root, "backend/tauri.conf.json");
const tauriConf = JSON.parse(readFileSync(tauriConfPath, "utf-8"));
tauriConf.version = newVersion;
writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + "\n");

// backend/Cargo.toml - replace version field in [package] section
const cargoPath = resolve(root, "backend/Cargo.toml");
const cargo = readFileSync(cargoPath, "utf-8");
const updatedCargo = cargo.replace(
  /^(version\s*=\s*)"[^"]*"/m,
  `$1"${newVersion}"`
);
writeFileSync(cargoPath, updatedCargo);

console.log(`${oldVersion} -> ${newVersion}`);
