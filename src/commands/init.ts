import { join } from "path";
import chalk from "chalk";
import type { Context } from "../types";
import { createWorkspaceConfig, saveWorkspaceConfig } from "../lib/config";
import { loadStack, resolveRecipeDependencies } from "../lib/recipes";
import { createClaudeSettings } from "../lib/claude";

interface InitOptions extends Context {
  stack?: string;
}

export async function init(name: string | undefined, options: InitOptions): Promise<void> {
  if (!name) {
    throw new Error("Project name required. Usage: workspace init <name>");
  }

  const projectPath = join(options.cwd, name);

  // Check if directory already exists
  const proc = Bun.spawn(["test", "-d", projectPath]);
  if ((await proc.exited) === 0) {
    throw new Error(`Directory already exists: ${projectPath}`);
  }

  console.log(chalk.blue("→") + ` Creating workspace: ${chalk.bold(name)}`);

  // Create project directory
  await Bun.spawn(["mkdir", "-p", projectPath]).exited;

  // Initialize bare repo structure
  console.log(chalk.dim("  Setting up git (bare repo + worktree)..."));

  // Create .bare directory
  const bareDir = join(projectPath, ".bare");
  await Bun.spawn(["git", "init", "--bare", bareDir]).exited;

  // Create .git pointer file
  await Bun.write(join(projectPath, ".git"), "gitdir: .bare\n");

  // Configure fetch refspec
  await Bun.spawn(
    ["git", "config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"],
    { cwd: projectPath }
  ).exited;

  // Create initial commit in a temp location, then create main worktree
  const tempDir = join(projectPath, ".init-temp");
  await Bun.spawn(["mkdir", "-p", tempDir]).exited;
  await Bun.spawn(["git", "clone", bareDir, tempDir]).exited;
  
  // Rename branch to main and create initial commit
  await Bun.spawn(["git", "checkout", "-b", "main"], { cwd: tempDir }).exited;
  await Bun.write(join(tempDir, ".gitkeep"), "");
  await Bun.spawn(["git", "add", "."], { cwd: tempDir }).exited;
  await Bun.spawn(
    ["git", "commit", "-m", "Initial commit"],
    { cwd: tempDir }
  ).exited;
  await Bun.spawn(["git", "push", "-u", "origin", "main"], { cwd: tempDir }).exited;
  
  // Set HEAD to main in the bare repo
  await Bun.spawn(
    ["git", "symbolic-ref", "HEAD", "refs/heads/main"],
    { cwd: bareDir }
  ).exited;
  
  // Clean up temp
  await Bun.spawn(["rm", "-rf", tempDir]).exited;

  // Create main/ worktree
  console.log(chalk.dim("  Creating main/ worktree..."));
  await Bun.spawn(
    ["git", "worktree", "add", "main", "main"],
    { cwd: projectPath }
  ).exited;

  // Create .workspace/ config directory
  const workspaceDir = join(projectPath, ".workspace");
  await Bun.spawn(["mkdir", "-p", workspaceDir]).exited;

  // Initialize workspace config
  const config = createWorkspaceConfig(name);
  
  // If a stack was specified, add its recipes to pending
  if (options.stack) {
    console.log(chalk.dim(`  Loading stack: ${options.stack}...`));
    
    const stack = await loadStack(options.stack);
    if (!stack) {
      throw new Error(`Stack not found: ${options.stack}`);
    }

    // Resolve dependencies and add to pending
    const resolved = await resolveRecipeDependencies(stack.includes);
    config.pending = resolved;

    // Apply stack defaults
    if (stack.defaults) {
      config.variables = stack.defaults;
    }

    console.log(chalk.dim(`  Queued ${resolved.length} recipes from stack`));
  }

  await saveWorkspaceConfig(projectPath, config);

  // Create basic structure in main/
  const mainDir = join(projectPath, "main");
  await Bun.write(join(mainDir, ".gitignore"), `# Dependencies
node_modules/
.venv/

# Build
dist/
build/

# Environment
.env
.env.local

# IDE
.idea/
.vscode/

# OS
.DS_Store
`);

  await Bun.write(join(mainDir, "README.md"), `# ${name}

This workspace was created with \`workspace init\`.

## Structure

\`\`\`
${name}/
├── .bare/          # Git database (bare repo)
├── .git            # Pointer to .bare
├── .workspace/     # Workspace config & recipes
└── main/           # Main branch worktree
\`\`\`

## Commands

\`\`\`bash
# Add recipes
workspace add <recipe-name>
workspace apply

# Manage worktrees
workspace worktree add <name>
workspace worktree list

# Validate setup
workspace validate
\`\`\`
`);

  // Create Claude settings with permissive defaults
  await createClaudeSettings(mainDir);

  // Commit the initial structure
  await Bun.spawn(["git", "add", "."], { cwd: mainDir }).exited;
  await Bun.spawn(
    ["git", "commit", "-m", "chore: workspace init"],
    { cwd: mainDir }
  ).exited;

  // Summary
  console.log();
  console.log(chalk.green("✓") + ` Workspace created: ${chalk.bold(projectPath)}`);
  console.log();
  console.log(chalk.dim("  Next steps:"));
  console.log(`    cd ${name}`);
  
  if (config.pending.length > 0) {
    console.log(`    workspace apply     ${chalk.dim(`# Apply ${config.pending.length} queued recipes`)}`);
  } else {
    console.log(`    workspace add <recipe>`);
    console.log(`    workspace apply`);
  }
  
  console.log();
}
