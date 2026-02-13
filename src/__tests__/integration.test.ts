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
      
      const result = await runCli(["worktree", "list"], projectDir);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("main");
    });
  });
});

async function dirExists(path: string): Promise<boolean> {
  const proc = Bun.spawn(["test", "-d", path]);
  return (await proc.exited) === 0;
}
