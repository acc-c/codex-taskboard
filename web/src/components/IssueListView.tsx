import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { assigneeTargetForActor } from "../actors";
import { taskConversations, type TaskConversationItem } from "../taskConversations";
import type { ActorIdentity, AiChatThread, Task, TaskDraft, TaskPriority, TaskStatus } from "../types";
import { TASK_PRIORITIES, TASK_STATUSES } from "../types";
import { ActorAvatar } from "./ActorAvatar";
import { STATUS_DETAILS } from "./BoardColumn";
import { LinearIcon, LinearPriorityIcon, LinearStatusIcon } from "./LinearIcon";
import { TaskConversationMenu } from "./TaskConversationMenu";

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  none: "无优先级",
  urgent: "紧急",
  high: "高",
  medium: "中",
  low: "低",
};
const COLLAPSED_BY_DEFAULT = new Set<TaskStatus>(["backlog", "done", "canceled"]);

interface IssueListViewProps {
  tasks: Task[];
  currentUser: ActorIdentity;
  hasActiveFilters: boolean;
  onOpenTask: (task: Task) => void;
  onOpenConversation: (task: Task, conversation: TaskConversationItem) => void;
  aiThreads: AiChatThread[];
  onUpdate: (task: Task, changes: Partial<TaskDraft>) => Promise<Task>;
}
function stopRow(event: MouseEvent | KeyboardEvent) {
  event.stopPropagation();
}

function createdDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(value));
}

function calendarDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

export function IssueListView({ tasks, currentUser, hasActiveFilters, onOpenTask, onOpenConversation, aiThreads, onUpdate }: IssueListViewProps) {
  const [collapsed, setCollapsed] = useState(() => new Set(COLLAPSED_BY_DEFAULT));
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  function toggleStatus(status: TaskStatus) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  async function update(task: Task, changes: Partial<TaskDraft>) {
    setBusyTaskId(task.id);
    try { await onUpdate(task, changes); } finally { setBusyTaskId(null); }
  }

  return (
    <div className="issue-list-view" aria-label="任务列表视图">
      <div className="issue-list-groups">
        {TASK_STATUSES.map((status) => {
          const statusTasks = tasks.filter((task) => task.status === status);
          const isCollapsed = collapsed.has(status);
          const statusLabel = STATUS_DETAILS[status].label;
          return (
            <section className={`issue-list-group status-${status}`} key={status}>
              <button className="issue-list-group-header" type="button" onClick={() => toggleStatus(status)} aria-expanded={!isCollapsed}>
                <LinearIcon name={isCollapsed ? "chevronRight" : "chevronDown"} />
                <span className="issue-list-status-icon"><LinearStatusIcon status={status} /></span>
                <strong>{statusLabel}</strong>
                <span>{statusTasks.length}</span>
              </button>
              {!isCollapsed && (
                <div className="issue-list-rows">
                  {statusTasks.length ? statusTasks.map((task) => {
                    const assigneeTarget = assigneeTargetForActor(task.assignee, currentUser) ?? "current-user";
                    const busy = busyTaskId === task.id;
                    return (
                      <div
                        className={`issue-list-row${busy ? " is-busy" : ""}`}
                        role="button"
                        tabIndex={0}
                        key={task.id}
                        onClick={() => onOpenTask(task)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onOpenTask(task);
                          }
                        }}
                      >
                        <span className="issue-list-title-cell">
                          <small>{task.identifier}</small>
                          <strong>{task.title}</strong>
                          <TaskConversationMenu
                            conversations={taskConversations(task, aiThreads)}
                            onOpenConversation={(conversation) => onOpenConversation(task, conversation)}
                          />
                        </span>
                        <span className="issue-list-metadata" aria-label="任务属性">
                          <label className={`issue-list-select priority-${task.priority}`} onClick={stopRow}>
                            <LinearPriorityIcon priority={task.priority} />
                            <select
                              aria-label={`${task.identifier} 优先级`}
                              value={task.priority}
                              disabled={busy}
                              onChange={(event) => void update(task, { priority: event.target.value as TaskPriority })}
                            >
                              {TASK_PRIORITIES.map((priority) => <option value={priority} key={priority}>{PRIORITY_LABELS[priority]}</option>)}
                            </select>
                          </label>
                          <span className="issue-list-labels">
                            {task.labels.slice(0, 2).map((label) => <i key={label}>{label}</i>)}
                            {task.labels.length > 2 && <b>+{task.labels.length - 2}</b>}
                          </span>
                          {task.dueDate && (
                            <label className="issue-list-date" onClick={stopRow}>
                              <LinearIcon name="calendar" />
                              <span>{calendarDate(task.dueDate)}</span>
                              <input
                                type="date"
                                aria-label={`${task.identifier} 截止日期`}
                                value={task.dueDate}
                                disabled={busy}
                                onChange={(event) => void update(task, {
                                  dueDate: event.target.value || null,
                                  ...(event.target.value ? {} : { recurrence: null }),
                                })}
                              />
                            </label>
                          )}
                          <label className="issue-list-assignee" title={task.assignee.name} onClick={stopRow}>
                            <ActorAvatar actor={task.assignee} />
                            <select
                              aria-label={`${task.identifier} 负责人`}
                              value={assigneeTarget}
                              disabled={busy}
                              onChange={(event) => void update(task, { assigneeTarget: event.target.value as "current-user" | "codex-agent" })}
                            >
                              <option value="current-user">{currentUser.name}</option>
                              <option value="codex-agent">Codex Agent</option>
                            </select>
                          </label>
                        </span>
                        <time dateTime={task.createdAt} title={`创建于 ${new Date(task.createdAt).toLocaleString("zh-CN")}`}>{createdDate(task.createdAt)}</time>
                      </div>
                    );
                  }) : (
                    <div className="issue-list-empty">{hasActiveFilters ? "当前筛选下没有匹配任务" : `没有${statusLabel}任务`}</div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
