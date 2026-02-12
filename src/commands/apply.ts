import { join } from "path";
import chalk from "chalk";
import type { Context, InstalledRecipe } from "../types";
import { findWorkspaceRoot } from "../lib/paths";
import { loadWorkspaceConfig, saveWorkspaceConfig, loadWorkspaceLock, saveWorkspaceLock } from "../lib/config";
import { loadRecipe, resolveRecipeDependencies, getRecipePath } from "../lib/recipes";
import { executeRecipe } from "../lib/executor";

/**
 * Determine the target directory for recipe application.
 * If in a worktree, apply there. Otherwise, apply to main/.
 */
async function getTargetDir(root: string, cwd: string): Promise<string> {
  // Check if cwd is inside a worktree (not the workspace root itself)
  if (cwd !== root && cwd.startsWith(root)) {
    // We're inside a worktree
    return cwd;
  }
  
  // Default to main/ worktree
  return join(root, "main");
}

export async function apply(ctx: Context): Promise<void> {
  const root = await findWorkspaceRoot(ctx.cwd);
  if (!root) {
    throw new Error("Not in a workspace. Run 'workspace init' first.");
  }

  const config = await loadWorkspaceConfig(root);
  if (!config) {
    throw new Error("Workspace config not found.");
  }
  
  const targetDir = await getTargetDir(root, ctx.cwd);
  console.log(chalk.dim(`  Target: ${targetDir}`));

  if (config.pending.length === 0) {
    console.log(chalk.yellow("No pending recipes to apply."));
    console.log(chalk.dim("Use 'workspace add <recipe>' to add recipes."));
    return;
  }

  console.log(chalk.blue("→") + ` Applying ${config.pending.length} recipe(s)...`);
  console.log();

  // Resolve dependencies (ensures correct order)
  const resolved = await resolveRecipeDependencies(config.pending, root);

  // Check if any resolved recipes are already installed
  const toApply = resolved.filter(
    (name) => !config.recipes.some((r) => r.name === name)
  );

  if (toApply.length === 0) {
    console.log(chalk.yellow("All recipes are already installed."));
    config.pending = [];
    await saveWorkspaceConfig(root, config);
    return;
  }

  // Apply each recipe
  const applied: InstalledRecipe[] = [];
  
  for (const name of toApply) {
    const recipe = await loadRecipe(name, root);
    if (!recipe) {
      throw new Error(`Recipe not found: ${name}`);
    }

    console.log(chalk.cyan(`  • ${recipe.name}`) + chalk.dim(` v${recipe.version}`));

    // Get variables for this recipe
    const recipeVars = config.variables[name] || {};
    
    // Fill in defaults from recipe
    const variables: Record<string, unknown> = {};
    if (recipe.variables) {
      for (const [key, spec] of Object.entries(recipe.variables)) {
        variables[key] = recipeVars[key] ?? spec.default;
      }
    }
    
    // Get recipe path for templates
    const recipePath = await getRecipePath(name, root);
    if (!recipePath) {
      throw new Error(`Recipe path not found: ${name}`);
    }
    
    // Determine target based on scope
    // - "workspace": apply to workspace root
    // - "worktree" (default): apply to current worktree
    const scope = recipe.scope || "worktree";
    const effectiveTarget = scope === "workspace" ? root : targetDir;

    await executeRecipe({
      recipe,
      workspaceRoot: root,
      targetDir: effectiveTarget,
      recipePath,
      projectName: config.name,
      variables,
      ctx,
    });

    applied.push({
      name: recipe.name,
      version: recipe.version,
      applied_at: new Date().toISOString(),
    });
  }

  // Update config
  config.recipes.push(...applied);
  config.pending = [];
  await saveWorkspaceConfig(root, config);

  // Update lockfile
  const lock = (await loadWorkspaceLock(root)) || {
    applied_at: new Date().toISOString(),
    recipes: [],
    variables: {},
  };
  lock.applied_at = new Date().toISOString();
  lock.recipes = config.recipes;
  lock.variables = config.variables;
  await saveWorkspaceLock(root, lock);

  console.log();
  console.log(chalk.green("✓") + ` Applied ${applied.length} recipe(s)`);
  console.log(chalk.dim("  Run 'workspace validate' to verify configuration."));
}
