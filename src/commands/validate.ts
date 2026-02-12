import { join } from "path";
import chalk from "chalk";
import type { Context } from "../types";
import { findWorkspaceRoot } from "../lib/paths";
import { loadWorkspaceConfig } from "../lib/config";
import { loadRecipe } from "../lib/recipes";
import { validateRecipe, printValidationResults, type ValidationResult } from "../lib/validator";

async function getTargetDir(root: string, cwd: string): Promise<string> {
  if (cwd !== root && cwd.startsWith(root)) {
    return cwd;
  }
  return join(root, "main");
}

export async function validate(ctx: Context): Promise<void> {
  const root = await findWorkspaceRoot(ctx.cwd);
  if (!root) {
    throw new Error("Not in a workspace. Run 'workspace init' first.");
  }

  const config = await loadWorkspaceConfig(root);
  if (!config) {
    throw new Error("Workspace config not found.");
  }

  if (config.recipes.length === 0) {
    console.log(chalk.yellow("No recipes installed yet."));
    console.log(chalk.dim("Use 'workspace add <recipe>' to add recipes."));
    return;
  }

  const targetDir = await getTargetDir(root, ctx.cwd);
  console.log(chalk.blue("→") + ` Validating ${config.recipes.length} recipe(s) in ${targetDir}...`);

  const allResults: ValidationResult[] = [];
  
  for (const installed of config.recipes) {
    const recipe = await loadRecipe(installed.name, root);
    if (!recipe) {
      console.log(chalk.yellow(`  Warning: Recipe '${installed.name}' not found`));
      continue;
    }

    const results = await validateRecipe(recipe, targetDir, ctx);
    allResults.push(...results);
  }

  if (allResults.length === 0) {
    console.log(chalk.dim("\n  No validation rules defined by installed recipes."));
    return;
  }

  printValidationResults(allResults);

  const failed = allResults.filter((r) => !r.passed);
  const passed = allResults.filter((r) => r.passed);

  console.log();
  if (failed.length === 0) {
    console.log(chalk.green("✓") + ` All ${passed.length} checks passed`);
  } else {
    console.log(chalk.red("✗") + ` ${failed.length} check(s) failed, ${passed.length} passed`);
    process.exit(1);
  }
}
