import chalk from "chalk";
import type { Context } from "../types";
import { findWorkspaceRoot } from "../lib/paths";
import { loadWorkspaceConfig } from "../lib/config";
import { loadRecipe } from "../lib/recipes";

export async function info(ctx: Context): Promise<void> {
  const root = await findWorkspaceRoot(ctx.cwd);
  if (!root) {
    throw new Error("Not in a workspace. Run 'workspace init' first.");
  }

  const config = await loadWorkspaceConfig(root);
  if (!config) {
    throw new Error("Workspace config not found.");
  }

  console.log();
  console.log(chalk.bold(`Workspace: ${config.name}`));
  console.log(chalk.dim(`  Root: ${root}`));
  console.log(chalk.dim(`  Created: ${config.created_at}`));
  console.log();

  // Collect all commands from installed recipes
  const allCommands: Record<string, { run: string; recipe: string; description?: string }> = {};

  for (const installed of config.recipes) {
    const recipe = await loadRecipe(installed.name, root);
    if (!recipe?.commands) continue;

    for (const [name, cmd] of Object.entries(recipe.commands)) {
      allCommands[name] = {
        run: cmd.run,
        recipe: recipe.name,
        description: cmd.description,
      };
    }
  }

  if (Object.keys(allCommands).length > 0) {
    console.log(chalk.blue("→") + " Available commands:\n");

    // Group by command prefix
    const groups = new Map<string, string[]>();
    for (const name of Object.keys(allCommands)) {
      const [prefix] = name.split(":");
      const list = groups.get(prefix) || [];
      list.push(name);
      groups.set(prefix, list);
    }

    for (const [prefix, names] of groups) {
      if (names.length === 1 && names[0] === prefix) {
        // Single command, no subcommands
        const cmd = allCommands[prefix];
        console.log(`  ${chalk.cyan(prefix)}`);
        console.log(chalk.dim(`    ${cmd.run}`));
        if (cmd.description) {
          console.log(chalk.dim(`    ${cmd.description}`));
        }
      } else {
        // Group with subcommands
        console.log(`  ${chalk.cyan(prefix)}:`);
        for (const name of names) {
          const cmd = allCommands[name];
          const suffix = name === prefix ? "" : name.replace(`${prefix}:`, ":");
          console.log(`    ${chalk.cyan(name.replace(prefix, prefix + (suffix ? "" : "")))} ${chalk.dim(`→ ${cmd.run}`)}`);
        }
      }
      console.log();
    }
  } else {
    console.log(chalk.yellow("No commands available."));
    console.log(chalk.dim("Add recipes to get commands: workspace add <recipe>"));
    console.log();
  }

  // Installed recipes summary
  if (config.recipes.length > 0) {
    console.log(chalk.blue("→") + " Installed recipes:\n");
    for (const installed of config.recipes) {
      console.log(`  ${chalk.green("●")} ${installed.name} ${chalk.dim(`v${installed.version}`)}`);
    }
    console.log();
  }

  // Worktree status
  console.log(chalk.blue("→") + " Worktrees:\n");
  
  const proc = Bun.spawn(["git", "worktree", "list", "--porcelain"], {
    cwd: root,
    stdout: "pipe",
  });
  
  const output = await new Response(proc.stdout).text();
  await proc.exited;

  const worktrees: { path: string; branch: string }[] = [];
  let currentPath = "";
  let currentBranch = "";

  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      currentPath = line.replace("worktree ", "");
    } else if (line.startsWith("branch ")) {
      currentBranch = line.replace("branch refs/heads/", "");
    } else if (line === "") {
      if (currentPath && !currentPath.endsWith(".bare")) {
        worktrees.push({ path: currentPath, branch: currentBranch || "(detached)" });
      }
      currentPath = "";
      currentBranch = "";
    }
  }

  for (const wt of worktrees) {
    const name = wt.path.split("/").pop();
    console.log(`  ${chalk.cyan(name)} ${chalk.dim(`→ ${wt.branch}`)}`);
  }
  console.log();
}
