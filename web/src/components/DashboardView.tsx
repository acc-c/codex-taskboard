import type { Task, TaskPriority } from "../types";
import { TASK_STATUSES } from "../types";
import { LinearIcon, LinearPriorityIcon, LinearStatusIcon } from "./LinearIcon";
import { STATUS_DETAILS } from "./BoardColumn";

interface DashboardViewProps {
  tasks: Task[];
  onOpenTask: (task: Task) => void;
}
const PRIORITIES: TaskPriority[] = ["urgent", "high", "medium", "low", "none"];
const PRIORITY_LABELS: Record<TaskPriority, string> = {
  none: "无优先级",
  urgent: "紧急",
  high: "高",
  medium: "中",
  low: "低",
};

function isOpen(task: Task) {
  return task.status !== "done" && task.status !== "canceled";
}

function isOverdue(task: Task) {
  return Boolean(task.dueDate && isOpen(task) && task.dueDate < new Date().toISOString().slice(0, 10));
}

function dueSoon(task: Task) {
  if (!task.dueDate || !isOpen(task)) return false;
  const now = Date.now();
  const due = new Date(`${task.dueDate}T12:00:00`).getTime();
  return due >= now - 86_400_000 && due <= now + 7 * 86_400_000;
}

export function DashboardView({ tasks, onOpenTask }: DashboardViewProps) {
  const completed = tasks.filter((task) => task.status === "done").length;
  const open = tasks.filter(isOpen).length;
  const blocked = tasks.filter((task) => task.status === "blocked");
  const overdue = tasks.filter(isOverdue);
  const upcoming = tasks.filter(dueSoon).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "")).slice(0, 8);
  const completion = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  const priorityCounts = PRIORITIES.map((priority) => ({ priority, count: tasks.filter((task) => task.priority === priority).length }));
  const attention = [...blocked, ...overdue.filter((task) => !blocked.some((item) => item.id === task.id))].slice(0, 8);

  return (
    <div className="dashboard-view" aria-label="项目摘要">
      <header className="dashboard-heading">
        <div>
          <span className="dashboard-eyebrow">项目摘要</span>
          <h1>开发进度</h1>
          <p>{tasks.length ? `共 ${tasks.length} 个任务，最近状态一览。` : "当前项目还没有任务。"}</p>
        </div>
        <div className="dashboard-completion" aria-label={`完成度 ${completion}%`}>
          <strong>{completion}%</strong>
          <span>已完成</span>
        </div>
      </header>

      <div className="dashboard-metrics">
        {[
          { label: "全部任务", value: tasks.length, icon: "dashboard" as const },
          { label: "进行中", value: open, icon: "play" as const },
          { label: "已阻塞", value: blocked.length, icon: "alert" as const },
          { label: "已逾期", value: overdue.length, icon: "calendar" as const },
        ].map((metric) => (
          <article className="dashboard-metric" key={metric.label}>
            <span><LinearIcon name={metric.icon} />{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-panel dashboard-status-panel">
          <header><h2>状态分布</h2><span>{completed}/{tasks.length}</span></header>
          <div className="dashboard-status-list">
            {TASK_STATUSES.map((status) => {
              const count = tasks.filter((task) => task.status === status).length;
              return (
                <div className="dashboard-status-row" key={status}>
                  <span><LinearStatusIcon status={status} />{STATUS_DETAILS[status].label}</span>
                  <i><b style={{ width: `${tasks.length ? (count / tasks.length) * 100 : 0}%` }} /></i>
                  <strong>{count}</strong>
                </div>
              );
            })}
          </div>
        </section>

        <section className="dashboard-panel dashboard-priority-panel">
          <header><h2>优先级</h2></header>
          <div className="dashboard-status-list">
            {priorityCounts.map(({ priority, count }) => (
              <div className={`dashboard-status-row priority-${priority}`} key={priority}>
                <span><LinearPriorityIcon priority={priority} />{PRIORITY_LABELS[priority]}</span>
                <i><b style={{ width: `${tasks.length ? (count / tasks.length) * 100 : 0}%` }} /></i>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="dashboard-panel dashboard-attention-panel">
          <header><h2>需要关注</h2><span>{attention.length}</span></header>
          {attention.length ? (
            <div className="dashboard-task-list">
              {attention.map((task) => (
                <button type="button" className="dashboard-task-row" onClick={() => onOpenTask(task)} key={task.id}>
                  <LinearIcon name={task.status === "blocked" ? "alert" : "calendar"} />
                  <span><strong>{task.title}</strong><small>{task.identifier} · {task.status === "blocked" ? "已阻塞" : "已逾期"}</small></span>
                </button>
              ))}
            </div>
          ) : <p className="dashboard-empty">当前没有需要关注的任务。</p>}
        </section>

        <section className="dashboard-panel dashboard-upcoming-panel">
          <header><h2>即将到期</h2><span>7 天</span></header>
          {upcoming.length ? (
            <div className="dashboard-task-list">
              {upcoming.map((task) => (
                <button type="button" className="dashboard-task-row" onClick={() => onOpenTask(task)} key={task.id}>
                  <LinearIcon name="calendar" />
                  <span><strong>{task.title}</strong><small>{task.identifier} · {task.dueDate}</small></span>
                </button>
              ))}
            </div>
          ) : <p className="dashboard-empty">未来 7 天没有到期任务。</p>}
        </section>
      </div>
    </div>
  );
}
