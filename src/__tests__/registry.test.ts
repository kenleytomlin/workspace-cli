import { describe, it, expect } from "bun:test";
import { parseRecipeRef } from "../lib/registry";

describe("parseRecipeRef", () => {
  it("parses simple recipe name as default registry", () => {
    const source = parseRecipeRef("vitest-testing");
    expect(source.type).toBe("git");
    expect(source.name).toBe("vitest-testing");
    expect(source.repo).toContain("agent-workspace/recipes");
    expect(source.subpath).toBe("vitest-testing");
  });

  it("parses local path starting with ./", () => {
    const source = parseRecipeRef("./my-recipe");
    expect(source.type).toBe("local");
    expect(source.name).toBe("my-recipe");
    expect(source.path).toBe("./my-recipe");
  });

  it("parses absolute path", () => {
    const source = parseRecipeRef("/home/user/recipes/custom");
    expect(source.type).toBe("local");
    expect(source.name).toBe("custom");
    expect(source.path).toBe("/home/user/recipes/custom");
  });

  it("parses github shorthand without subpath", () => {
    const source = parseRecipeRef("github:user/repo");
    expect(source.type).toBe("git");
    expect(source.name).toBe("repo");
    expect(source.repo).toBe("https://github.com/user/repo.git");
    expect(source.subpath).toBeUndefined();
  });

  it("parses github shorthand with subpath", () => {
    const source = parseRecipeRef("github:myorg/recipes/typescript-strict");
    expect(source.type).toBe("git");
    expect(source.name).toBe("typescript-strict");
    expect(source.repo).toBe("https://github.com/myorg/recipes.git");
    expect(source.subpath).toBe("typescript-strict");
  });

  it("parses github shorthand with deep subpath", () => {
    const source = parseRecipeRef("github:company/monorepo/packages/recipes/my-recipe");
    expect(source.type).toBe("git");
    expect(source.name).toBe("my-recipe");
    expect(source.repo).toBe("https://github.com/company/monorepo.git");
    expect(source.subpath).toBe("packages/recipes/my-recipe");
  });

  it("parses full GitHub tree URL", () => {
    const source = parseRecipeRef("https://github.com/user/repo/tree/main/recipes/custom");
    expect(source.type).toBe("git");
    expect(source.name).toBe("custom");
    expect(source.repo).toBe("https://github.com/user/repo.git");
    expect(source.ref).toBe("main");
    expect(source.subpath).toBe("recipes/custom");
  });

  it("parses GitHub tree URL with different branch", () => {
    const source = parseRecipeRef("https://github.com/user/repo/tree/develop/my-recipe");
    expect(source.type).toBe("git");
    expect(source.ref).toBe("develop");
    expect(source.subpath).toBe("my-recipe");
  });

  it("parses git SSH URL", () => {
    const source = parseRecipeRef("git@github.com:user/recipes.git");
    expect(source.type).toBe("git");
    expect(source.name).toBe("recipes");
    expect(source.repo).toBe("git@github.com:user/recipes.git");
  });
});
