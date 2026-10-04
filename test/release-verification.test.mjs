import assert from "node:assert/strict";
import test from "node:test";

import {
  ReleaseVerificationError,
  verifyRelease,
} from "../scripts/verify-release.mjs";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("release verifier checks public metadata, projects, and taskctl output", async () => {
  const paths = [];
  const report = await verifyRelease({
    baseUrl: "http://127.0.0.1:47823",
    fetchImplementation: async (url) => {
      paths.push(url.pathname);
      if (url.pathname === "/api/meta") return response({ capabilities: { localAiChat: true } });
      if (url.pathname === "/api/projects") return response({ projects: [{ id: "local" }] });
      return response({}, 404);
    },
    runTaskctlCommand: async () => ({
      exitCode: 0,
      stdout: JSON.stringify({ projects: [{ id: "local" }], schemaVersion: 2 }),
      stderr: "",
    }),
  });

  assert.equal(report.ok, true);
  assert.equal(report.projectCount, 1);
  assert.deepEqual(paths, ["/api/meta", "/api/projects"]);
});

test("release verifier reports an actionable failed check", async () => {
  await assert.rejects(
    verifyRelease({
      fetchImplementation: async () => response({ capabilities: {} }),
      runTaskctlCommand: async () => ({ exitCode: 0, stdout: "{}", stderr: "" }),
    }),
    (error) => error instanceof ReleaseVerificationError
      && error.check === "/api/meta"
      && /capability flag/.test(error.message),
  );
});
