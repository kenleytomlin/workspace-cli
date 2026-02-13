import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Integration tests for the workspace CLI.
 * These test that the CLI correctly processes recipes end-to-end.
 */

const CLI = join(import.meta.dir, "../cli.ts");

async function runCli(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", CLI, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  
  const code = await proc.exited;
  return { code, stdout, stderr };
}

describe("CLI Integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `workspace-integration-${Date.now()}`);
    await Bun.spawn(["mkdir", "-p", tempDir]).exited;
  });

  afterEach(async () => {
    await Bun.spawn(["rm", "-rf", tempDir]).exited;
  });

  describe("workspace init", () => {
    it("creates workspace structure", async () => {
      const result = await runCli(["init", "my-project"], tempDir);
      expect(result.code).toBe(0);

      const projectDir = join(tempDir, "my-project");
      
      // Check structure
      expect(await Bun.file(join(projectDir, ".git")).exists()).toBe(true);
      expect(await dirExists(join(projectDir, ".bare"))).toBe(true);
      expect(await dirExists(join(projectDir, ".workspace"))).toBe(true);
      expect(await dirExists(join(projectDir, "main"))).toBe(true);
    });

    it("creates workspace config", async () => {
      await runCli(["init", "test-project"], tempDir);
      
      const configPath = join(tempDir, "test-project", ".workspace", "config.yaml");
      expect(await Bun.file(configPath).exists()).toBe(true);
      
      const content = await Bun.file(configPath).text();
      expect(content).toContain("name: test-project");
    });

    it("queues recipes when using --stack", async () => {
      const result = await runCli(["init", "stack-project", "--stack", "fullstack-ts"], tempDir);
      expect(result.code).toBe(0);
      
      const configPath = join(tempDir, "stack-project", ".workspace", "config.yaml");
      const content = await Bun.file(configPath).text();
      expect(content).toContain("pending:");
      expect(content).toContain("bun-runtime");
    });

    it("creates Claude settings in main worktree", async () => {
      await runCli(["init", "claude-test"], tempDir);
      const projectDir = join(tempDir, "claude-test");
      
      // Check .claude/settings.local.json exists in main/
      const settingsPath = join(projectDir, "main", ".claude", "settings.local.json");
      expect(await Bun.file(settingsPath).exists()).toBe(true);
      
      const content = await Bun.file(settingsPath).text();
      const settings = JSON.parse(content);
      
      // Should have scoped defaults
      expect(settings.permissions).toBeDefined();
      expect(settings.permissions.allow).toContain("Bash(git:*)");
    });
  });

  describe("workspace add", () => {
    it("adds recipe to pending", async () => {
      await runCli(["init", "add-test"], tempDir);
      const projectDir = join(tempDir, "add-test");
      
      const result = await runCli(["add", "bun-runtime"], projectDir);
      expect(result.code).toBe(0);
      
      const configPath = join(projectDir, ".workspace", "config.yaml");
      const content = await Bun.file(configPath).text();
      expect(content).toContain("bun-runtime");
    });

    it("detects already added recipe", async () => {
      await runCli(["init", "dup-test"], tempDir);
      const projectDir = join(tempDir, "dup-test");
      
      await runCli(["add", "bun-runtime"], projectDir);
      const result = await runCli(["add", "bun-runtime"], projectDir);
      
      expect(result.stdout).toContain("already");
    });
  });

  describe("workspace apply", () => {
    it("applies pending recipes to main worktree", async () => {
      await runCli(["init", "apply-test"], tempDir);
      const projectDir = join(tempDir, "apply-test");
      
      await runCli(["add", "bun-runtime"], projectDir);
      const result = await runCli(["apply"], projectDir);
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Applied");
      
      // Check files were created in main/
      const mainDir = join(projectDir, "main");
      expect(await Bun.file(join(mainDir, "package.json")).exists()).toBe(true);
      expect(await Bun.file(join(mainDir, "src/index.ts")).exists()).toBe(true);
    });

    it("applies workspace-scoped recipe to root", async () => {
      await runCli(["init", "scope-test"], tempDir);
      const projectDir = join(tempDir, "scope-test");
      
      await runCli(["add", "shared-env"], projectDir);
      await runCli(["apply"], projectDir);
      
      // shared-env is workspace-scoped, should be at root not main/
      expect(await Bun.file(join(projectDir, ".env.example")).exists()).toBe(true);
      expect(await Bun.file(join(projectDir, "main", ".env.example")).exists()).toBe(false);
    });
  });

  describe("workspace validate", () => {
    it("passes for correctly configured workspace", async () => {
      await runCli(["init", "valid-test"], tempDir);
      const projectDir = join(tempDir, "valid-test");
      
      await runCli(["add", "bun-runtime"], projectDir);
      await runCli(["apply"], projectDir);
      
      const result = await runCli(["validate"], projectDir);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("passed");
    });
  });

  describe("workspace list", () => {
    it("shows available recipes when not in workspace", async () => {
      const result = await runCli(["list"], tempDir);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("bun-runtime");
      expect(result.stdout).toContain("vitest-testing");
    });

    it("shows installed recipes in workspace", async () => {
      await runCli(["init", "list-test"], tempDir);
      const projectDir = join(tempDir, "list-test");
      
      await runCli(["add", "bun-runtime"], projectDir);
      await runCli(["apply"], projectDir);
      
      const result = await runCli(["list"], projectDir);
      expect(result.stdout).toContain("Installed");
      expect(result.stdout).toContain("bun-runtime");
    });
  });

  describe("workspace worktree", () => {
    it("creates new worktree", async () => {
      await runCli(["init", "wt-test"], tempDir);
      const projectDir = join(tempDir, "wt-test");
      
      // Need to commit something first so worktree can branch
      await runCli(["add", "bun-runtime"], projectDir);
      await runCli(["apply"], projectDir);
      
      // Commit in main
      const mainDir = join(projectDir, "main");
      await Bun.spawn(["git", "add", "-A"], { cwd: mainDir }).exited;
      await Bun.spawn(["git", "commit", "-m", "initial"], { cwd: mainDir }).exited;
      
      const result = await runCli(["worktree", "add", "agent-1", "--no-deps"], projectDir);
      expect(result.code).toBe(0);
      
      expect(await dirExists(join(projectDir, "agent-1"))).toBe(true);
    });

    it("lists worktrees", async () => {
      await runCli(["init", "wt-list"], tempDir);
      const projectDir = join(tempDir, "wt-list");
      
      // Verify main/ worktree directory was created
      expect(await dirExists(join(projectDir, "main"))).toBe(true);
      
      // Run list command - just verify it doesn't error
      // (git worktree list behavior varies across platforms)
      const mainDir = join(projectDir, "main");
      const result = await runCli(["worktree", "list"], mainDir);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Worktrees:");
    });
  });
});

async function dirExists(path: string): Promise<boolean> {
  const proc = Bun.spawn(["test", "-d", path]);
  return (await proc.exited) === 0;
}

describe("workspace clone", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `workspace-clone-${Date.now()}`);
    await Bun.spawn(["mkdir", "-p", tempDir]).exited;
  });

  afterEach(async () => {
    await Bun.spawn(["rm", "-rf", tempDir]).exited;
  });

  it("clones a remote repo with workspace structure", async () => {
    // Use a small public repo for testing
    const result = await runCli(
      ["clone", "https://github.com/octocat/Hello-World.git"],
      tempDir
    );
    expect(result.code).toBe(0);

    const projectDir = join(tempDir, "Hello-World");

    // Check workspace structure
    expect(await dirExists(join(projectDir, ".bare"))).toBe(true);
    expect(await Bun.file(join(projectDir, ".git")).exists()).toBe(true);
    expect(await dirExists(join(projectDir, ".workspace"))).toBe(true);
    expect(await dirExists(join(projectDir, "main"))).toBe(true);

    // Check config was created
    const configPath = join(projectDir, ".workspace", "config.yaml");
    expect(await Bun.file(configPath).exists()).toBe(true);
    const content = await Bun.file(configPath).text();
    expect(content).toContain("name: Hello-World");
  });

  it("clones with custom name", async () => {
    const result = await runCli(
      ["clone", "https://github.com/octocat/Hello-World.git", "my-hello"],
      tempDir
    );
    expect(result.code).toBe(0);

    expect(await dirExists(join(tempDir, "my-hello"))).toBe(true);
    expect(await dirExists(join(tempDir, "my-hello", "main"))).toBe(true);
  });

  it("queues recipes when using --recipes", async () => {
    const result = await runCli(
      ["clone", "https://github.com/octocat/Hello-World.git", "--recipes", "agents-md"],
      tempDir
    );
    expect(result.code).toBe(0);

    const configPath = join(tempDir, "Hello-World", ".workspace", "config.yaml");
    const content = await Bun.file(configPath).text();
    expect(content).toContain("pending:");
    expect(content).toContain("agents-md");
  });

  it("creates Claude settings in main worktree", async () => {
    const result = await runCli(
      ["clone", "https://github.com/octocat/Hello-World.git"],
      tempDir
    );
    expect(result.code).toBe(0);

    const settingsPath = join(tempDir, "Hello-World", "main", ".claude", "settings.local.json");
    expect(await Bun.file(settingsPath).exists()).toBe(true);
    
    const content = await Bun.file(settingsPath).text();
    const settings = JSON.parse(content);
    expect(settings.permissions.allow).toContain("Bash(git:*)");
  });
});

describe("workspace adopt", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `workspace-adopt-${Date.now()}`);
    await Bun.spawn(["mkdir", "-p", tempDir]).exited;
  });

  afterEach(async () => {
    await Bun.spawn(["rm", "-rf", tempDir]).exited;
  });

  it("converts existing repo to workspace structure", async () => {
    // Create a normal git repo first
    const repoDir = join(tempDir, "existing-repo");
    await Bun.spawn(["mkdir", "-p", repoDir]).exited;
    await Bun.spawn(["git", "init"], { cwd: repoDir }).exited;
    await Bun.spawn(["git", "config", "user.email", "test@test.com"], { cwd: repoDir }).exited;
    await Bun.spawn(["git", "config", "user.name", "Test"], { cwd: repoDir }).exited;
    
    // Create a file and commit
    await Bun.write(join(repoDir, "README.md"), "# Existing Project");
    await Bun.spawn(["git", "add", "-A"], { cwd: repoDir }).exited;
    await Bun.spawn(["git", "commit", "-m", "initial"], { cwd: repoDir }).exited;

    // Run adopt from inside the repo
    const result = await runCli(["adopt"], repoDir);
    expect(result.code).toBe(0);

    // After adopt, the structure should be transformed
    // repoDir should now be a workspace root with main/ worktree
    expect(await dirExists(join(repoDir, ".bare"))).toBe(true);
    expect(await Bun.file(join(repoDir, ".git")).exists()).toBe(true);
    expect(await dirExists(join(repoDir, ".workspace"))).toBe(true);
    expect(await dirExists(join(repoDir, "main"))).toBe(true);

    // Original file should be in main/
    expect(await Bun.file(join(repoDir, "main", "README.md")).exists()).toBe(true);
    const content = await Bun.file(join(repoDir, "main", "README.md")).text();
    expect(content).toContain("Existing Project");
  });

  it("adds recipes during adopt", async () => {
    const repoDir = join(tempDir, "adopt-recipes");
    await Bun.spawn(["mkdir", "-p", repoDir]).exited;
    await Bun.spawn(["git", "init"], { cwd: repoDir }).exited;
    await Bun.spawn(["git", "config", "user.email", "test@test.com"], { cwd: repoDir }).exited;
    await Bun.spawn(["git", "config", "user.name", "Test"], { cwd: repoDir }).exited;
    await Bun.write(join(repoDir, "index.ts"), "console.log('hello')");
    await Bun.spawn(["git", "add", "-A"], { cwd: repoDir }).exited;
    await Bun.spawn(["git", "commit", "-m", "initial"], { cwd: repoDir }).exited;

    const result = await runCli(["adopt", "--recipes", "agents-md,bun-runtime"], repoDir);
    expect(result.code).toBe(0);

    const configPath = join(repoDir, ".workspace", "config.yaml");
    const content = await Bun.file(configPath).text();
    expect(content).toContain("pending:");
    expect(content).toContain("agents-md");
    expect(content).toContain("bun-runtime");
  });

  it("adopts existing bare-worktree layout", async () => {
    // Simulate a repo already converted to bare-worktree layout
    // (e.g., by scripts or a previous manual setup)
    const repoDir = join(tempDir, "already-bare");
    await Bun.spawn(["mkdir", "-p", repoDir]).exited;

    // Create a standard repo first
    await Bun.spawn(["git", "init"], { cwd: repoDir }).exited;
    await Bun.spawn(["git", "config", "user.email", "test@test.com"], { cwd: repoDir }).exited;
    await Bun.spawn(["git", "config", "user.name", "Test"], { cwd: repoDir }).exited;
    await Bun.write(join(repoDir, "README.md"), "# Already Bare");
    await Bun.spawn(["git", "add", "-A"], { cwd: repoDir }).exited;
    await Bun.spawn(["git", "commit", "-m", "initial"], { cwd: repoDir }).exited;

    // Detect current branch name (may be "master" or "main" depending on git config)
    const branchProc = Bun.spawn(
      ["git", "branch", "--show-current"],
      { cwd: repoDir, stdout: "pipe" }
    );
    const currentBranch = (await new Response(branchProc.stdout).text()).trim();

    // Manually convert to bare-worktree layout (simulating what old scripts did)
    const bareDir = join(repoDir, ".bare-temp");
    await Bun.spawn(
      ["git", "clone", "--bare", join(repoDir, ".git"), bareDir],
      { stdout: "pipe", stderr: "pipe" }
    ).exited;
    await Bun.spawn(["rm", "-rf", join(repoDir, ".git")]).exited;
    await Bun.spawn(["rm", "-f", join(repoDir, "README.md")]).exited;
    await Bun.spawn(["mv", bareDir, join(repoDir, ".bare")]).exited;
    await Bun.write(join(repoDir, ".git"), "gitdir: .bare\n");
    await Bun.spawn(
      ["git", "config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*"],
      { cwd: repoDir }
    ).exited;
    await Bun.spawn(
      ["git", "worktree", "add", "main", currentBranch],
      { cwd: repoDir, stdout: "pipe", stderr: "pipe" }
    ).exited;

    // Verify pre-condition: .git is a file, .bare/ exists, main/ exists
    const gitStat = Bun.spawn(["test", "-f", join(repoDir, ".git")]);
    expect(await gitStat.exited).toBe(0);

    // Now run adopt — it should succeed without re-converting
    const result = await runCli(["adopt"], repoDir);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("bare-worktree");
    expect(result.stdout).toContain("skipping conversion");

    // .workspace/ config should be created
    expect(await dirExists(join(repoDir, ".workspace"))).toBe(true);
    const configPath = join(repoDir, ".workspace", "config.yaml");
    expect(await Bun.file(configPath).exists()).toBe(true);
    const content = await Bun.file(configPath).text();
    expect(content).toContain("name: already-bare");

    // main/ should still work
    expect(await Bun.file(join(repoDir, "main", "README.md")).exists()).toBe(true);
  });

  it("fails on non-git directory", async () => {
    const nonGitDir = join(tempDir, "not-a-repo");
    await Bun.spawn(["mkdir", "-p", nonGitDir]).exited;

    const result = await runCli(["adopt"], nonGitDir);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("not a git repository");
  });

  it("creates Claude settings in main worktree", async () => {
    const repoDir = join(tempDir, "adopt-claude");
    await Bun.spawn(["mkdir", "-p", repoDir]).exited;
    await Bun.spawn(["git", "init"], { cwd: repoDir }).exited;
    await Bun.spawn(["git", "config", "user.email", "test@test.com"], { cwd: repoDir }).exited;
    await Bun.spawn(["git", "config", "user.name", "Test"], { cwd: repoDir }).exited;
    await Bun.write(join(repoDir, "README.md"), "# Test");
    await Bun.spawn(["git", "add", "-A"], { cwd: repoDir }).exited;
    await Bun.spawn(["git", "commit", "-m", "initial"], { cwd: repoDir }).exited;

    const result = await runCli(["adopt"], repoDir);
    expect(result.code).toBe(0);

    const settingsPath = join(repoDir, "main", ".claude", "settings.local.json");
    expect(await Bun.file(settingsPath).exists()).toBe(true);
    
    const content = await Bun.file(settingsPath).text();
    const settings = JSON.parse(content);
    expect(settings.permissions.allow).toContain("Bash(git:*)");
  });

  it("fails on uncommitted changes", async () => {
    const repoDir = join(tempDir, "dirty-repo");
    await Bun.spawn(["mkdir", "-p", repoDir]).exited;
    await Bun.spawn(["git", "init"], { cwd: repoDir }).exited;
    await Bun.spawn(["git", "config", "user.email", "test@test.com"], { cwd: repoDir }).exited;
    await Bun.spawn(["git", "config", "user.name", "Test"], { cwd: repoDir }).exited;
    await Bun.write(join(repoDir, "README.md"), "# Test");
    await Bun.spawn(["git", "add", "-A"], { cwd: repoDir }).exited;
    await Bun.spawn(["git", "commit", "-m", "initial"], { cwd: repoDir }).exited;
    
    // Create uncommitted changes
    await Bun.write(join(repoDir, "dirty.txt"), "uncommitted");

    const result = await runCli(["adopt"], repoDir);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("uncommitted changes");
  });
});
