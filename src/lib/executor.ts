import { join, dirname } from "path";
import Handlebars from "handlebars";
import type { Recipe, GenerateRule, Context } from "../types";
import { getRecipePath } from "./recipes";

interface ExecuteContext {
  recipe: Recipe;
  workspaceRoot: string;    // Workspace root (for workspace-scoped recipes)
  targetDir: string;        // Target dir (worktree for worktree-scoped, root for workspace-scoped)
  recipePath: string;       // Path to recipe directory (for templates)
  projectName: string;
  variables: Record<string, unknown>;
  ctx: Context;
}

/**
 * Execute a recipe - apply all its generations
 */
export async function executeRecipe(execCtx: ExecuteContext): Promise<void> {
  const { recipe, targetDir, ctx } = execCtx;

  if (ctx.verbose) {
    console.log(`  Executing recipe: ${recipe.name}`);
  }

  // Run pre_apply hooks
  if (recipe.hooks?.pre_apply) {
    for (const hook of recipe.hooks.pre_apply) {
      await runHook(hook.command, targetDir, ctx);
    }
  }

  // Apply generations
  if (recipe.generates) {
    for (const rule of recipe.generates) {
      await applyGeneration(rule, execCtx);
    }
  }

  // Run post_apply hooks
  if (recipe.hooks?.post_apply) {
    for (const hook of recipe.hooks.post_apply) {
      await runHook(hook.command, targetDir, ctx);
    }
  }
}

/**
 * Apply a single generation rule
 */
async function applyGeneration(
  rule: GenerateRule,
  execCtx: ExecuteContext
): Promise<void> {
  const { targetDir, ctx } = execCtx;
  const targetPath = join(targetDir, rule.path);

  // Check conditions
  if (rule.when) {
    if (rule.when.file_exists) {
      const checkPath = join(targetDir, rule.when.file_exists);
      if (!(await Bun.file(checkPath).exists())) {
        if (ctx.verbose) {
          console.log(`    Skip ${rule.path}: condition not met (file_exists)`);
        }
        return;
      }
    }
    if (rule.when.file_not_exists) {
      const checkPath = join(targetDir, rule.when.file_not_exists);
      if (await Bun.file(checkPath).exists()) {
        if (ctx.verbose) {
          console.log(`    Skip ${rule.path}: condition not met (file_not_exists)`);
        }
        return;
      }
    }
  }

  // Check overwrite policy
  const exists = await Bun.file(targetPath).exists();
  if (exists && rule.overwrite === false && !rule.append && !rule.merge) {
    if (ctx.verbose) {
      console.log(`    Skip ${rule.path}: already exists (overwrite: false)`);
    }
    return;
  }

  // Ensure parent directory exists
  await Bun.spawn(["mkdir", "-p", dirname(targetPath)]).exited;

  // Handle different generation types
  if (rule.template) {
    await applyTemplate(rule, targetPath, execCtx);
  } else if (rule.content !== undefined) {
    await applyContent(rule, targetPath, execCtx);
  } else if (rule.append) {
    await applyAppend(rule, targetPath, execCtx);
  } else if (rule.merge) {
    await applyMerge(rule, targetPath, execCtx);
  }

  if (ctx.verbose) {
    console.log(`    Generated: ${rule.path}`);
  }
}

/**
 * Apply a template file
 */
async function applyTemplate(
  rule: GenerateRule,
  targetPath: string,
  execCtx: ExecuteContext
): Promise<void> {
  const { recipePath, variables, projectName, recipe } = execCtx;
  
  // Find template file relative to recipe directory
  const templatePath = join(recipePath, rule.template!);

  const templateFile = Bun.file(templatePath);
  if (!(await templateFile.exists())) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  const templateContent = await templateFile.text();
  const template = Handlebars.compile(templateContent);
  
  const output = template({
    ...variables,
    project_name: projectName,
    recipe_name: recipe.name,
    timestamp: new Date().toISOString(),
  });

  await Bun.write(targetPath, output);
}

/**
 * Apply inline content
 */
async function applyContent(
  rule: GenerateRule,
  targetPath: string,
  execCtx: ExecuteContext
): Promise<void> {
  const { variables, projectName, recipe } = execCtx;
  
  // Content might have template variables too
  const template = Handlebars.compile(rule.content!);
  const output = template({
    ...variables,
    project_name: projectName,
    recipe_name: recipe.name,
  });

  await Bun.write(targetPath, output);
}

/**
 * Append to existing file
 */
async function applyAppend(
  rule: GenerateRule,
  targetPath: string,
  execCtx: ExecuteContext
): Promise<void> {
  const { variables, projectName, recipe } = execCtx;
  
  let existing = "";
  const file = Bun.file(targetPath);
  if (await file.exists()) {
    existing = await file.text();
  }

  const template = Handlebars.compile(rule.append!);
  const toAppend = template({
    ...variables,
    project_name: projectName,
    recipe_name: recipe.name,
  });

  // Avoid duplicate appends
  if (existing.includes(toAppend.trim())) {
    return;
  }

  await Bun.write(targetPath, existing + toAppend);
}

/**
 * Merge into JSON file
 */
async function applyMerge(
  rule: GenerateRule,
  targetPath: string,
  _execCtx: ExecuteContext
): Promise<void> {
  let existing: Record<string, unknown> = {};
  
  const file = Bun.file(targetPath);
  if (await file.exists()) {
    const content = await file.text();
    existing = JSON.parse(content);
  }

  const merged = deepMerge(existing, rule.merge!);
  await Bun.write(targetPath, JSON.stringify(merged, null, 2) + "\n");
}

/**
 * Deep merge two objects
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = result[key];

    if (
      sourceVal &&
      typeof sourceVal === "object" &&
      !Array.isArray(sourceVal) &&
      targetVal &&
      typeof targetVal === "object" &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>
      );
    } else {
      result[key] = sourceVal;
    }
  }

  return result;
}

/**
 * Run a hook command
 */
async function runHook(
  command: string,
  cwd: string,
  ctx: Context
): Promise<void> {
  if (ctx.verbose) {
    console.log(`    Running: ${command}`);
  }

  const proc = Bun.spawn(["sh", "-c", command], {
    cwd,
    stdout: ctx.verbose ? "inherit" : "pipe",
    stderr: ctx.verbose ? "inherit" : "pipe",
  });

  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`Hook failed (exit ${code}): ${command}`);
  }
}
