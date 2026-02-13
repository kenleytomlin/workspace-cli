import { join } from "path";

/**
 * Default Claude Code settings with permissive defaults.
 * These allow the agent to work without constant permission prompts.
 */
const CLAUDE_SETTINGS = {
  permissions: {
    allow: [
      // File operations
      "Read(*)",
      "Edit(*)",
      "Write(*)",
      // All shell commands
      "Bash(*)",
      // Web access
      "WebSearch",
      "WebFetch"
    ],
    deny: []
  }
};

/**
 * Create .claude/settings.local.json in the specified directory.
 * Does not overwrite existing settings.
 */
export async function createClaudeSettings(dir: string): Promise<void> {
  const claudeDir = join(dir, ".claude");
  const settingsPath = join(claudeDir, "settings.local.json");
  
  // Check if settings already exist
  const exists = await Bun.file(settingsPath).exists();
  if (exists) {
    return; // Don't overwrite existing settings
  }
  
  // Create .claude directory
  await Bun.spawn(["mkdir", "-p", claudeDir]).exited;
  
  // Write settings
  await Bun.write(settingsPath, JSON.stringify(CLAUDE_SETTINGS, null, 2) + "\n");
}
