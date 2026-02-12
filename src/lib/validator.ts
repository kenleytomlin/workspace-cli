import { join } from "path";
import type { Recipe, ValidateRule, Context } from "../types";
import chalk from "chalk";

export interface ValidationResult {
  recipe: string;
  rule: ValidateRule;
  passed: boolean;
  message: string;
}

/**
 * Validate a recipe's rules
 */
export async function validateRecipe(
  recipe: Recipe,
  workspaceRoot: string,
  ctx: Context
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  if (!recipe.validates) {
    return results;
  }

  for (const rule of recipe.validates) {
    const result = await validateRule(rule, workspaceRoot, ctx);
    results.push({
      recipe: recipe.name,
      rule,
      ...result,
    });
  }

  return results;
}

/**
 * Validate a single rule
 */
async function validateRule(
  rule: ValidateRule,
  workspaceRoot: string,
  ctx: Context
): Promise<{ passed: boolean; message: string }> {
  switch (rule.check) {
    case "file_exists":
      return validateFileExists(rule, workspaceRoot);

    case "file_contains":
      return validateFileContains(rule, workspaceRoot);

    case "command_succeeds":
      return validateCommandSucceeds(rule, workspaceRoot, ctx);

    case "json_field":
      return validateJsonField(rule, workspaceRoot);

    default:
      return { passed: false, message: `Unknown check type: ${rule.check}` };
  }
}

async function validateFileExists(
  rule: ValidateRule,
  workspaceRoot: string
): Promise<{ passed: boolean; message: string }> {
  if (!rule.path) {
    return { passed: false, message: "file_exists check requires 'path'" };
  }

  const filePath = join(workspaceRoot, rule.path);
  const exists = await Bun.file(filePath).exists();

  return {
    passed: exists,
    message: exists ? `✓ ${rule.path} exists` : rule.message,
  };
}

async function validateFileContains(
  rule: ValidateRule,
  workspaceRoot: string
): Promise<{ passed: boolean; message: string }> {
  if (!rule.path || !rule.contains) {
    return { passed: false, message: "file_contains check requires 'path' and 'contains'" };
  }

  const filePath = join(workspaceRoot, rule.path);
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return { passed: false, message: `File not found: ${rule.path}` };
  }

  const content = await file.text();
  const found = content.includes(rule.contains);

  return {
    passed: found,
    message: found ? `✓ ${rule.path} contains expected content` : rule.message,
  };
}

async function validateCommandSucceeds(
  rule: ValidateRule,
  workspaceRoot: string,
  ctx: Context
): Promise<{ passed: boolean; message: string }> {
  if (!rule.command) {
    return { passed: false, message: "command_succeeds check requires 'command'" };
  }

  try {
    const proc = Bun.spawn(["sh", "-c", rule.command], {
      cwd: workspaceRoot,
      stdout: ctx.verbose ? "inherit" : "pipe",
      stderr: ctx.verbose ? "inherit" : "pipe",
    });

    const code = await proc.exited;
    const passed = code === 0;

    return {
      passed,
      message: passed ? `✓ ${rule.command}` : rule.message,
    };
  } catch {
    return { passed: false, message: rule.message };
  }
}

async function validateJsonField(
  rule: ValidateRule,
  workspaceRoot: string
): Promise<{ passed: boolean; message: string }> {
  if (!rule.path || !rule.field) {
    return { passed: false, message: "json_field check requires 'path' and 'field'" };
  }

  const filePath = join(workspaceRoot, rule.path);
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return { passed: false, message: `File not found: ${rule.path}` };
  }

  try {
    const content = await file.text();
    const json = JSON.parse(content);

    // Navigate to field (supports dot notation)
    const parts = rule.field.split(".");
    let value: unknown = json;
    for (const part of parts) {
      if (value && typeof value === "object" && part in (value as Record<string, unknown>)) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return { passed: false, message: rule.message };
      }
    }

    // Check value
    if (rule.equals !== undefined) {
      const passed = value === rule.equals;
      return {
        passed,
        message: passed ? `✓ ${rule.path}:${rule.field} = ${rule.equals}` : rule.message,
      };
    }

    // Just checking field exists
    return {
      passed: true,
      message: `✓ ${rule.path}:${rule.field} exists`,
    };
  } catch {
    return { passed: false, message: `Invalid JSON: ${rule.path}` };
  }
}

/**
 * Print validation results
 */
export function printValidationResults(results: ValidationResult[]): void {
  const byRecipe = new Map<string, ValidationResult[]>();

  for (const result of results) {
    const list = byRecipe.get(result.recipe) || [];
    list.push(result);
    byRecipe.set(result.recipe, list);
  }

  for (const [recipe, recipeResults] of byRecipe) {
    console.log(chalk.bold(`\n${recipe}:`));
    for (const result of recipeResults) {
      if (result.passed) {
        console.log(chalk.green(`  ${result.message}`));
      } else {
        console.log(chalk.red(`  ✗ ${result.message}`));
      }
    }
  }
}
