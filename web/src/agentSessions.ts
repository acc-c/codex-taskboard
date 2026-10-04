export type AgentPlatform = "codex" | "claude" | "pi" | "agy" | "grok";

export function agentPlatformLabel(platform: AgentPlatform): string {
  switch (platform) {
    case "codex": return "Codex";
    case "claude": return "Claude Code";
    case "pi": return "Pi";
    case "agy": return "Google Antigravity";
    case "grok": return "Grok";
  }
}

/** Return a copyable, shell-safe command for resuming an external session. */
export function sessionResumeCommand(platform: AgentPlatform, sessionId: string): string {
  const argument = /^[A-Za-z0-9_./:@+-]+$/.test(sessionId)
    ? sessionId
    : `'${sessionId.replaceAll("'", `'"'"'`)}'`;
  switch (platform) {
    case "codex": return `codex resume ${argument}`;
    case "claude": return `claude --resume ${argument}`;
    case "pi": return `pi --session ${argument}`;
    case "agy": return `agy --conversation ${argument}`;
    case "grok": return `grok --resume ${argument}`;
  }
}
