import { join } from "path";
import YAML from "yaml";
import type { Recipe, Stack } from "../types";
import { getBuiltinRecipesDir, getLocalRecipesDir } from "./paths";
import { parseRecipeRef, fetchGitRecipe, type RecipeSource } from "./registry";

/**
 * Load a recipe by name or reference.
 * 
 * Resolution order:
 * 1. Local workspace recipes (.workspace/recipes/)
 * 2. User recipes (~/.workspace/recipes/)
 * 3. Git registry (fetched and cached)
 */
export async function loadRecipe(
  nameOrRef: string,
  workspaceRoot?: string
): Promise<Recipe | null> {
  const source = parseRecipeRef(nameOrRef);
  
  // Local path reference
  if (source.type === "local" && source.path) {
    const recipe = await loadRecipeFromPath(join(source.path, "recipe.yaml"));
    if (recipe) return recipe;
    // Also try if they specified the recipe.yaml directly
    return loadRecipeFromPath(source.path);
  }
  
  // Try local workspace recipes first
  if (workspaceRoot) {
    const localPath = join(getLocalRecipesDir(workspaceRoot), source.name, "recipe.yaml");
    const recipe = await loadRecipeFromPath(localPath);
    if (recipe) return recipe;
  }

  // Try user/built-in recipes
  const builtinPath = join(getBuiltinRecipesDir(), source.name, "recipe.yaml");
  const builtinRecipe = await loadRecipeFromPath(builtinPath);
  if (builtinRecipe) return builtinRecipe;
  
  // Try git registry
  if (source.type === "git") {
    try {
      const recipePath = await fetchGitRecipe(source);
      return loadRecipeFromPath(join(recipePath, "recipe.yaml"));
    } catch (err) {
      // Git fetch failed, recipe not found
      return null;
    }
  }

  return null;
}

/**
 * Get the path to a recipe's directory (for templates, etc.)
 */
export async function getRecipePath(
  nameOrRef: string,
  workspaceRoot?: string
): Promise<string | null> {
  const source = parseRecipeRef(nameOrRef);
  
  if (source.type === "local" && source.path) {
    return source.path;
  }
  
  if (workspaceRoot) {
    const localPath = join(getLocalRecipesDir(workspaceRoot), source.name);
    if (await Bun.file(join(localPath, "recipe.yaml")).exists()) {
      return localPath;
    }
  }
  
  const builtinPath = join(getBuiltinRecipesDir(), source.name);
  if (await Bun.file(join(builtinPath, "recipe.yaml")).exists()) {
    return builtinPath;
  }
  
  if (source.type === "git") {
    try {
      return await fetchGitRecipe(source);
    } catch {
      return null;
    }
  }
  
  return null;
}

/**
 * Load a recipe from a specific path
 */
export async function loadRecipeFromPath(path: string): Promise<Recipe | null> {
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) {
      return null;
    }

    const content = await file.text();
    const recipe = YAML.parse(content) as Recipe;
    
    // Basic validation
    if (!recipe.name || !recipe.version) {
      throw new Error(`Invalid recipe at ${path}: missing name or version`);
    }

    return recipe;
  } catch (err) {
    if (err instanceof Error && err.message.includes("Invalid recipe")) {
      throw err;
    }
    return null;
  }
}

/**
 * Load a stack (recipe bundle)
 */
export async function loadStack(name: string): Promise<Stack | null> {
  const path = join(getBuiltinRecipesDir(), name, "stack.yaml");
  
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) {
      return null;
    }

    const content = await file.text();
    return YAML.parse(content) as Stack;
  } catch {
    return null;
  }
}

/**
 * List all available recipes (built-in + local)
 */
export async function listAvailableRecipes(
  workspaceRoot?: string
): Promise<string[]> {
  const recipes = new Set<string>();

  // List built-in recipes
  const builtinDir = getBuiltinRecipesDir();
  await listRecipesInDir(builtinDir, recipes);

  // List local recipes
  if (workspaceRoot) {
    const localDir = getLocalRecipesDir(workspaceRoot);
    await listRecipesInDir(localDir, recipes);
  }

  return Array.from(recipes).sort();
}

async function listRecipesInDir(dir: string, recipes: Set<string>): Promise<void> {
  try {
    const proc = Bun.spawn(["ls", "-1", dir], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const code = await proc.exited;

    if (code === 0) {
      const entries = output.trim().split("\n").filter(Boolean);
      for (const entry of entries) {
        // Check if it has a recipe.yaml or stack.yaml
        const recipePath = join(dir, entry, "recipe.yaml");
        const stackPath = join(dir, entry, "stack.yaml");
        
        if (
          (await Bun.file(recipePath).exists()) ||
          (await Bun.file(stackPath).exists())
        ) {
          recipes.add(entry);
        }
      }
    }
  } catch {
    // Directory doesn't exist, that's fine
  }
}

/**
 * Resolve recipe dependencies (topological sort)
 */
export async function resolveRecipeDependencies(
  names: string[],
  workspaceRoot?: string
): Promise<string[]> {
  const resolved: string[] = [];
  const seen = new Set<string>();
  const visiting = new Set<string>();

  async function visit(name: string): Promise<void> {
    if (seen.has(name)) return;
    if (visiting.has(name)) {
      throw new Error(`Circular dependency detected: ${name}`);
    }

    visiting.add(name);

    const recipe = await loadRecipe(name, workspaceRoot);
    if (!recipe) {
      throw new Error(`Recipe not found: ${name}`);
    }

    // Visit dependencies first
    if (recipe.requires) {
      for (const dep of recipe.requires) {
        // Handle alternatives (e.g., "bun-runtime|node-runtime")
        const alternatives = dep.split("|");
        const available = await Promise.all(
          alternatives.map((alt) => loadRecipe(alt.trim(), workspaceRoot))
        );
        
        const firstAvailable = alternatives.find((_, i) => available[i] !== null);
        if (!firstAvailable) {
          throw new Error(
            `No available recipe satisfies dependency: ${dep} (required by ${name})`
          );
        }
        
        await visit(firstAvailable.trim());
      }
    }

    visiting.delete(name);
    seen.add(name);
    resolved.push(name);
  }

  for (const name of names) {
    await visit(name);
  }

  return resolved;
}

/**
 * Check for conflicts between recipes
 */
export async function checkConflicts(
  names: string[],
  workspaceRoot?: string
): Promise<string[]> {
  const conflicts: string[] = [];
  const nameSet = new Set(names);

  for (const name of names) {
    const recipe = await loadRecipe(name, workspaceRoot);
    if (!recipe?.conflicts) continue;

    for (const conflict of recipe.conflicts) {
      if (nameSet.has(conflict)) {
        conflicts.push(`${name} conflicts with ${conflict}`);
      }
    }
  }

  return conflicts;
}
