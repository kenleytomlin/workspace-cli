#!/usr/bin/env bun
/**
 * Test all fixture recipes.
 * These test that the CLI engine correctly processes different recipe features.
 */

import { join } from "path";

const fixturesDir = join(import.meta.dir, "../test/fixtures");
const cli = join(import.meta.dir, "../src/cli.ts");

interface TestResult {
  fixture: string;
  passed: boolean;
  error?: string;
}

async function main() {
  // List all fixture directories
  const proc = Bun.spawn(["find", fixturesDir, "-name", "recipe.yaml"], { stdout: "pipe" });
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  
  const recipePaths = output.trim().split("\n").filter(Boolean);
  
  console.log(`\n🧪 Testing ${recipePaths.length} fixture recipes...\n`);
  
  const results: TestResult[] = [];

  for (const recipePath of recipePaths) {
    const fixtureDir = join(recipePath, "..");
    const fixtureName = fixtureDir.replace(fixturesDir + "/", "");
    
    process.stdout.write(`🔄 ${fixtureName}...`);
    
    // Run workspace test on the fixture
    const testProc = Bun.spawn(["bun", cli, "test", fixtureDir], {
      stdout: "pipe",
      stderr: "pipe",
    });
    
    const [stdout, stderr] = await Promise.all([
      new Response(testProc.stdout).text(),
      new Response(testProc.stderr).text(),
    ]);
    
    const code = await testProc.exited;
    
    if (code === 0) {
      console.log(` ✅`);
      results.push({ fixture: fixtureName, passed: true });
    } else {
      console.log(` ❌`);
      results.push({ 
        fixture: fixtureName, 
        passed: false, 
        error: stderr || stdout 
      });
    }
  }

  // Summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\n${"─".repeat(50)}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  
  if (failed > 0) {
    console.log(`\nFailures:`);
    for (const r of results.filter(r => !r.passed)) {
      console.log(`\n  ${r.fixture}:`);
      if (r.error) {
        console.log(`    ${r.error.split("\n").join("\n    ")}`);
      }
    }
    process.exit(1);
  }
  
  console.log(`\n✨ All fixture tests passed!`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
