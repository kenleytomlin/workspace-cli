# @agent-workspace/cli

**Buildpacks for agent-friendly git repos.**

Composable, shareable workspace recipes. Like Heroku buildpacks, but for repository configuration.

## Install

### Homebrew (macOS/Linux)

```bash
brew tap kenleytomlin/tap
brew install workspace
```

### Direct Download

Download the latest binary from [Releases](https://github.com/kenleytomlin/workspace-cli/releases):

```bash
# macOS (Apple Silicon)
curl -L https://github.com/kenleytomlin/workspace-cli/releases/latest/download/workspace-darwin-arm64.tar.gz | tar xz
mv workspace-darwin-arm64 /usr/local/bin/workspace

# macOS (Intel)
curl -L https://github.com/kenleytomlin/workspace-cli/releases/latest/download/workspace-darwin-x64.tar.gz | tar xz
mv workspace-darwin-x64 /usr/local/bin/workspace

# Linux
curl -L https://github.com/kenleytomlin/workspace-cli/releases/latest/download/workspace-linux-x64.tar.gz | tar xz
mv workspace-linux-x64 /usr/local/bin/workspace
```

### From Source

```bash
git clone https://github.com/kenleytomlin/workspace-cli.git
cd workspace-cli
bun install
bun run build
cp dist/workspace /usr/local/bin/
cp -r recipes ~/.workspace/
```

## Quick Start

```bash
# Create a new workspace
workspace init my-project
cd my-project

# Add recipes
workspace add fullstack-ts   # Bun + TypeScript + Vitest + Biome

# Apply pending recipes
workspace apply

# Validate configuration
workspace validate
```

## Why?

Every new repo needs the same boilerplate:
- Testing setup
- Linting/formatting
- TypeScript config
- Agent documentation (AGENTS.md)
- Git configuration

**Workspace recipes** make this composable and shareable:

```bash
workspace add vitest-testing
workspace add biome-linting
workspace add agents-md
workspace apply
```

## Commands

### Workspace Management

```bash
workspace init <name> [--stack <stack>]  # Create workspace
workspace add <recipe>                    # Queue a recipe
workspace apply                           # Apply pending recipes
workspace validate                        # Verify configuration
workspace list                            # List recipes
workspace info                            # Show commands & status
```

### Worktree Management

The workspace uses git's bare-repo + worktree pattern for agent isolation:

```bash
workspace worktree add <name>    # Create isolated worktree
workspace worktree remove <name> # Remove worktree
workspace worktree list          # List all worktrees
```

## Built-in Recipes

| Recipe | Description |
|--------|-------------|
| `bun-runtime` | Bun JavaScript/TypeScript runtime |
| `typescript-strict` | TypeScript with strict mode |
| `vitest-testing` | Vitest test framework |
| `biome-linting` | Biome linter and formatter |
| `agents-md` | AGENTS.md documentation |

### Stacks (Recipe Bundles)

| Stack | Includes |
|-------|----------|
| `fullstack-ts` | bun + typescript + vitest + biome + agents-md |

## Recipe Format

Recipes are YAML manifests:

```yaml
name: my-recipe
version: 1.0.0
description: What it does

# Scope: where the recipe applies
# - "worktree" (default): Applied to current worktree. Changes stay isolated until merged.
# - "workspace": Applied to workspace root. Affects all worktrees immediately.
scope: worktree

requires:
  - bun-runtime

generates:
  - path: some-config.json
    content: |
      { "key": "value" }

commands:
  my-command:
    run: echo "hello"
    description: Does a thing

validates:
  - check: file_exists
    path: some-config.json
    message: Config is missing
```

## Registry (Git-based)

Recipes can be fetched from git repositories — like Homebrew formulas:

```bash
# Default registry (github.com/agent-workspace/recipes)
workspace add vitest-testing

# GitHub shorthand
workspace add github:user/repo/my-recipe

# Full GitHub URL (supports tree paths)
workspace add https://github.com/user/repo/tree/main/recipes/my-recipe

# Local path
workspace add ./my-local-recipe
```

Recipes are cached in `~/.workspace/cache/recipes/`.

## Building

```bash
# Development
bun src/cli.ts init test-project

# Build binary
bun run build

# Build all platforms
bun run build:all
```

## License

MIT
