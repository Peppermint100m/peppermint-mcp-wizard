import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Legacy skill directories to remove
const LEGACY_SKILLS = [
  "peppermint-recall",
  "peppermint-capture",
  "peppermint-ask-twin",
];

const HASH_FILE = ".wizard-hash";

function getSkillsBundlePath(): string {
  return resolve(__dirname, "..", "skills-bundle", "peppermint");
}

function getTargetPath(): string {
  return join(homedir(), ".claude", "skills", "peppermint");
}

function hashDir(dir: string): string {
  const hash = createHash("sha256");
  const entries = readdirSync(dir).sort();
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      hash.update(hashDir(fullPath));
    } else {
      hash.update(readFileSync(fullPath));
    }
  }
  return hash.digest("hex");
}

function copyDirRecursive(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

export function removeLegacySkills(dryRun: boolean): string[] {
  const removed: string[] = [];
  const skillsDir = join(homedir(), ".claude", "skills");

  for (const name of LEGACY_SKILLS) {
    const path = join(skillsDir, name);
    if (existsSync(path)) {
      if (!dryRun) {
        rmSync(path, { recursive: true, force: true });
      }
      removed.push(name);
    }
  }

  return removed;
}

export function installSkills(dryRun: boolean): {
  installed: boolean;
  updated: boolean;
  skipped: boolean;
  backedUp: boolean;
  targetPath: string;
  error?: string;
} {
  const bundlePath = getSkillsBundlePath();
  const targetPath = getTargetPath();
  const hashFile = join(targetPath, HASH_FILE);
  const alreadyExists = existsSync(join(targetPath, "SKILL.md"));

  if (!existsSync(bundlePath)) {
    return { installed: false, updated: false, skipped: false, backedUp: false, targetPath, error: "Skills bundle not found in package" };
  }

  const bundleHash = hashDir(bundlePath);

  // Check if installed version matches the bundle
  if (alreadyExists && existsSync(hashFile)) {
    const installedHash = readFileSync(hashFile, "utf-8").trim();
    if (installedHash === bundleHash) {
      // No changes needed — bundle matches installed files
      return { installed: true, updated: false, skipped: true, backedUp: false, targetPath };
    }
  }

  if (dryRun) {
    return { installed: true, updated: alreadyExists, skipped: false, backedUp: false, targetPath };
  }

  // Check for user modifications (installed hash doesn't match, or no hash file)
  let backedUp = false;
  if (alreadyExists && !existsSync(hashFile)) {
    // No hash file = pre-wizard install or user-created files. Back up.
    const backupPath = `${targetPath}.bak.${Date.now()}`;
    renameSync(targetPath, backupPath);
    backedUp = true;
  } else if (alreadyExists) {
    // Hash exists but doesn't match bundle = wizard update. Safe to overwrite.
    rmSync(targetPath, { recursive: true, force: true });
  }

  try {
    copyDirRecursive(bundlePath, targetPath);
    // Write hash so we can detect changes next time
    writeFileSync(join(targetPath, HASH_FILE), bundleHash, "utf-8");
    return { installed: true, updated: alreadyExists, skipped: false, backedUp, targetPath };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to install skills";
    return { installed: false, updated: false, skipped: false, backedUp: false, targetPath, error: message };
  }
}
