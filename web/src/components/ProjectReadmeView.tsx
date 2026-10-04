import { useEffect, useMemo, useState } from "react";
import { ApiError, getProjectReadme, saveProjectReadme, uploadProjectReadmeAttachment } from "../api";
import type { Project, ProjectReadme, Task } from "../types";
import { LinearIcon } from "./LinearIcon";
import { MarkdownDocument } from "./MarkdownDocument";

interface ProjectReadmeViewProps {
  project: Project;
  tasks: Task[];
  revision?: number;
  onOpenTask: (task: Task) => void;
  onError?: (message: string | null) => void;
}
function localKey(projectId: string) {
  return `taskboard.project-readme.${projectId}`;
}

function localReadme(projectId: string): ProjectReadme {
  const content = window.localStorage.getItem(localKey(projectId)) ?? "";
  return { projectId, content, version: 0, createdAt: null, updatedAt: null };
}

function withTaskReferences(value: string) {
  return value.replace(/(?<![\w-])([A-Z][A-Z0-9]{1,15}-\d+)(?![\w-])/g, "[$1](taskboard://task/$1)");
}

export function ProjectReadmeView({ project, tasks, revision = 0, onOpenTask, onError }: ProjectReadmeViewProps) {
  const [readme, setReadme] = useState<ProjectReadme>(() => localReadme(project.id));
  const [draft, setDraft] = useState(readme.content);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getProjectReadme(project.id)
      .catch((reason) => {
        if (reason instanceof ApiError && [404, 405].includes(reason.status)) return localReadme(project.id);
        throw reason;
      })
      .then((value) => {
        if (!active) return;
        setReadme(value);
        setDraft(value.content);
      })
      .catch((reason) => {
        if (!active) return;
        const message = reason instanceof Error ? reason.message : "项目知识页加载失败";
        setError(message);
        onError?.(message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [onError, project.id, revision]);

  const taskByIdentifier = useMemo(() => new Map(tasks.map((task) => [task.identifier, task])), [tasks]);
  const renderedContent = withTaskReferences(readme.content);

  async function save() {
    if (saving || draft === readme.content) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let updated: ProjectReadme;
      try {
        updated = await saveProjectReadme(project.id, draft, readme.version);
      } catch (reason) {
        if (!(reason instanceof ApiError) || ![404, 405].includes(reason.status)) throw reason;
        updated = {
          ...readme,
          content: draft,
          version: readme.version + 1,
          updatedAt: new Date().toISOString(),
        };
        window.localStorage.setItem(localKey(project.id), draft);
      }
      setReadme(updated);
      setDraft(updated.content);
      setEditing(false);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "项目知识页保存失败";
      setError(message);
      onError?.(message);
    } finally {
      setSaving(false);
    }
  }

  async function upload(file: File) {
    try {
      const attachment = await uploadProjectReadmeAttachment(project.id, file);
      const url = `/api/attachments/${encodeURIComponent(attachment.id)}/content`;
      setDraft((current) => `${current}${current ? "\n\n" : ""}[${attachment.filename}](${url})`);
      setEditing(true);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "附件上传失败";
      setError(message);
      onError?.(message);
    }
  }

  if (loading) return <section className="project-readme-view" aria-busy="true"><p>正在加载项目知识页…</p></section>;

  return (
    <section className="project-readme-view" aria-label="项目知识页">
      <header className="project-readme-header">
        <div>
          <span className="dashboard-eyebrow">项目知识页</span>
          <h1>{project.name}</h1>
          <p>记录架构、启动方式、约定和排障信息，任务可以直接引用。</p>
        </div>
        <div className="project-readme-actions">
          <label className="icon-button" title="添加附件" aria-label="添加附件">
            <LinearIcon name="attachment" />
            <input type="file" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} />
          </label>
          <button className="button secondary" type="button" disabled={saving} onClick={() => { if (editing) void save(); else { setDraft(readme.content); setEditing(true); } }}>
            {editing ? (saving ? "保存中…" : "保存") : "编辑"}
          </button>
          {editing && <button className="button secondary" type="button" disabled={saving} onClick={() => { setDraft(readme.content); setEditing(false); }}>取消</button>}
        </div>
      </header>
      {error && <div className="project-readme-error" role="alert"><LinearIcon name="alert" />{error}</div>}
      {editing ? (
        <textarea className="project-readme-editor" value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck={false} aria-label="项目知识页 Markdown" />
      ) : readme.content ? (
        <div className="project-readme-content">
          <MarkdownDocument
            value={renderedContent}
            onTaskReference={(identifier) => {
              const task = taskByIdentifier.get(identifier);
              if (task) onOpenTask(task);
            }}
          />
        </div>
      ) : (
        <button className="project-readme-empty" type="button" onClick={() => setEditing(true)}>
          <LinearIcon name="file" />
          <strong>添加项目知识</strong>
          <span>写下项目背景、架构、启动命令和常见排障步骤。</span>
        </button>
      )}
    </section>
  );
}
