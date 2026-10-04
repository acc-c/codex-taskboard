import type { AiChatRun, AiChatThread, Task } from "./types";

/**
 * A task can have one native Codex thread and any number of local AI threads.
 * Keeping this projection separate from the Task record lets the server retain
 * its backwards-compatible single `threadId` field while the UI can present a
 * complete, sorted conversation list.
 */
export interface TaskConversationItem {
  key: string;
  projectId: string;
  kind: "native" | "local-ai";
  title: string;
  source: "task" | "local-ai";
  nativeThreadId: string | null;
  aiThreadId: string | null;
  updatedAt: string;
  currentRun: AiChatRun | null;
}

export interface TaskConversationSummary {
  conversations: TaskConversationItem[];
  running: TaskConversationItem[];
  latest: TaskConversationItem | null;
}

export function normalizeCodexThreadId(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  return trimmed.replace(/^(?:local|cloud):/i, "").trim();
}

function newerTimestamp(left: string, right: string): string {
  return left >= right ? left : right;
}

function threadActivityUpdatedAt(thread: AiChatThread): string {
  return [thread.updatedAt, thread.currentRun?.startedAt ?? ""].reduce(newerTimestamp, "");
}

export function indexAiThreadsByTask(aiThreads: AiChatThread[]): Map<string, AiChatThread[]> {
  const index = new Map<string, AiChatThread[]>();
  for (const thread of aiThreads) {
    const taskId = thread.origin.issueId;
    if (!taskId) continue;
    const current = index.get(taskId);
    if (current) current.push(thread);
    else index.set(taskId, [thread]);
  }
  return index;
}

function nativeConversation(task: Task): TaskConversationItem | null {
  const threadId = task.threadId?.trim() ?? "";
  if (!threadId) return null;
  return {
    key: `codex:${normalizeCodexThreadId(threadId)}`,
    projectId: task.projectId,
    kind: "native",
    title: task.title,
    source: "task",
    nativeThreadId: threadId,
    aiThreadId: null,
    updatedAt: task.updatedAt,
    currentRun: null,
  };
}

/**
 * Build all conversations associated with a task.
 *
 * Existing tasks only have `threadId`; new AI threads are associated through
 * `origin.issueId`. Threads which resume the same native Codex id are merged
 * into one item, so upgrading does not create duplicate conversation buttons.
 */
export function taskConversations(task: Task, aiThreads: AiChatThread[]): TaskConversationItem[] {
  const items = new Map<string, TaskConversationItem>();
  const native = nativeConversation(task);
  if (native && native.key !== "codex:") items.set(native.key, native);
  const nativeId = normalizeCodexThreadId(task.threadId);

  for (const thread of aiThreads) {
    if (thread.origin.projectId !== task.projectId) continue;
    const threadCodexId = normalizeCodexThreadId(thread.codexThreadId);
    const belongsToTask = thread.origin.issueId === task.id
      || Boolean(nativeId && threadCodexId === nativeId);
    if (!belongsToTask) continue;

    const key = threadCodexId ? `codex:${threadCodexId}` : `ai:${thread.id}`;
    const activity = threadActivityUpdatedAt(thread);
    const current = items.get(key);
    const merged: TaskConversationItem = {
      key,
      projectId: task.projectId,
      kind: "local-ai",
      title: thread.title?.trim() || task.title,
      source: "local-ai",
      nativeThreadId: current?.nativeThreadId ?? thread.codexThreadId,
      aiThreadId: thread.id,
      updatedAt: current ? newerTimestamp(current.updatedAt, activity) : activity,
      currentRun: thread.currentRun ?? null,
    };
    const currentRunning = current?.currentRun?.status === "running";
    const candidateRunning = merged.currentRun?.status === "running";
    // A stale idle snapshot must not hide a currently running conversation
    // when two local records resolve to the same native Codex id.
    if (
      !current
      || (!currentRunning && candidateRunning)
      || (currentRunning === candidateRunning && merged.updatedAt >= current.updatedAt)
    ) items.set(key, merged);
  }

  return [...items.values()].sort(compareConversations);
}

export function compareConversations(left: TaskConversationItem, right: TaskConversationItem): number {
  const leftRunning = left.currentRun?.status === "running" ? 1 : 0;
  const rightRunning = right.currentRun?.status === "running" ? 1 : 0;
  if (leftRunning !== rightRunning) return rightRunning - leftRunning;
  if (left.updatedAt !== right.updatedAt) return right.updatedAt.localeCompare(left.updatedAt);
  return left.key.localeCompare(right.key);
}

export function taskConversationSummary(
  task: Task,
  aiThreads: AiChatThread[],
): TaskConversationSummary {
  const conversations = taskConversations(task, aiThreads);
  const running = conversations.filter((conversation) => conversation.currentRun?.status === "running");
  return {
    conversations,
    running,
    latest: conversations[0] ?? null,
  };
}
