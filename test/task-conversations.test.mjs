import assert from "node:assert/strict";
import test from "node:test";

import {
  indexAiThreadsByTask,
  normalizeCodexThreadId,
  taskConversationSummary,
  taskConversations,
} from "../web/src/taskConversations.ts";
import { agentPlatformLabel, sessionResumeCommand } from "../web/src/agentSessions.ts";

function task(overrides = {}) {
  return {
    id: "task-1",
    projectId: "project-1",
    title: "Investigate release",
    threadId: "local:native-1",
    updatedAt: "2026-10-04T10:00:00.000Z",
    ...overrides,
  };
}

function aiThread(overrides = {}) {
  return {
    id: "ai-1",
    title: "分析实现",
    status: "idle",
    origin: { projectId: "project-1", issueId: "task-1" },
    codexThreadId: null,
    model: "gpt",
    reasoningEffort: "medium",
    sandbox: "read-only",
    createdAt: "2026-10-04T10:01:00.000Z",
    updatedAt: "2026-10-04T10:02:00.000Z",
    ...overrides,
  };
}

test("normalizes local/cloud prefixes without changing opaque ids", () => {
  assert.equal(normalizeCodexThreadId(" local:native-1 "), "native-1");
  assert.equal(normalizeCodexThreadId("cloud:native-2"), "native-2");
  assert.equal(normalizeCodexThreadId("opaque/session"), "opaque/session");
});

test("derives native and multiple AI conversations and sorts running first", () => {
  const conversations = taskConversations(task(), [
    aiThread({ id: "ai-old", title: "旧分析", updatedAt: "2026-10-04T09:00:00.000Z" }),
    aiThread({
      id: "ai-running",
      title: "测试",
      updatedAt: "2026-10-04T09:30:00.000Z",
      currentRun: { id: "run-1", threadId: "ai-running", status: "running", startedAt: "2026-10-04T09:31:00.000Z" },
    }),
    aiThread({ id: "other", origin: { projectId: "project-1", issueId: "other-task" } }),
  ]);

  assert.deepEqual(conversations.map((item) => item.key), [
    "ai:ai-running",
    "codex:native-1",
    "ai:ai-old",
  ]);
  assert.equal(conversations[0].currentRun.status, "running");
});

test("merges an AI thread that resumes the task's native Codex id", () => {
  const conversations = taskConversations(task(), [
    aiThread({ id: "ai-native", codexThreadId: "cloud:native-1" }),
  ]);
  assert.equal(conversations.length, 1);
  assert.equal(conversations[0].key, "codex:native-1");
  assert.equal(conversations[0].aiThreadId, "ai-native");
  assert.equal(conversations[0].nativeThreadId, "local:native-1");
});

test("does not let a newer idle duplicate hide a running native conversation", () => {
  const conversations = taskConversations(task({ threadId: null }), [
    aiThread({
      id: "ai-running",
      codexThreadId: "native-1",
      updatedAt: "2026-10-04T09:00:00.000Z",
      currentRun: { id: "run-1", threadId: "ai-running", status: "running" },
    }),
    aiThread({
      id: "ai-idle",
      codexThreadId: "native-1",
      updatedAt: "2026-10-04T11:00:00.000Z",
      currentRun: null,
    }),
  ]);
  assert.equal(conversations.length, 1);
  assert.equal(conversations[0].aiThreadId, "ai-running");
  assert.equal(conversations[0].currentRun?.status, "running");
});

test("summary exposes running and latest projections and indexes linked threads", () => {
  const threads = [aiThread(), aiThread({ id: "unlinked", origin: { projectId: "project-1", issueId: "other" } })];
  assert.deepEqual([...indexAiThreadsByTask(threads).keys()], ["task-1", "other"]);
  const summary = taskConversationSummary(task({ threadId: null }), [
    aiThread({ currentRun: { id: "run-1", threadId: "ai-1", status: "running" } }),
  ]);
  assert.equal(summary.conversations.length, 1);
  assert.equal(summary.running.length, 1);
  assert.equal(summary.latest?.aiThreadId, "ai-1");
});

test("external session resume commands quote opaque ids", () => {
  assert.equal(agentPlatformLabel("codex"), "Codex");
  assert.equal(sessionResumeCommand("codex", "session-1"), "codex resume session-1");
  assert.equal(sessionResumeCommand("claude", "id with space"), `claude --resume 'id with space'`);
});
