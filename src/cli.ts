#!/usr/bin/env bun

import { parseArgs } from "util";
import chalk from "chalk";

import { init } from "./commands/init";
import { add } from "./commands/add";
import { apply } from "./commands/apply";
import { validate } from "./commands/validate";
import { list } from "./commands/list";
import { worktree } from "./commands/worktree";
import { info } from "./commands/info";
import { test } from "./commands/test";

const VERSION = "0.1.0";

const HELP = `
${chalk.bold("workspace")} — Buildpacks for agent-friendly git repos

${chalk.dim("Usage:")}
  workspace <command> [options]

${chalk.dim("Commands:")}
  ${chalk.cyan("init")} <name> [--stack <stack>]    Create a new workspace
  ${chalk.cyan("add")} <recipe>                     Add a recipe to the workspace
  ${chalk.cyan("apply")}                            Apply all pending recipes
  ${chalk.cyan("validate")}                         Validate workspace configuration
  ${chalk.cyan("list")}                             List installed recipes
  ${chalk.cyan("info")}                             Show workspace info & commands
  ${chalk.cyan("test")} <recipe>                    Run recipe's test suite
  
  ${chalk.cyan("worktree")} add <name> [--base <branch>]
  ${chalk.cyan("worktree")} remove <name>
  ${chalk.cyan("worktree")} list

${chalk.dim("Options:")}
  -h, --help       Show this help
  -v, --version    Show version
  --verbose        Verbose output

${chalk.dim("Examples:")}
  workspace init my-project --stack fullstack-ts
  workspace add vitest-testing
  workspace apply
  workspace worktree add agent-1
`;

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      verbose: { type: "boolean" },
      stack: { type: "string" },
      base: { type: "string" },
      branch: { type: "string" },
      "no-deps": { type: "boolean" },
    },
    allowPositionals: true,
  });

  if (values.version) {
    console.log(`workspace v${VERSION}`);
    process.exit(0);
  }

  const [command, ...rest] = positionals;

  if (values.help || !command) {
    console.log(HELP);
    process.exit(0);
  }

  const ctx = {
    verbose: values.verbose ?? false,
    cwd: process.cwd(),
  };

  try {
    switch (command) {
      case "init":
        await init(rest[0], { stack: values.stack, ...ctx });
        break;

      case "add":
        if (!rest[0]) {
          console.error(chalk.red("Error: Recipe name required"));
          console.log("Usage: workspace add <recipe>");
          process.exit(1);
        }
        await add(rest[0], ctx);
        break;

      case "apply":
        await apply(ctx);
        break;

      case "validate":
        await validate(ctx);
        break;

      case "list":
        await list(ctx);
        break;

      case "info":
        await info(ctx);
        break;

      case "test":
        await test(rest[0], ctx);
        break;

      case "worktree":
      case "wt":
        await worktree(rest, {
          base: values.base,
          branch: values.branch,
          noDeps: values["no-deps"],
          ...ctx,
        });
        break;

      default:
        console.error(chalk.red(`Unknown command: ${command}`));
        console.log("Run 'workspace --help' for usage.");
        process.exit(1);
    }
  } catch (err) {
    if (ctx.verbose && err instanceof Error) {
      console.error(chalk.red("Error:"), err.message);
      console.error(chalk.dim(err.stack));
    } else if (err instanceof Error) {
      console.error(chalk.red("Error:"), err.message);
    } else {
      console.error(chalk.red("Error:"), err);
    }
    process.exit(1);
  }
}

main();
