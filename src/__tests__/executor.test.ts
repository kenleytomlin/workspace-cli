import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { executeRecipe } from "../lib/executor";
import type { Recipe, Context } from "../types";

describe("executeRecipe", () => {
  let tempDir: string;
  const ctx: Context = { verbose: false, cwd: process.cwd() };

  beforeEach(async () => {
    tempDir = join(tmpdir(), `executor-test-${Date.now()}`);
    await Bun.spawn(["mkdir", "-p", tempDir]).exited;
  });

  afterEach(async () => {
    await Bun.spawn(["rm", "-rf", tempDir]).exited;
  });

  it("generates file with inline content", async () => {
    const recipe: Recipe = {
      name: "test-recipe",
      version: "1.0.0",
      description: "Test",
      generates: [
        {
          path: "test.txt",
          content: "Hello, World!",
        },
      ],
    };

    await executeRecipe({
      recipe,
      workspaceRoot: tempDir,
      targetDir: tempDir,
      recipePath: tempDir,
      projectName: "test",
      variables: {},
      ctx,
    });

    const content = await Bun.file(join(tempDir, "test.txt")).text();
    expect(content).toBe("Hello, World!");
  });

  it("generates file with template variable", async () => {
    const recipe: Recipe = {
      name: "test-recipe",
      version: "1.0.0",
      description: "Test",
      generates: [
        {
          path: "greeting.txt",
          content: "Hello, {{ project_name }}!",
        },
      ],
    };

    await executeRecipe({
      recipe,
      workspaceRoot: tempDir,
      targetDir: tempDir,
      recipePath: tempDir,
      projectName: "MyProject",
      variables: {},
      ctx,
    });

    const content = await Bun.file(join(tempDir, "greeting.txt")).text();
    expect(content).toBe("Hello, MyProject!");
  });

  it("appends to existing file", async () => {
    // Create existing file
    await Bun.write(join(tempDir, "existing.txt"), "Line 1\n");

    const recipe: Recipe = {
      name: "test-recipe",
      version: "1.0.0",
      description: "Test",
      generates: [
        {
          path: "existing.txt",
          append: "Line 2\n",
        },
      ],
    };

    await executeRecipe({
      recipe,
      workspaceRoot: tempDir,
      targetDir: tempDir,
      recipePath: tempDir,
      projectName: "test",
      variables: {},
      ctx,
    });

    const content = await Bun.file(join(tempDir, "existing.txt")).text();
    expect(content).toBe("Line 1\nLine 2\n");
  });

  it("merges into JSON file", async () => {
    // Create existing JSON
    await Bun.write(
      join(tempDir, "package.json"),
      JSON.stringify({ name: "test", version: "1.0.0" }, null, 2)
    );

    const recipe: Recipe = {
      name: "test-recipe",
      version: "1.0.0",
      description: "Test",
      generates: [
        {
          path: "package.json",
          merge: {
            scripts: {
              test: "vitest",
            },
          },
        },
      ],
    };

    await executeRecipe({
      recipe,
      workspaceRoot: tempDir,
      targetDir: tempDir,
      recipePath: tempDir,
      projectName: "test",
      variables: {},
      ctx,
    });

    const content = await Bun.file(join(tempDir, "package.json")).text();
    const json = JSON.parse(content);
    expect(json.name).toBe("test");
    expect(json.scripts.test).toBe("vitest");
  });

  it("respects overwrite: false", async () => {
    // Create existing file
    await Bun.write(join(tempDir, "keep.txt"), "Original");

    const recipe: Recipe = {
      name: "test-recipe",
      version: "1.0.0",
      description: "Test",
      generates: [
        {
          path: "keep.txt",
          content: "Replaced",
          overwrite: false,
        },
      ],
    };

    await executeRecipe({
      recipe,
      workspaceRoot: tempDir,
      targetDir: tempDir,
      recipePath: tempDir,
      projectName: "test",
      variables: {},
      ctx,
    });

    const content = await Bun.file(join(tempDir, "keep.txt")).text();
    expect(content).toBe("Original");
  });

  it("creates nested directories", async () => {
    const recipe: Recipe = {
      name: "test-recipe",
      version: "1.0.0",
      description: "Test",
      generates: [
        {
          path: "deep/nested/dir/file.txt",
          content: "Deep",
        },
      ],
    };

    await executeRecipe({
      recipe,
      workspaceRoot: tempDir,
      targetDir: tempDir,
      recipePath: tempDir,
      projectName: "test",
      variables: {},
      ctx,
    });

    const content = await Bun.file(join(tempDir, "deep/nested/dir/file.txt")).text();
    expect(content).toBe("Deep");
  });

  it("uses custom variables in content", async () => {
    const recipe: Recipe = {
      name: "test-recipe",
      version: "1.0.0",
      description: "Test",
      variables: {
        greeting: { type: "string", default: "Hello" },
      },
      generates: [
        {
          path: "output.txt",
          content: "{{ greeting }}, World!",
        },
      ],
    };

    await executeRecipe({
      recipe,
      workspaceRoot: tempDir,
      targetDir: tempDir,
      recipePath: tempDir,
      projectName: "test",
      variables: { greeting: "Howdy" },
      ctx,
    });

    const content = await Bun.file(join(tempDir, "output.txt")).text();
    expect(content).toBe("Howdy, World!");
  });
});
