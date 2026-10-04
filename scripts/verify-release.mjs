#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const TASKCTL_PATH = path.resolve(SCRIPT_DIR, "../cli/taskctl.mjs");
const DEFAULT_BASE_URL = "http://127.0.0.1:47823";

export class ReleaseVerificationError extends Error {
  constructor(message, check, details) {
    super(message);
    this.name = "ReleaseVerificationError";
    this.check = check;
    this.details = details;
  }
}
async function fetchJson(baseUrl, pathname, fetchImplementation) {
  let response;
  try {
    response = await fetchImplementation(new URL(pathname, `${baseUrl}/`), {
      headers: { accept: "application/json", "x-taskboard-client": "release-check" },
    });
  } catch (error) {
    throw new ReleaseVerificationError(
      `Cannot reach Taskboard at ${baseUrl}`,
      pathname,
      error instanceof Error ? error.message : String(error),
    );
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ReleaseVerificationError(
      `${pathname} returned HTTP ${response.status}`,
      pathname,
      body,
    );
  }
  return body;
}
function runTaskctl(baseUrl, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TASKCTL_PATH, "project", "list", "--json"], {
      env: { ...env, CODEX_TASKBOARD_URL: baseUrl },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

/**
 * Black-box smoke checks intended to run against the packaged service.
 * These checks deliberately use only public HTTP routes and the taskctl CLI.
 */
export async function verifyRelease({
  baseUrl = process.env.CODEX_TASKBOARD_URL ?? DEFAULT_BASE_URL,
  fetchImplementation = globalThis.fetch,
  runTaskctlCommand = runTaskctl,
} = {}) {
  if (typeof fetchImplementation !== "function") {
    throw new ReleaseVerificationError("fetch is not available", "setup");
  }

  const meta = await fetchJson(baseUrl, "/api/meta", fetchImplementation);
  if (!meta || typeof meta !== "object" || typeof meta.capabilities?.localAiChat !== "boolean") {
    throw new ReleaseVerificationError(
      "Metadata does not expose the local AI capability flag",
      "/api/meta",
      meta,
    );
  }

  const projects = await fetchJson(baseUrl, "/api/projects", fetchImplementation);
  if (!projects || !Array.isArray(projects.projects)) {
    throw new ReleaseVerificationError(
      "Project listing does not expose a projects array",
      "/api/projects",
      projects,
    );
  }

  const taskctl = await runTaskctlCommand(baseUrl);
  if (taskctl.exitCode !== 0) {
    throw new ReleaseVerificationError(
      `taskctl project list exited with ${taskctl.exitCode}`,
      "taskctl project list",
      taskctl.stderr.trim(),
    );
  }
  let taskctlPayload;
  try {
    taskctlPayload = JSON.parse(taskctl.stdout);
  } catch (error) {
    throw new ReleaseVerificationError(
      "taskctl returned invalid JSON",
      "taskctl project list",
      error instanceof Error ? error.message : String(error),
    );
  }
  if (!Array.isArray(taskctlPayload.projects)) {
    throw new ReleaseVerificationError(
      "taskctl project list does not expose a projects array",
      "taskctl project list",
      taskctlPayload,
    );
  }

  return {
    ok: true,
    baseUrl,
    checks: ["GET /api/meta", "GET /api/projects", "taskctl project list --json"],
    projectCount: projects.projects.length,
  };
}

function parseBaseUrl(argv) {
  const index = argv.indexOf("--url");
  if (index === -1) return process.env.CODEX_TASKBOARD_URL ?? DEFAULT_BASE_URL;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error("--url requires a value");
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const report = await verifyRelease({ baseUrl: parseBaseUrl(process.argv.slice(2)) });
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } catch (error) {
    const payload = {
      ok: false,
      error: error instanceof ReleaseVerificationError ? error.message : String(error),
      check: error instanceof ReleaseVerificationError ? error.check : "setup",
      details: error instanceof ReleaseVerificationError ? error.details : undefined,
    };
    process.stderr.write(`${JSON.stringify(payload)}\n`);
    process.exitCode = 1;
  }
}
