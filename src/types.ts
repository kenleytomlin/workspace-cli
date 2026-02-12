// ─────────────────────────────────────────────────────────────
// Core Types
// ─────────────────────────────────────────────────────────────

export interface Context {
  verbose: boolean;
  cwd: string;
}

// ─────────────────────────────────────────────────────────────
// Recipe Manifest
// ─────────────────────────────────────────────────────────────

export interface Recipe {
  name: string;
  version: string;
  description: string;
  author?: string;
  license?: string;
  repository?: string;
  tags?: string[];
  
  /**
   * Scope determines where the recipe is applied:
   * - "worktree" (default): Applied to a specific worktree. Changes stay in that worktree until merged.
   * - "workspace": Applied once at workspace root. Affects all worktrees immediately.
   */
  scope?: "worktree" | "workspace";

  // Detection
  detect?: DetectRule[];
  detect_any?: DetectRule[];

  // Dependencies
  requires?: string[];
  conflicts?: string[];
  suggests?: string[];

  // Variables
  variables?: Record<string, Variable>;

  // Generation
  generates?: GenerateRule[];

  // Commands
  commands?: Record<string, Command>;

  // Validation
  validates?: ValidateRule[];

  // Hooks
  hooks?: {
    pre_apply?: HookCommand[];
    post_apply?: HookCommand[];
    pre_validate?: HookCommand[];
  };
}

export interface DetectRule {
  file?: string;
  contains?: string[];
  command?: string;
  expect?: string;
}

export interface Variable {
  type: "string" | "number" | "boolean";
  default: string | number | boolean;
  description?: string;
  options?: (string | number)[];
}

export interface GenerateRule {
  path: string;
  template?: string;
  content?: string;
  append?: string;
  merge?: Record<string, unknown>;
  overwrite?: boolean;
  when?: {
    file_exists?: string;
    file_not_exists?: string;
  };
}

export interface Command {
  run: string;
  description?: string;
}

export interface ValidateRule {
  check: "file_exists" | "file_contains" | "command_succeeds" | "json_field";
  path?: string;
  contains?: string;
  command?: string;
  field?: string;
  equals?: unknown;
  message: string;
}

export interface HookCommand {
  command: string;
}

// ─────────────────────────────────────────────────────────────
// Workspace State
// ─────────────────────────────────────────────────────────────

export interface WorkspaceConfig {
  name: string;
  created_at: string;
  recipes: InstalledRecipe[];
  pending: string[];
  variables: Record<string, Record<string, unknown>>;
}

export interface InstalledRecipe {
  name: string;
  version: string;
  applied_at: string;
  checksum?: string;
}

export interface WorkspaceLock {
  applied_at: string;
  recipes: InstalledRecipe[];
  variables: Record<string, Record<string, unknown>>;
}

// ─────────────────────────────────────────────────────────────
// Stack (Recipe Bundle)
// ─────────────────────────────────────────────────────────────

export interface Stack {
  name: string;
  version: string;
  description: string;
  type: "stack";
  includes: string[];
  defaults?: Record<string, Record<string, unknown>>;
}
