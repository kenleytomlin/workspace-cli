import chalk from "chalk";
import type { Context } from "../types";
import { findWorkspaceRoot } from "../lib/paths";
import { loadWorkspaceConfig, saveWorkspaceConfig } from "../lib/config";
import { loadRecipe, loadStack, checkConflicts } from "../lib/recipes";

export async function add(name: string, ctx: Context): Promise<void> {
  const root = await findWorkspaceRoot(ctx.cwd);
  if (!root) {
    throw new Error(
      "Not in a workspace. Run 'workspace init' first, or cd into a workspace."
    );
  }

  const config = await loadWorkspaceConfig(root);
  if (!config) {
    throw new Error("Workspace config not found. Is this a valid workspace?");
  }

  // Check if it's a stack or a recipe
  const stack = await loadStack(name);
  if (stack) {
    // It's a stack - add all its recipes
    console.log(chalk.blue("→") + ` Adding stack: ${chalk.bold(name)}`);
    
    const toAdd: string[] = [];
    for (const recipeName of stack.includes) {
      if (!config.recipes.some((r) => r.name === recipeName) && 
          !config.pending.includes(recipeName)) {
        toAdd.push(recipeName);
      }
    }

    if (toAdd.length === 0) {
      console.log(chalk.yellow("  All recipes from this stack are already added."));
      return;
    }

    // Check for conflicts
    const allRecipes = [
      ...config.recipes.map((r) => r.name),
      ...config.pending,
      ...toAdd,
    ];
    const conflicts = await checkConflicts(allRecipes, root);
    if (conflicts.length > 0) {
      console.log(chalk.red("\nConflicts detected:"));
      for (const conflict of conflicts) {
        console.log(chalk.red(`  • ${conflict}`));
      }
      throw new Error("Resolve conflicts before adding recipes.");
    }

    config.pending.push(...toAdd);
    
    // Apply stack defaults
    if (stack.defaults) {
      for (const [recipeName, vars] of Object.entries(stack.defaults)) {
        config.variables[recipeName] = {
          ...config.variables[recipeName],
          ...vars,
        };
      }
    }

    await saveWorkspaceConfig(root, config);

    console.log(chalk.green("✓") + ` Added ${toAdd.length} recipes to pending:`);
    for (const r of toAdd) {
      console.log(chalk.dim(`    • ${r}`));
    }
    console.log();
    console.log(chalk.dim("  Run 'workspace apply' to apply them."));
    return;
  }

  // It's a single recipe
  const recipe = await loadRecipe(name, root);
  if (!recipe) {
    throw new Error(`Recipe not found: ${name}`);
  }

  // Check if already installed or pending
  if (config.recipes.some((r) => r.name === name)) {
    console.log(chalk.yellow(`Recipe '${name}' is already installed.`));
    return;
  }

  if (config.pending.includes(name)) {
    console.log(chalk.yellow(`Recipe '${name}' is already pending. Run 'workspace apply'.`));
    return;
  }

  // Check for conflicts
  const allRecipes = [
    ...config.recipes.map((r) => r.name),
    ...config.pending,
    name,
  ];
  const conflicts = await checkConflicts(allRecipes, root);
  if (conflicts.length > 0) {
    console.log(chalk.red("\nConflicts detected:"));
    for (const conflict of conflicts) {
      console.log(chalk.red(`  • ${conflict}`));
    }
    throw new Error("Resolve conflicts before adding this recipe.");
  }

  // Add to pending
  config.pending.push(name);
  await saveWorkspaceConfig(root, config);

  console.log(chalk.green("✓") + ` Added recipe: ${chalk.bold(name)}`);
  console.log(chalk.dim(`  ${recipe.description}`));
  
  // Show what it provides
  if (recipe.commands && Object.keys(recipe.commands).length > 0) {
    console.log(chalk.dim("\n  Commands it provides:"));
    for (const [cmd, info] of Object.entries(recipe.commands)) {
      console.log(chalk.dim(`    • ${cmd}: ${info.run}`));
    }
  }

  // Show suggestions
  if (recipe.suggests && recipe.suggests.length > 0) {
    console.log(chalk.dim("\n  You might also want:"));
    for (const suggestion of recipe.suggests) {
      console.log(chalk.dim(`    • workspace add ${suggestion}`));
    }
  }

  console.log();
  console.log(chalk.dim("  Run 'workspace apply' to apply pending recipes."));
}
