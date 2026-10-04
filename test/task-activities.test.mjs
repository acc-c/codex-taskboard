import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import { createTaskboardServer } from "../server/index.mjs";
import { parseLabels, parseVersion } from "../shared/api-fields.mjs";
import { parseTaskPatch } from "../shared/task-input.mjs";

const runningApps = [];

afterEach(async () => {
  while (runningApps.length > 0) {
    const { app, directory } = runningApps.pop();
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

async function startServer() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "codex-taskboard-activity-"));
  const app = createTaskboardServer({ dataDirectory: directory });
  const address = await app.listen({ port: 0 });
  runningApps.push({ app, directory });
  return `http://127.0.0.1:${address.port}`;
}

async function request(baseUrl, pathname, options = {}) {
  const headers = new Headers(options.headers);
  if (options.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers,
    body: options.body === undefined || typeof options.body === "string" ? options.body : JSON.stringify(options.body),
  });
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : undefined };
}

test("task mutations persist activities and expose an activity key", async () => {
  const baseUrl = await startServer();
  const created = await request(baseUrl, "/api/tasks", {
    method: "POST",
    body: { projectId: "local", title: "Activity task", status: "todo" },
  });
  assert.equal(created.response.status, 201);
  const initialTask = created.body.task;
  assert.equal(typeof initialTask.activityKey, "string");

  const updated = await request(baseUrl, `/api/tasks/${initialTask.id}`, {
    method: "PATCH",
    body: { version: initialTask.version, title: "Updated activity task" },
  });
  assert.equal(updated.response.status, 200);
  assert.notEqual(updated.body.task.activityKey, initialTask.activityKey);

  const activities = await request(baseUrl, `/api/tasks/${initialTask.id}/activities`);
  assert.equal(activities.response.status, 200);
  assert.equal(activities.body.activities.length, 1);
  assert.deepEqual(activities.body.activities[0].changes, [{
    field: "title",
    before: "Activity task",
    after: "Updated activity task",
  }]);
  assert.equal(activities.body.activities[0].actorId, "local-user");
});

test("shared input validators preserve strict task field rules", () => {
  assert.deepEqual(parseLabels(["backend", "dashi"]), ["backend", "dashi"]);
  assert.equal(parseVersion(2), 2);
  assert.deepEqual(parseTaskPatch({ version: 1, priority: "high" }), {
    version: 1,
    changes: { priority: "high" },
    threadId: undefined,
    assigneeTarget: undefined,
  });
  assert.throws(
    () => parseTaskPatch({ version: 1, unknown: true }),
    (error) => error.code === "UNKNOWN_FIELD",
  );
});

test("project README persists with optimistic versions and attachments", async () => {
  const baseUrl = await startServer();
  const initial = await request(baseUrl, "/api/projects/local/readme");
  assert.equal(initial.response.status, 200);
  assert.equal(initial.body.readme.version, 0);

  const saved = await request(baseUrl, "/api/projects/local/readme", {
    method: "PUT",
    body: { version: 0, content: "# Local project\n\nArchitecture notes" },
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.body.readme.version, 1);

  const conflict = await request(baseUrl, "/api/projects/local/readme", {
    method: "PUT",
    body: { version: 0, content: "stale" },
  });
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.body.error.code, "VERSION_CONFLICT");

  const uploaded = await request(baseUrl, "/api/projects/local/readme/attachments", {
    method: "POST",
    headers: {
      "content-type": "text/plain",
      "x-taskboard-filename": encodeURIComponent("architecture.txt"),
    },
    body: "diagram notes",
  });
  assert.equal(uploaded.response.status, 201);
  const attachmentId = uploaded.body.attachment.id;
  const listed = await request(baseUrl, "/api/projects/local/readme/attachments");
  assert.equal(listed.body.attachments.length, 1);
  const content = await fetch(`${baseUrl}/api/attachments/${encodeURIComponent(attachmentId)}/content`);
  assert.equal(content.status, 200);
  assert.equal(await content.text(), "diagram notes");
});
