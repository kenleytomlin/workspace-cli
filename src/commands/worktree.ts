import { join, basename } from "path";
import chalk from "chalk";
import type { Context } from "../types";
import { findWorkspaceRoot } from "../lib/paths";
import { loadWorkspaceConfig } from "../lib/config";

interface WorktreeOptions extends Context {
  base?: string;
  branch?: string;
  noDeps?: boolean;
}

export async function worktree(
  args: string[],
  options: WorktreeOptions
): Promise<void> {
  const [subcommand, name] = args;

  switch (subcommand) {
    case "add":
      await worktreeAdd(name, options);
      break;
    case "remove":
    case "rm":
      await worktreeRemove(name, options);
      break;
    case "list":
    case "ls":
      await worktreeList(options);
      break;
    default:
      console.log(`Usage: workspace worktree <add|remove|list> [name]`);
      console.log();
      console.log("Commands:");
      console.log("  add <name> [--base <branch>]   Create a new worktree");
      console.log("  remove <name>                  Remove a worktree");
      console.log("  list                           List all worktrees");
  }
}

async function worktreeAdd(name: string | undefined, options: WorktreeOptions): Promise<void> {
  if (!name) {
    throw new Error("Worktree name required. Usage: workspace worktree add <name>");
  }

  const root = await findWorkspaceRoot(options.cwd);
  if (!root) {
    throw new Error("Not in a workspace.");
  }

  const config = await loadWorkspaceConfig(root);
  const baseBranch = options.base || "main";
  const branchName = options.branch || `worktree/${name}`;
  const wtPath = join(root, name);

  // Check if directory exists
  const checkProc = Bun.spawn(["test", "-d", wtPath]);
  if ((await checkProc.exited) === 0) {
    throw new Error(`Directory already exists: ${wtPath}`);
  }

  console.log(chalk.blue("→") + ` Creating worktree: ${chalk.bold(name)}`);
  console.log(chalk.dim(`  Branch: ${branchName} (from ${baseBranch})`));

  // Check if branch already exists
  const branchCheck = Bun.spawn(
    ["git", "show-ref", "--verify", "--quiet", `refs/heads/${branchName}`],
    { cwd: root }
  );
  const branchExists = (await branchCheck.exited) === 0;

  if (branchExists) {
    // Attach to existing branch
    console.log(chalk.dim("  Attaching to existing branch..."));
    await Bun.spawn(
      ["git", "worktree", "add", wtPath, branchName],
      { cwd: root, stdout: "inherit", stderr: "inherit" }
    ).exited;
  } else {
    // Create new branch from base
    console.log(chalk.dim("  Creating new branch..."));
    await Bun.spawn(
      ["git", "worktree", "add", "-b", branchName, wtPath, baseBranch],
      { cwd: root, stdout: "inherit", stderr: "inherit" }
    ).exited;
  }

  // Copy shared files
  console.log(chalk.dim("  Copying shared files..."));

  // Copy .env if exists at root
  const envPath = join(root, ".env");
  if (await Bun.file(envPath).exists()) {
    await Bun.write(join(wtPath, ".env"), await Bun.file(envPath).text());
  }

  // Install dependencies unless --no-deps
  if (!options.noDeps) {
    console.log(chalk.dim("  Installing dependencies..."));

    // Check for package.json (bun/npm)
    if (await Bun.file(join(wtPath, "package.json")).exists()) {
      await Bun.spawn(["bun", "install"], {
        cwd: wtPath,
        stdout: options.verbose ? "inherit" : "pipe",
        stderr: options.verbose ? "inherit" : "pipe",
      }).exited;
    }

    // Check for pyproject.toml (uv)
    if (await Bun.file(join(wtPath, "pyproject.toml")).exists()) {
      await Bun.spawn(["uv", "sync"], {
        cwd: wtPath,
        stdout: options.verbose ? "inherit" : "pipe",
        stderr: options.verbose ? "inherit" : "pipe",
      }).exited;
    }
  }

  console.log();
  console.log(chalk.green("✓") + ` Worktree created: ${chalk.bold(name)}`);
  console.log(chalk.dim(`  cd ${name}`));
}

async function worktreeRemove(name: string | undefined, options: WorktreeOptions): Promise<void> {
  if (!name) {
    throw new Error("Worktree name required. Usage: workspace worktree remove <name>");
  }

  if (name === "main") {
    throw new Error("Cannot remove the main worktree.");
  }

  const root = await findWorkspaceRoot(options.cwd);
  if (!root) {
    throw new Error("Not in a workspace.");
  }

  const wtPath = join(root, name);

  // Check if worktree exists
  const checkProc = Bun.spawn(["test", "-d", wtPath]);
  if ((await checkProc.exited) !== 0) {
    throw new Error(`Worktree not found: ${wtPath}`);
  }

  // Check for uncommitted changes
  const statusProc = Bun.spawn(
    ["git", "status", "--porcelain"],
    { cwd: wtPath, stdout: "pipe" }
  );
  const statusOutput = await new Response(statusProc.stdout).text();
  await statusProc.exited;

  if (statusOutput.trim()) {
    console.log(chalk.yellow("Warning: Worktree has uncommitted changes!"));
    console.log(chalk.dim(statusOutput));
    // In a real CLI, we'd prompt for confirmation here
  }

  console.log(chalk.blue("→") + ` Removing worktree: ${chalk.bold(name)}`);

  // Get branch name before removing
  const branchProc = Bun.spawn(
    ["git", "branch", "--show-current"],
    { cwd: wtPath, stdout: "pipe" }
  );
  const branchName = (await new Response(branchProc.stdout).text()).trim();
  await branchProc.exited;

  // Remove worktree
  await Bun.spawn(
    ["git", "worktree", "remove", wtPath, "--force"],
    { cwd: root, stdout: "inherit", stderr: "inherit" }
  ).exited;

  console.log(chalk.green("✓") + ` Worktree removed`);

  if (branchName && branchName !== "main") {
    console.log(chalk.dim(`  Branch '${branchName}' still exists. Delete with:`));
    console.log(chalk.dim(`    git branch -d ${branchName}`));
  }
}

async function worktreeList(options: WorktreeOptions): Promise<void> {
  const root = await findWorkspaceRoot(options.cwd);
  if (!root) {
    throw new Error("Not in a workspace.");
  }

  console.log();
  console.log(chalk.bold("Worktrees:"));
  console.log();

  // Run from main/ worktree to ensure git context works
  // (bare repo root needs explicit GIT_DIR or must run from worktree)
  const mainDir = join(root, "main");
  const proc = Bun.spawn(
    ["git", "worktree", "list", "--porcelain"],
    { cwd: mainDir, stdout: "pipe", stderr: "pipe" }
  );

  const output = await new Response(proc.stdout).text();
  await proc.exited;

  let currentPath = "";
  let currentBranch = "";
  let currentCommit = "";

  const worktrees: { name: string; branch: string; commit: string; dirty: boolean }[] = [];

  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      currentPath = line.replace("worktree ", "");
    } else if (line.startsWith("HEAD ")) {
      currentCommit = line.replace("HEAD ", "").slice(0, 7);
    } else if (line.startsWith("branch ")) {
      currentBranch = line.replace("branch refs/heads/", "");
    } else if (line.startsWith("detached")) {
      currentBranch = "(detached)";
    } else if (line === "") {
      if (currentPath && !currentPath.endsWith(".bare")) {
        // Check dirty status
        const statusProc = Bun.spawn(
          ["git", "status", "--porcelain"],
          { cwd: currentPath, stdout: "pipe", stderr: "pipe" }
        );
        const statusOutput = await new Response(statusProc.stdout).text();
        await statusProc.exited;

        worktrees.push({
          name: basename(currentPath),
          branch: currentBranch,
          commit: currentCommit,
          dirty: statusOutput.trim().length > 0,
        });
      }
      currentPath = "";
      currentBranch = "";
      currentCommit = "";
    }
  }

  // Print table
  const nameWidth = Math.max(12, ...worktrees.map((w) => w.name.length));
  const branchWidth = Math.max(10, ...worktrees.map((w) => w.branch.length));

  console.log(
    chalk.dim(
      `  ${"NAME".padEnd(nameWidth)}  ${"BRANCH".padEnd(branchWidth)}  ${"STATUS".padEnd(8)}  COMMIT`
    )
  );

  for (const wt of worktrees) {
    const status = wt.dirty ? chalk.yellow("dirty") : chalk.green("clean");
    console.log(
      `  ${chalk.cyan(wt.name.padEnd(nameWidth))}  ${wt.branch.padEnd(branchWidth)}  ${status.padEnd(8)}  ${chalk.dim(wt.commit)}`
    );
  }

  console.log();
}
