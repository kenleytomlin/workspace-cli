import chalk from "chalk";
import type { Context } from "../types";
import { findWorkspaceRoot } from "../lib/paths";
import { loadWorkspaceConfig } from "../lib/config";
import { listAvailableRecipes, loadRecipe } from "../lib/recipes";

export async function list(ctx: Context): Promise<void> {
  const root = await findWorkspaceRoot(ctx.cwd);
  
  if (!root) {
    // Not in a workspace - list available recipes
    console.log(chalk.blue("→") + " Available recipes (not in a workspace):\n");
    const available = await listAvailableRecipes();
    
    for (const name of available) {
      const recipe = await loadRecipe(name);
      if (recipe) {
        console.log(`  ${chalk.cyan(name)} ${chalk.dim(`v${recipe.version}`)}`);
        console.log(chalk.dim(`    ${recipe.description}`));
      }
    }
    
    console.log();
    console.log(chalk.dim("  Run 'workspace init <name>' to create a workspace."));
    return;
  }

  const config = await loadWorkspaceConfig(root);
  if (!config) {
    throw new Error("Workspace config not found.");
  }

  // Installed recipes
  if (config.recipes.length > 0) {
    console.log(chalk.blue("→") + " Installed recipes:\n");
    for (const installed of config.recipes) {
      console.log(`  ${chalk.green("●")} ${chalk.cyan(installed.name)} ${chalk.dim(`v${installed.version}`)}`);
    }
    console.log();
  }

  // Pending recipes
  if (config.pending.length > 0) {
    console.log(chalk.blue("→") + " Pending recipes:\n");
    for (const name of config.pending) {
      console.log(`  ${chalk.yellow("○")} ${chalk.cyan(name)}`);
    }
    console.log();
    console.log(chalk.dim("  Run 'workspace apply' to install pending recipes."));
    console.log();
  }

  // Available recipes (not installed)
  const available = await listAvailableRecipes(root);
  const installedNames = new Set([
    ...config.recipes.map((r) => r.name),
    ...config.pending,
  ]);
  const notInstalled = available.filter((name) => !installedNames.has(name));

  if (notInstalled.length > 0 && ctx.verbose) {
    console.log(chalk.blue("→") + " Available recipes:\n");
    for (const name of notInstalled) {
      const recipe = await loadRecipe(name, root);
      if (recipe) {
        console.log(`  ${chalk.dim("○")} ${name} ${chalk.dim(`- ${recipe.description}`)}`);
      }
    }
    console.log();
  } else if (notInstalled.length > 0) {
    console.log(chalk.dim(`  ${notInstalled.length} more recipes available. Run 'workspace list --verbose' to see all.`));
    console.log();
  }

  if (config.recipes.length === 0 && config.pending.length === 0) {
    console.log(chalk.yellow("No recipes installed or pending."));
    console.log(chalk.dim("Use 'workspace add <recipe>' to add recipes."));
  }
}
