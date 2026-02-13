import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import {
  createWorkspaceConfig,
  loadWorkspaceConfig,
  saveWorkspaceConfig,
} from "../lib/config";

describe("config", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `workspace-test-${Date.now()}`);
    await Bun.spawn(["mkdir", "-p", tempDir]).exited;
  });

  afterEach(async () => {
    await Bun.spawn(["rm", "-rf", tempDir]).exited;
  });

  describe("createWorkspaceConfig", () => {
    it("creates config with correct name", () => {
      const config = createWorkspaceConfig("my-project");
      expect(config.name).toBe("my-project");
    });

    it("creates config with timestamp", () => {
      const config = createWorkspaceConfig("test");
      expect(config.created_at).toBeDefined();
      expect(new Date(config.created_at).getTime()).toBeGreaterThan(0);
    });

    it("creates config with empty recipes", () => {
      const config = createWorkspaceConfig("test");
      expect(config.recipes).toEqual([]);
    });

    it("creates config with empty pending", () => {
      const config = createWorkspaceConfig("test");
      expect(config.pending).toEqual([]);
    });

    it("creates config with empty variables", () => {
      const config = createWorkspaceConfig("test");
      expect(config.variables).toEqual({});
    });
  });

  describe("saveWorkspaceConfig / loadWorkspaceConfig", () => {
    it("saves and loads config", async () => {
      const config = createWorkspaceConfig("test-project");
      config.pending = ["bun-runtime", "vitest-testing"];
      config.variables = { "vitest-testing": { coverage_threshold: 90 } };

      await saveWorkspaceConfig(tempDir, config);
      const loaded = await loadWorkspaceConfig(tempDir);

      expect(loaded).not.toBeNull();
      expect(loaded?.name).toBe("test-project");
      expect(loaded?.pending).toEqual(["bun-runtime", "vitest-testing"]);
      expect(loaded?.variables["vitest-testing"]).toEqual({ coverage_threshold: 90 });
    });

    it("creates .workspace directory if missing", async () => {
      const config = createWorkspaceConfig("test");
      await saveWorkspaceConfig(tempDir, config);

      const exists = await Bun.file(join(tempDir, ".workspace/config.yaml")).exists();
      expect(exists).toBe(true);
    });

    it("returns null for non-existent config", async () => {
      const loaded = await loadWorkspaceConfig(tempDir);
      expect(loaded).toBeNull();
    });
  });
});
