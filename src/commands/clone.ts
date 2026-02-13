import { join, basename } from "path";
import chalk from "chalk";
import type { Context } from "../types";
import { createWorkspaceConfig, saveWorkspaceConfig } from "../lib/config";
import { resolveRecipeDependencies } from "../lib/recipes";

interface CloneOptions extends Context {
  recipes?: string;
}

/**
 * Clone a remote repository and set it up with workspace structure.
 * 
 * Creates:
 *   <name>/
 *   ├── .bare/          # Git database (bare repo)
 *   ├── .git            # Pointer to .bare
 *   ├── .workspace/     # Workspace config
 *   └── main/           # Main branch worktree (with repo contents)
 */
export async function clone(url: string | undefined, nameOrOptions?: string | CloneOptions, maybeOptions?: CloneOptions): Promise<void> {
  // Parse args: workspace clone <url> [name] [--recipes ...]
  let name: string | undefined;
  let options: CloneOptions;
  
  if (typeof nameOrOptions === "string") {
    // clone(url, name, options)
    name = nameOrOptions;
    options = maybeOptions || { cwd: process.cwd() };
  } else {
    // clone(url, options) or clone(url)
    name = undefined;
    options = nameOrOptions || { cwd: process.cwd() };
  }
  
  if (!url) {
    throw new Error("Repository URL required. Usage: workspace clone <url> [name]");
  }

  // Derive name from URL if not provided
  if (!name) {
    name = basename(url, ".git");
  }

  const projectPath = join(options.cwd, name);

  // Check if directory already exists
  const existsProc = Bun.spawn(["test", "-d", projectPath]);
  if ((await existsProc.exited) === 0) {
    throw new Error(`Directory already exists: ${projectPath}`);
  }

  console.log(chalk.blue("→") + ` Cloning: ${chalk.bold(url)}`);
  console.log(chalk.dim(`  into workspace: ${name}`));

  // Create project directory
  await Bun.spawn(["mkdir", "-p", projectPath]).exited;

  // Clone as bare repo into .bare/
  console.log(chalk.dim("  Cloning as bare repository..."));
  const bareDir = join(projectPath, ".bare");
  
  const cloneProc = Bun.spawn(
    ["git", "clone", "--bare", url, bareDir],
    { stdout: "pipe", stderr: "pipe" }
  );
  
  const cloneExitCode = await cloneProc.exited;
  if (cloneExitCode !== 0) {
    const stderr = await new Response(cloneProc.stderr).text();
    await Bun.spawn(["rm", "-rf", projectPath]).exited;
    throw new Error(`Failed to clone repository: ${stderr}`);
  }

  // Create .git pointer file
  await Bun.write(join(projectPath, ".git"), "gitdir: .bare\n");

  // Configure fetch refspec
  await Bun.spawn(
    ["git", "config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"],
    { cwd: projectPath }
  ).exited;

  // Determine the default branch
  console.log(chalk.dim("  Detecting default branch..."));
  const headProc = Bun.spawn(
    ["git", "symbolic-ref", "--short", "HEAD"],
    { cwd: bareDir, stdout: "pipe", stderr: "pipe" }
  );
  let defaultBranch = (await new Response(headProc.stdout).text()).trim();
  
  // Fallback: check for common branch names
  if (!defaultBranch) {
    const branches = ["main", "master"];
    for (const branch of branches) {
      const checkProc = Bun.spawn(
        ["git", "show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
        { cwd: bareDir }
      );
      if ((await checkProc.exited) === 0) {
        defaultBranch = branch;
        break;
      }
    }
  }
  
  if (!defaultBranch) {
    defaultBranch = "main";
  }

  // Create main/ worktree from default branch
  console.log(chalk.dim(`  Creating main/ worktree (${defaultBranch})...`));
  const worktreeProc = Bun.spawn(
    ["git", "worktree", "add", "main", defaultBranch],
    { cwd: projectPath, stdout: "pipe", stderr: "pipe" }
  );
  
  const worktreeExitCode = await worktreeProc.exited;
  if (worktreeExitCode !== 0) {
    const stderr = await new Response(worktreeProc.stderr).text();
    throw new Error(`Failed to create worktree: ${stderr}`);
  }

  // Create .workspace/ config directory
  const workspaceDir = join(projectPath, ".workspace");
  await Bun.spawn(["mkdir", "-p", workspaceDir]).exited;

  // Initialize workspace config
  const config = createWorkspaceConfig(name);

  // If recipes were specified, add them to pending
  if (options.recipes) {
    const recipeNames = options.recipes.split(",").map(r => r.trim()).filter(Boolean);
    console.log(chalk.dim(`  Queuing ${recipeNames.length} recipes...`));
    
    const resolved = await resolveRecipeDependencies(recipeNames);
    config.pending = resolved;
  }

  await saveWorkspaceConfig(projectPath, config);

  // Summary
  console.log();
  console.log(chalk.green("✓") + ` Repository cloned: ${chalk.bold(projectPath)}`);
  console.log();
  console.log(chalk.dim("  Structure:"));
  console.log(chalk.dim(`    ${name}/.bare/        # Git database`));
  console.log(chalk.dim(`    ${name}/.workspace/   # Config`));
  console.log(chalk.dim(`    ${name}/main/         # Working directory`));
  console.log();
  console.log(chalk.dim("  Next steps:"));
  console.log(`    cd ${name}/main`);
  
  if (config.pending.length > 0) {
    console.log(`    workspace apply     ${chalk.dim(`# Apply ${config.pending.length} queued recipes`)}`);
  } else {
    console.log(`    workspace add <recipe>`);
    console.log(`    workspace apply`);
  }
  
  console.log();
}
