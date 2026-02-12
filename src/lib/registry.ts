import { join } from "path";
import { tmpdir } from "os";

/**
 * Recipe source types:
 * - "builtin" — bundled with CLI
 * - "local" — local file path (./my-recipe or /absolute/path)
 * - "git" — git repo reference (github:user/repo/path or full URL)
 */

export interface RecipeSource {
  type: "builtin" | "local" | "git";
  name: string;
  path?: string;      // For local
  repo?: string;      // For git
  ref?: string;       // Git branch/tag (default: main)
  subpath?: string;   // Path within repo
}

/**
 * Default recipe registry — a public git repo
 */
const DEFAULT_REGISTRY = "https://github.com/agent-workspace/recipes.git";
const DEFAULT_REF = "main";

/**
 * Cache directory for fetched recipes
 */
function getCacheDir(): string {
  return join(process.env.HOME || tmpdir(), ".workspace", "cache", "recipes");
}

/**
 * Parse a recipe reference into a source descriptor.
 * 
 * Formats:
 *   vitest-testing              → default registry
 *   ./my-recipe                 → local path
 *   /absolute/path/recipe       → local path
 *   github:user/repo            → GitHub repo root
 *   github:user/repo/path       → GitHub repo subpath
 *   git@github.com:user/repo    → Git SSH URL
 *   https://github.com/...      → Git HTTPS URL
 */
export function parseRecipeRef(ref: string): RecipeSource {
  // Local paths
  if (ref.startsWith("./") || ref.startsWith("/") || ref.startsWith("../")) {
    const name = ref.split("/").pop() || ref;
    return { type: "local", name, path: ref };
  }

  // GitHub shorthand: github:user/repo or github:user/repo/subpath
  if (ref.startsWith("github:")) {
    const parts = ref.slice(7).split("/");
    if (parts.length < 2) {
      throw new Error(`Invalid github reference: ${ref}. Expected github:user/repo[/path]`);
    }
    const [user, repo, ...subpathParts] = parts;
    const subpath = subpathParts.length > 0 ? subpathParts.join("/") : undefined;
    const name = subpath ? subpathParts[subpathParts.length - 1] : repo;
    
    return {
      type: "git",
      name,
      repo: `https://github.com/${user}/${repo}.git`,
      ref: DEFAULT_REF,
      subpath,
    };
  }

  // Git SSH URL
  if (ref.startsWith("git@")) {
    return {
      type: "git",
      name: ref.split("/").pop()?.replace(".git", "") || ref,
      repo: ref,
      ref: DEFAULT_REF,
    };
  }

  // Git HTTPS URL
  if (ref.startsWith("https://") || ref.startsWith("http://")) {
    // Handle GitHub blob URLs: https://github.com/user/repo/tree/main/path
    const githubMatch = ref.match(
      /https:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+)\/(.+))?/
    );
    if (githubMatch) {
      const [, user, repo, branch, subpath] = githubMatch;
      const name = subpath ? subpath.split("/").pop()! : repo;
      return {
        type: "git",
        name,
        repo: `https://github.com/${user}/${repo}.git`,
        ref: branch || DEFAULT_REF,
        subpath,
      };
    }

    // Generic git URL
    return {
      type: "git",
      name: ref.split("/").pop()?.replace(".git", "") || ref,
      repo: ref,
      ref: DEFAULT_REF,
    };
  }

  // Default: look up in default registry
  return {
    type: "git",
    name: ref,
    repo: DEFAULT_REGISTRY,
    ref: DEFAULT_REF,
    subpath: ref,
  };
}

/**
 * Fetch a recipe from a git source.
 * Returns the local path to the fetched recipe.
 */
export async function fetchGitRecipe(source: RecipeSource): Promise<string> {
  if (source.type !== "git" || !source.repo) {
    throw new Error("Not a git source");
  }

  const cacheDir = getCacheDir();
  
  // Create a deterministic cache key from repo + ref
  const repoHash = Buffer.from(source.repo).toString("base64url").slice(0, 16);
  const repoCacheDir = join(cacheDir, repoHash);
  
  // Clone or update the repo
  const repoExists = await dirExists(repoCacheDir);
  
  if (repoExists) {
    // Fetch latest
    console.log(`  Updating ${source.repo}...`);
    await Bun.spawn(["git", "fetch", "origin", source.ref || DEFAULT_REF], {
      cwd: repoCacheDir,
      stdout: "pipe",
      stderr: "pipe",
    }).exited;
    
    await Bun.spawn(["git", "checkout", `origin/${source.ref || DEFAULT_REF}`], {
      cwd: repoCacheDir,
      stdout: "pipe",
      stderr: "pipe",
    }).exited;
  } else {
    // Clone
    console.log(`  Cloning ${source.repo}...`);
    await Bun.spawn(["mkdir", "-p", cacheDir]).exited;
    
    const proc = Bun.spawn([
      "git", "clone",
      "--depth", "1",
      "--branch", source.ref || DEFAULT_REF,
      source.repo,
      repoCacheDir,
    ], {
      stdout: "pipe",
      stderr: "pipe",
    });
    
    const code = await proc.exited;
    if (code !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`Failed to clone ${source.repo}: ${stderr}`);
    }
  }

  // Return path to the specific recipe within the repo
  if (source.subpath) {
    return join(repoCacheDir, source.subpath);
  }
  return repoCacheDir;
}

/**
 * Check if directory exists
 */
async function dirExists(path: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["test", "-d", path]);
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

/**
 * Clear the recipe cache
 */
export async function clearCache(): Promise<void> {
  const cacheDir = getCacheDir();
  await Bun.spawn(["rm", "-rf", cacheDir]).exited;
}
