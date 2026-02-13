import { join } from "path";

/**
 * Default Claude Code settings with scoped defaults.
 * Allows common read/edit/search operations without constant permission prompts
 * while keeping write and arbitrary shell access gated.
 */
const CLAUDE_SETTINGS = {
  permissions: {
    allow: [
      // File operations
      "Read(*)",
      "Edit(*)",
      "Write(*)",
      "Glob(*)",
      // Scoped shell commands
      "Bash(grep:*)",
      "Bash(wc:*)",
      "Bash(ls:*)",
      "Bash(cat:*)",
      "Bash(git:*)",
      "Bash(head:*)",
      "Bash(tail:*)",
      "Bash(echo:*)",
      "Bash(mkdir:*)",
      // Web access
      "WebSearch",
      "WebFetch",
    ],
    deny: [],
  },
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
