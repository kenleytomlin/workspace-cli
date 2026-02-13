import { join, basename, dirname } from "path";
import chalk from "chalk";
import type { Context } from "../types";
import { createWorkspaceConfig, saveWorkspaceConfig } from "../lib/config";
import { resolveRecipeDependencies } from "../lib/recipes";
import { createClaudeSettings } from "../lib/claude";

interface AdoptOptions extends Context {
  recipes?: string;
}

/**
 * Adopt an existing git repository and convert it to workspace structure.
 *
 * Transforms a standard repo:
 *   existing-repo/
 *   └── .git/
 *
 * Or recognizes an already-converted bare-worktree repo:
 *   existing-repo/
 *   ├── .bare/
 *   ├── .git            # file pointing to .bare
 *   └── main/
 *
 * Into:
 *   existing-repo/
 *   ├── .bare/          # Git database (converted from .git)
 *   ├── .git            # Pointer to .bare
 *   ├── .workspace/     # Workspace config
 *   └── main/           # Main branch worktree (original contents)
 */
export async function adopt(options: AdoptOptions): Promise<void> {
  const repoDir = options.cwd;
  const repoName = basename(repoDir);

  // Check if this is a git repository (.git can be a directory or a file)
  const gitDir = join(repoDir, ".git");
  const isGitDirProc = Bun.spawn(["test", "-d", gitDir]);
  const isGitDir = (await isGitDirProc.exited) === 0;
  const isGitFileProc = Bun.spawn(["test", "-f", gitDir]);
  const isGitFile = (await isGitFileProc.exited) === 0;

  if (!isGitDir && !isGitFile) {
    throw new Error("Current directory is not a git repository");
  }

  // Detect if already in bare-worktree layout (.git is a file pointing to .bare)
  const alreadyBare = isGitFile && await isBareWorktreeLayout(repoDir);

  // Check if already a workspace (has .workspace/ config)
  const workspaceDirExists = Bun.spawn(["test", "-d", join(repoDir, ".workspace")]);
  if ((await workspaceDirExists.exited) === 0) {
    throw new Error("Already a workspace. Use 'workspace add' to add recipes.");
  }

  if (alreadyBare) {
    await adoptExistingBareLayout(repoDir, repoName, options);
  } else {
    await adoptStandardRepo(repoDir, repoName, options);
  }
}

/**
 * Check if a repo is already in bare-worktree layout:
 * .git is a file containing "gitdir: .bare" and .bare/ directory exists.
 */
async function isBareWorktreeLayout(repoDir: string): Promise<boolean> {
  const gitContent = await Bun.file(join(repoDir, ".git")).text();
  if (!gitContent.trim().includes(".bare")) {
    return false;
  }
  const bareExists = Bun.spawn(["test", "-d", join(repoDir, ".bare")]);
  return (await bareExists.exited) === 0;
}

/**
 * Adopt a repo that is already in bare-worktree layout.
 * Just creates .workspace/ config — no structural conversion needed.
 */
async function adoptExistingBareLayout(
  repoDir: string,
  repoName: string,
  options: AdoptOptions,
): Promise<void> {
  console.log(chalk.blue("→") + ` Adopting bare-worktree repository: ${chalk.bold(repoName)}`);
  console.log(chalk.dim("  Detected existing bare-worktree layout, skipping conversion."));

  // Verify main/ worktree exists
  const mainDir = join(repoDir, "main");
  const mainExists = Bun.spawn(["test", "-d", mainDir]);
  if ((await mainExists.exited) !== 0) {
    throw new Error("Bare-worktree layout detected but main/ worktree is missing.");
  }

  // Create .workspace/ config
  const workspaceDir = join(repoDir, ".workspace");
  await Bun.spawn(["mkdir", "-p", workspaceDir]).exited;

  const config = createWorkspaceConfig(repoName);

  if (options.recipes) {
    const recipeNames = options.recipes.split(",").map(r => r.trim()).filter(Boolean);
    console.log(chalk.dim(`  Queuing ${recipeNames.length} recipes...`));
    const resolved = await resolveRecipeDependencies(recipeNames);
    config.pending = resolved;
  }

  await saveWorkspaceConfig(repoDir, config);

  console.log();
  console.log(chalk.green("✓") + ` Repository adopted: ${chalk.bold(repoDir)}`);
  console.log();
  console.log(chalk.dim("  Structure (preserved):"));
  console.log(chalk.dim(`    ${repoName}/.bare/        # Git database`));
  console.log(chalk.dim(`    ${repoName}/.workspace/   # Config (new)`));
  console.log(chalk.dim(`    ${repoName}/main/         # Working directory`));
  console.log();
  console.log(chalk.dim("  Next steps:"));
  console.log(`    cd main`);

  if (config.pending.length > 0) {
    console.log(`    workspace apply     ${chalk.dim(`# Apply ${config.pending.length} queued recipes`)}`);
  } else {
    console.log(`    workspace add <recipe>`);
    console.log(`    workspace apply`);
  }

  console.log();
}

/**
 * Adopt a standard git repo (.git/ directory) by converting to bare-worktree layout.
 */
async function adoptStandardRepo(
  repoDir: string,
  repoName: string,
  options: AdoptOptions,
): Promise<void> {
  const gitDir = join(repoDir, ".git");

  // Check for uncommitted changes
  const statusProc = Bun.spawn(
    ["git", "status", "--porcelain"],
    { cwd: repoDir, stdout: "pipe" }
  );
  const statusOutput = await new Response(statusProc.stdout).text();
  if (statusOutput.trim()) {
    throw new Error("Cannot adopt: uncommitted changes detected. Please commit or stash your changes first.");
  }

  console.log(chalk.blue("→") + ` Adopting repository: ${chalk.bold(repoName)}`);

  // Get the current branch
  const branchProc = Bun.spawn(
    ["git", "branch", "--show-current"],
    { cwd: repoDir, stdout: "pipe" }
  );
  const currentBranch = (await new Response(branchProc.stdout).text()).trim() || "main";
  console.log(chalk.dim(`  Current branch: ${currentBranch}`));

  // Step 1: Create .bare from existing .git
  console.log(chalk.dim("  Converting to bare repository..."));
  const bareDir = join(repoDir, ".bare");

  // Clone .git to .bare as bare
  // We use git clone --bare with the local .git directory
  const tempBareDir = join(repoDir, ".bare-temp");

  const cloneProc = Bun.spawn(
    ["git", "clone", "--bare", gitDir, tempBareDir],
    { stdout: "pipe", stderr: "pipe" }
  );

  const cloneExitCode = await cloneProc.exited;
  if (cloneExitCode !== 0) {
    const stderr = await new Response(cloneProc.stderr).text();
    throw new Error(`Failed to create bare repository: ${stderr}`);
  }

  // Step 2: Move current working files to a temp location
  console.log(chalk.dim("  Preserving working directory..."));
  const tempWorkDir = join(dirname(repoDir), `.${repoName}-adopt-temp`);

  // Get list of files to move (everything except .git and our temp bare)
  const filesProc = Bun.spawn(
    ["find", ".", "-maxdepth", "1", "-mindepth", "1",
     "!", "-name", ".git",
     "!", "-name", ".bare-temp",
     "-print0"],
    { cwd: repoDir, stdout: "pipe" }
  );
  const filesOutput = await new Response(filesProc.stdout).text();
  const files = filesOutput.split("\0").filter(Boolean).map(f => f.replace("./", ""));

  await Bun.spawn(["mkdir", "-p", tempWorkDir]).exited;

  for (const file of files) {
    if (file && file !== ".git" && file !== ".bare-temp") {
      await Bun.spawn(["mv", join(repoDir, file), tempWorkDir]).exited;
    }
  }

  // Step 3: Replace .git with bare structure
  await Bun.spawn(["rm", "-rf", gitDir]).exited;
  await Bun.spawn(["mv", tempBareDir, bareDir]).exited;

  // Create .git pointer
  await Bun.write(join(repoDir, ".git"), "gitdir: .bare\n");

  // Configure fetch refspec
  await Bun.spawn(
    ["git", "config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"],
    { cwd: repoDir }
  ).exited;

  // Step 4: Create main/ worktree
  console.log(chalk.dim(`  Creating main/ worktree...`));

  const worktreeProc = Bun.spawn(
    ["git", "worktree", "add", "main", currentBranch],
    { cwd: repoDir, stdout: "pipe", stderr: "pipe" }
  );

  const worktreeExitCode = await worktreeProc.exited;
  if (worktreeExitCode !== 0) {
    const stderr = await new Response(worktreeProc.stderr).text();
    // Try to recover
    await Bun.spawn(["rm", "-rf", tempWorkDir]).exited;
    throw new Error(`Failed to create worktree: ${stderr}`);
  }

  // Step 5: Move original files into main/
  console.log(chalk.dim("  Restoring files to main/..."));
  const mainDir = join(repoDir, "main");

  const restoreProc = Bun.spawn(
    ["find", ".", "-maxdepth", "1", "-mindepth", "1", "-print0"],
    { cwd: tempWorkDir, stdout: "pipe" }
  );
  const restoreOutput = await new Response(restoreProc.stdout).text();
  const restoreFiles = restoreOutput.split("\0").filter(Boolean).map(f => f.replace("./", ""));

  for (const file of restoreFiles) {
    if (file) {
      // If file exists in main (e.g., .gitkeep), remove it first
      const destPath = join(mainDir, file);
      await Bun.spawn(["rm", "-rf", destPath]).exited;
      await Bun.spawn(["mv", join(tempWorkDir, file), mainDir]).exited;
    }
  }

  // Clean up temp
  await Bun.spawn(["rm", "-rf", tempWorkDir]).exited;

  // Step 6: Create .workspace/ config
  const workspaceDir = join(repoDir, ".workspace");
  await Bun.spawn(["mkdir", "-p", workspaceDir]).exited;

  const config = createWorkspaceConfig(repoName);

  // If recipes were specified, add them to pending
  if (options.recipes) {
    const recipeNames = options.recipes.split(",").map(r => r.trim()).filter(Boolean);
    console.log(chalk.dim(`  Queuing ${recipeNames.length} recipes...`));

    const resolved = await resolveRecipeDependencies(recipeNames);
    config.pending = resolved;
  }

  await saveWorkspaceConfig(repoDir, config);

  // Create Claude settings in main worktree
  await createClaudeSettings(mainDir);

  // Summary
  console.log();
  console.log(chalk.green("✓") + ` Repository adopted: ${chalk.bold(repoDir)}`);
  console.log();
  console.log(chalk.dim("  New structure:"));
  console.log(chalk.dim(`    ${repoName}/.bare/        # Git database`));
  console.log(chalk.dim(`    ${repoName}/.workspace/   # Config`));
  console.log(chalk.dim(`    ${repoName}/main/         # Working directory`));
  console.log();
  console.log(chalk.dim("  Next steps:"));
  console.log(`    cd main`);

  if (config.pending.length > 0) {
    console.log(`    workspace apply     ${chalk.dim(`# Apply ${config.pending.length} queued recipes`)}`);
  } else {
    console.log(`    workspace add <recipe>`);
    console.log(`    workspace apply`);
  }

  console.log();
}
