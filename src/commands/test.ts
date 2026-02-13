import { join } from "path";
import { tmpdir } from "os";
import chalk from "chalk";
import type { Context } from "../types";
import { loadRecipe, getRecipePath } from "../lib/recipes";
import { executeRecipe } from "../lib/executor";
import { createWorkspaceConfig, saveWorkspaceConfig } from "../lib/config";

interface RecipeTest {
  name: string;
  assert_file_exists?: string;
  assert_file_not_exists?: string;
  assert_file_contains?: {
    path: string;
    contains: string;
  };
  assert_json_field?: {
    path: string;
    field: string;
    equals?: unknown;
    contains?: string;
  };
  assert_command_succeeds?: string;
  assert_command_fails?: string;
}

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

export async function test(recipeName: string | undefined, ctx: Context): Promise<void> {
  if (!recipeName) {
    throw new Error("Recipe name required. Usage: workspace test <recipe>");
  }

  const recipe = await loadRecipe(recipeName);
  if (!recipe) {
    throw new Error(`Recipe not found: ${recipeName}`);
  }

  const tests = (recipe as any).tests as RecipeTest[] | undefined;
  if (!tests || tests.length === 0) {
    console.log(chalk.yellow(`No tests defined for recipe: ${recipeName}`));
    console.log(chalk.dim("Add a 'tests' section to recipe.yaml to define tests."));
    return;
  }

  console.log(chalk.blue("→") + ` Testing recipe: ${chalk.bold(recipeName)}`);
  console.log(chalk.dim(`  ${tests.length} test(s) to run\n`));

  // Create temp workspace
  const tempDir = join(tmpdir(), `workspace-test-${Date.now()}`);
  await Bun.spawn(["mkdir", "-p", tempDir]).exited;
  await Bun.spawn(["mkdir", "-p", join(tempDir, ".workspace")]).exited;

  // Initialize minimal workspace config
  const config = createWorkspaceConfig("test-workspace");
  await saveWorkspaceConfig(tempDir, config);

  // Apply the recipe
  console.log(chalk.dim("  Applying recipe..."));
  
  const recipePath = await getRecipePath(recipeName);
  if (!recipePath) {
    throw new Error(`Recipe path not found: ${recipeName}`);
  }

  // Get default variables
  const variables: Record<string, unknown> = {};
  if (recipe.variables) {
    for (const [key, spec] of Object.entries(recipe.variables)) {
      variables[key] = spec.default;
    }
  }

  try {
    await executeRecipe({
      recipe,
      workspaceRoot: tempDir,
      targetDir: tempDir,
      recipePath,
      projectName: "test-workspace",
      variables,
      ctx: { ...ctx, verbose: false },
    });
  } catch (err) {
    console.log(chalk.red("\n✗ Recipe failed to apply:"), err);
    await cleanup(tempDir);
    process.exit(1);
  }

  // Run tests
  const results: TestResult[] = [];
  
  for (const t of tests) {
    const start = Date.now();
    const result = await runTest(t, tempDir, ctx);
    results.push({
      ...result,
      duration: Date.now() - start,
    });

    const icon = result.passed ? chalk.green("✓") : chalk.red("✗");
    const duration = Date.now() - start;
    const time = chalk.dim(`(${duration}ms)`);
    console.log(`  ${icon} ${t.name} ${time}`);
    
    if (!result.passed && ctx.verbose) {
      console.log(chalk.dim(`    ${result.message}`));
    }
  }

  // Cleanup
  await cleanup(tempDir);

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log();
  if (failed === 0) {
    console.log(chalk.green(`✓ All ${passed} tests passed`));
  } else {
    console.log(chalk.red(`✗ ${failed} failed`) + chalk.dim(`, ${passed} passed`));
    
    // Show failures
    console.log(chalk.red("\nFailures:"));
    for (const r of results.filter((r) => !r.passed)) {
      console.log(chalk.red(`  • ${r.name}`));
      console.log(chalk.dim(`    ${r.message}`));
    }
    
    process.exit(1);
  }
}

async function runTest(
  t: RecipeTest,
  workDir: string,
  ctx: Context
): Promise<{ name: string; passed: boolean; message: string }> {
  try {
    if (t.assert_file_exists) {
      const path = join(workDir, t.assert_file_exists);
      const exists = await Bun.file(path).exists();
      return {
        name: t.name,
        passed: exists,
        message: exists ? "File exists" : `File not found: ${t.assert_file_exists}`,
      };
    }

    if (t.assert_file_not_exists) {
      const path = join(workDir, t.assert_file_not_exists);
      const exists = await Bun.file(path).exists();
      return {
        name: t.name,
        passed: !exists,
        message: !exists ? "File does not exist" : `File should not exist: ${t.assert_file_not_exists}`,
      };
    }

    if (t.assert_file_contains) {
      const path = join(workDir, t.assert_file_contains.path);
      const file = Bun.file(path);
      if (!(await file.exists())) {
        return {
          name: t.name,
          passed: false,
          message: `File not found: ${t.assert_file_contains.path}`,
        };
      }
      const content = await file.text();
      const found = content.includes(t.assert_file_contains.contains);
      return {
        name: t.name,
        passed: found,
        message: found 
          ? "Content found" 
          : `Expected "${t.assert_file_contains.contains}" not found in ${t.assert_file_contains.path}`,
      };
    }

    if (t.assert_json_field) {
      const path = join(workDir, t.assert_json_field.path);
      const file = Bun.file(path);
      if (!(await file.exists())) {
        return {
          name: t.name,
          passed: false,
          message: `File not found: ${t.assert_json_field.path}`,
        };
      }
      
      const content = await file.text();
      const json = JSON.parse(content);
      
      // Navigate to field
      const parts = t.assert_json_field.field.split(".");
      let value: unknown = json;
      for (const part of parts) {
        if (value && typeof value === "object" && part in (value as Record<string, unknown>)) {
          value = (value as Record<string, unknown>)[part];
        } else {
          return {
            name: t.name,
            passed: false,
            message: `Field not found: ${t.assert_json_field.field}`,
          };
        }
      }

      if (t.assert_json_field.equals !== undefined) {
        const passed = JSON.stringify(value) === JSON.stringify(t.assert_json_field.equals);
        return {
          name: t.name,
          passed,
          message: passed
            ? "Value matches"
            : `Expected ${JSON.stringify(t.assert_json_field.equals)}, got ${JSON.stringify(value)}`,
        };
      }

      if (t.assert_json_field.contains) {
        const strValue = String(value);
        const found = strValue.includes(t.assert_json_field.contains);
        return {
          name: t.name,
          passed: found,
          message: found ? "Value contains expected string" : `"${t.assert_json_field.contains}" not found in value`,
        };
      }

      // Just checking field exists
      return { name: t.name, passed: true, message: "Field exists" };
    }

    if (t.assert_command_succeeds) {
      const proc = Bun.spawn(["sh", "-c", t.assert_command_succeeds], {
        cwd: workDir,
        stdout: "pipe",
        stderr: "pipe",
      });
      const code = await proc.exited;
      return {
        name: t.name,
        passed: code === 0,
        message: code === 0 ? "Command succeeded" : `Command failed with exit code ${code}`,
      };
    }

    if (t.assert_command_fails) {
      const proc = Bun.spawn(["sh", "-c", t.assert_command_fails], {
        cwd: workDir,
        stdout: "pipe",
        stderr: "pipe",
      });
      const code = await proc.exited;
      return {
        name: t.name,
        passed: code !== 0,
        message: code !== 0 ? "Command failed as expected" : "Command should have failed but succeeded",
      };
    }

    return {
      name: t.name,
      passed: false,
      message: "No assertion defined for test",
    };
  } catch (err) {
    return {
      name: t.name,
      passed: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

async function cleanup(dir: string): Promise<void> {
  await Bun.spawn(["rm", "-rf", dir]).exited;
}
