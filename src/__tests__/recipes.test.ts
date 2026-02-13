import { describe, it, expect } from "bun:test";
import { loadRecipeFromPath } from "../lib/recipes";
import { join } from "path";

const recipesDir = join(import.meta.dir, "../../recipes");

describe("loadRecipeFromPath", () => {
  it("loads bun-runtime recipe", async () => {
    const recipe = await loadRecipeFromPath(join(recipesDir, "bun-runtime/recipe.yaml"));
    expect(recipe).not.toBeNull();
    expect(recipe?.name).toBe("bun-runtime");
    expect(recipe?.version).toBe("1.0.0");
    expect(recipe?.description).toContain("Bun");
  });

  it("loads recipe with commands", async () => {
    const recipe = await loadRecipeFromPath(join(recipesDir, "bun-runtime/recipe.yaml"));
    expect(recipe?.commands).toBeDefined();
    expect(recipe?.commands?.dev).toBeDefined();
    expect(recipe?.commands?.dev.run).toContain("bun");
  });

  it("loads recipe with generates", async () => {
    const recipe = await loadRecipeFromPath(join(recipesDir, "bun-runtime/recipe.yaml"));
    expect(recipe?.generates).toBeDefined();
    expect(recipe?.generates?.length).toBeGreaterThan(0);
  });

  it("loads recipe with validates", async () => {
    const recipe = await loadRecipeFromPath(join(recipesDir, "bun-runtime/recipe.yaml"));
    expect(recipe?.validates).toBeDefined();
    expect(recipe?.validates?.length).toBeGreaterThan(0);
  });

  it("loads recipe with tests", async () => {
    const recipe = await loadRecipeFromPath(join(recipesDir, "bun-runtime/recipe.yaml"));
    const tests = (recipe as any)?.tests;
    expect(tests).toBeDefined();
    expect(tests?.length).toBeGreaterThan(0);
  });

  it("loads vitest-testing recipe with variables", async () => {
    const recipe = await loadRecipeFromPath(join(recipesDir, "vitest-testing/recipe.yaml"));
    expect(recipe?.variables).toBeDefined();
    expect(recipe?.variables?.coverage_threshold).toBeDefined();
    expect(recipe?.variables?.coverage_threshold.type).toBe("number");
    expect(recipe?.variables?.coverage_threshold.default).toBe(80);
  });

  it("loads recipe with requires", async () => {
    const recipe = await loadRecipeFromPath(join(recipesDir, "vitest-testing/recipe.yaml"));
    expect(recipe?.requires).toBeDefined();
    expect(recipe?.requires).toContain("bun-runtime|node-runtime");
  });

  it("loads recipe with conflicts", async () => {
    const recipe = await loadRecipeFromPath(join(recipesDir, "vitest-testing/recipe.yaml"));
    expect(recipe?.conflicts).toBeDefined();
    expect(recipe?.conflicts).toContain("jest-testing");
  });

  it("loads workspace-scoped recipe", async () => {
    const recipe = await loadRecipeFromPath(join(recipesDir, "shared-env/recipe.yaml"));
    expect(recipe?.scope).toBe("workspace");
  });

  it("returns null for non-existent path", async () => {
    const recipe = await loadRecipeFromPath("/nonexistent/recipe.yaml");
    expect(recipe).toBeNull();
  });
});
