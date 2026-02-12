import { join, dirname } from "path";

/**
 * Find workspace root by walking up looking for .workspace/ or .bare/
 */
export async function findWorkspaceRoot(from: string): Promise<string | null> {
  let dir = from;

  while (dir !== "/") {
    // Check for .workspace/ (our config dir)
    const workspaceDir = join(dir, ".workspace");
    if (await Bun.file(join(workspaceDir, "config.yaml")).exists()) {
      return dir;
    }

    // Check for .bare/ (git bare repo pattern)
    const bareDir = join(dir, ".bare");
    if (await dirExists(bareDir)) {
      return dir;
    }

    dir = dirname(dir);
  }

  return null;
}

/**
 * Get path to .workspace/ config directory
 */
export function getWorkspaceConfigDir(root: string): string {
  return join(root, ".workspace");
}

/**
 * Get path to workspace config file
 */
export function getWorkspaceConfigPath(root: string): string {
  return join(root, ".workspace", "config.yaml");
}

/**
 * Get path to workspace lockfile
 */
export function getWorkspaceLockPath(root: string): string {
  return join(root, ".workspace", "lock.yaml");
}

/**
 * Get path to built-in recipes.
 * Searches multiple locations for flexibility.
 */
export function getBuiltinRecipesDir(): string {
  const candidates = [
    // Development: relative to CLI source
    join(dirname(Bun.main), "..", "recipes"),
    // Installed via npm/bun: in node_modules
    join(dirname(Bun.main), "recipes"),
    // System-wide installation
    "/usr/local/share/workspace-recipes",
    // User installation
    join(process.env.HOME || "~", ".workspace", "recipes"),
  ];
  
  // Return first existing path, or fall back to first candidate
  for (const candidate of candidates) {
    try {
      const proc = Bun.spawnSync(["test", "-d", candidate]);
      if (proc.exitCode === 0) {
        return candidate;
      }
    } catch {
      // Continue to next candidate
    }
  }
  
  return candidates[0];
}

/**
 * Get path to local recipes in workspace
 */
export function getLocalRecipesDir(root: string): string {
  return join(root, ".workspace", "recipes");
}

/**
 * Check if directory exists
 */
async function dirExists(path: string): Promise<boolean> {
  try {
    const file = Bun.file(path);
    // Bun.file doesn't distinguish files/dirs, so we try to read
    // For dirs, we check if path + /. exists concept doesn't work
    // Instead, use a simple stat-like check
    const proc = Bun.spawn(["test", "-d", path]);
    const code = await proc.exited;
    return code === 0;
  } catch {
    return false;
  }
}
