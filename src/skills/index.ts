import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
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

function getSkillsBundlePath(): string {
  // In the built dist/cli.js, skills-bundle is at the package root (sibling of dist/)
  return resolve(__dirname, "..", "skills-bundle", "peppermint");
}

function getTargetPath(): string {
  return join(homedir(), ".claude", "skills", "peppermint");
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

export function installSkills(dryRun: boolean): { installed: boolean; updated: boolean; targetPath: string; error?: string } {
  const bundlePath = getSkillsBundlePath();
  const targetPath = getTargetPath();
  const alreadyExists = existsSync(join(targetPath, "SKILL.md"));

  if (!existsSync(bundlePath)) {
    return { installed: false, updated: false, targetPath, error: "Skills bundle not found in package" };
  }

  if (dryRun) {
    return { installed: true, updated: alreadyExists, targetPath };
  }

  try {
    // Always overwrite with latest skill files
    if (existsSync(targetPath)) {
      rmSync(targetPath, { recursive: true, force: true });
    }
    copyDirRecursive(bundlePath, targetPath);
    return { installed: true, updated: alreadyExists, targetPath };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to install skills";
    return { installed: false, updated: false, targetPath, error: message };
  }
}
