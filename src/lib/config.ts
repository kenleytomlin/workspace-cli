import YAML from "yaml";
import type { WorkspaceConfig, WorkspaceLock } from "../types";
import { getWorkspaceConfigPath, getWorkspaceLockPath, getWorkspaceConfigDir } from "./paths";

/**
 * Load workspace config
 */
export async function loadWorkspaceConfig(root: string): Promise<WorkspaceConfig | null> {
  const path = getWorkspaceConfigPath(root);

  try {
    const file = Bun.file(path);
    if (!(await file.exists())) {
      return null;
    }

    const content = await file.text();
    return YAML.parse(content) as WorkspaceConfig;
  } catch {
    return null;
  }
}

/**
 * Save workspace config
 */
export async function saveWorkspaceConfig(
  root: string,
  config: WorkspaceConfig
): Promise<void> {
  const configDir = getWorkspaceConfigDir(root);
  const path = getWorkspaceConfigPath(root);

  // Ensure .workspace/ exists
  await Bun.spawn(["mkdir", "-p", configDir]).exited;

  const content = YAML.stringify(config, { indent: 2 });
  await Bun.write(path, content);
}

/**
 * Load workspace lockfile
 */
export async function loadWorkspaceLock(root: string): Promise<WorkspaceLock | null> {
  const path = getWorkspaceLockPath(root);

  try {
    const file = Bun.file(path);
    if (!(await file.exists())) {
      return null;
    }

    const content = await file.text();
    return YAML.parse(content) as WorkspaceLock;
  } catch {
    return null;
  }
}

/**
 * Save workspace lockfile
 */
export async function saveWorkspaceLock(
  root: string,
  lock: WorkspaceLock
): Promise<void> {
  const path = getWorkspaceLockPath(root);
  const content = YAML.stringify(lock, { indent: 2 });
  await Bun.write(path, content);
}

/**
 * Create initial workspace config
 */
export function createWorkspaceConfig(name: string): WorkspaceConfig {
  return {
    name,
    created_at: new Date().toISOString(),
    recipes: [],
    pending: [],
    variables: {},
  };
}
