#!/usr/bin/env bun
/**
 * Test all built-in recipes.
 * Runs `workspace test <recipe>` for each recipe in recipes/
 */

import { join } from "path";
import { $ } from "bun";

const recipesDir = join(import.meta.dir, "../recipes");
const cli = join(import.meta.dir, "../src/cli.ts");

async function main() {
  // List all recipes
  const entries = await Bun.file(recipesDir).exists() 
    ? [] 
    : [];
  
  const proc = Bun.spawn(["ls", "-1", recipesDir], { stdout: "pipe" });
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  
  const recipes = output.trim().split("\n").filter(Boolean);
  
  console.log(`\n🧪 Testing ${recipes.length} recipes...\n`);
  
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const recipe of recipes) {
    // Skip stacks (they don't have tests)
    const stackPath = join(recipesDir, recipe, "stack.yaml");
    if (await Bun.file(stackPath).exists()) {
      console.log(`⏭️  ${recipe} (stack, skipped)`);
      continue;
    }
    
    // Check if recipe has tests
    const recipePath = join(recipesDir, recipe, "recipe.yaml");
    const content = await Bun.file(recipePath).text();
    if (!content.includes("tests:")) {
      console.log(`⚠️  ${recipe} (no tests defined)`);
      continue;
    }

    process.stdout.write(`🔄 ${recipe}...`);
    
    const testProc = Bun.spawn(["bun", cli, "test", recipe], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: join(import.meta.dir, ".."),
    });
    
    const code = await testProc.exited;
    
    if (code === 0) {
      console.log(` ✅`);
      passed++;
    } else {
      console.log(` ❌`);
      failed++;
      failures.push(recipe);
      
      // Show output on failure
      const stderr = await new Response(testProc.stderr).text();
      const stdout = await new Response(testProc.stdout).text();
      if (stderr) console.log(stderr);
      if (stdout) console.log(stdout);
    }
  }

  console.log(`\n${"─".repeat(40)}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  
  if (failures.length > 0) {
    console.log(`\nFailed recipes:`);
    for (const f of failures) {
      console.log(`  - ${f}`);
    }
    process.exit(1);
  }
  
  console.log(`\n✨ All recipe tests passed!`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
