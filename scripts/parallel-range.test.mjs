import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const bundlePath = path.join(
  projectRoot,
  `.parallel-range-test-${process.pid}.mjs`
);

const results = [];
const test = async (name, fn) => {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.log(`FAIL ${name}: ${error?.message ?? error}`);
  }
};

await build({
  stdin: {
    contents: [
      'export * from "./src/main/services/download/parallel-range-download.ts";',
      'export { configureRangeStateDirectory } from "./src/main/services/download/range-download-state.ts";',
    ].join("\n"),
    resolveDir: projectRoot,
    sourcefile: "parallel-range-test-entry.mjs",
    loader: "ts",
  },
  outfile: bundlePath,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  absWorkingDir: projectRoot,
  logLevel: "silent",
});

const {
  downloadParallelRanges,
  normalizeParallelConnectionCount,
  configureRangeStateDirectory,
  MAX_PARALLEL_CONNECTIONS,
  PARALLEL_RANGE_COUNT,
} = await import(pathToFileURL(bundlePath).href);

const rangeStateRoot = await fs.mkdtemp(
  path.join(os.tmpdir(), "lorro-range-state-")
);
configureRangeStateDirectory(rangeStateRoot);

const payload = randomBytes(1_500_000);
const RANGE_SIZE = 256 * 1024;
const ETAG = '"abc123"';

const server = http.createServer((request, response) => {
  const headers = {
    ETag: ETAG,
    "Accept-Ranges": "bytes",
    "Content-Type": "application/octet-stream",
  };
  const range = request.headers.range;

  if (!range) {
    response.writeHead(200, {
      ...headers,
      "Content-Length": String(payload.length),
    });
    response.end(payload);
    return;
  }

  const match = /^bytes=(\d+)-(\d*)$/.exec(range);
  if (!match) {
    response.writeHead(416, headers);
    response.end();
    return;
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : payload.length - 1;
  const end = Math.min(requestedEnd, payload.length - 1);

  if (start >= payload.length || start > end) {
    response.writeHead(416, {
      ...headers,
      "Content-Range": `bytes */${payload.length}`,
    });
    response.end();
    return;
  }

  const chunk = payload.subarray(start, end + 1);
  response.writeHead(206, {
    ...headers,
    "Content-Range": `bytes ${start}-${end}/${payload.length}`,
    "Content-Length": String(chunk.length),
  });
  response.end(chunk);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/payload.bin`;

const tempRoots = [];

const createFile = async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "lorro-parallel-range-")
  );
  tempRoots.push(root);
  const filePath = path.join(root, "payload.bin");
  await fs.writeFile(filePath, Buffer.alloc(0));
  return filePath;
};

const runDownload = async (connectionCount) => {
  const filePath = await createFile();
  const firstResponse = await fetch(url, {
    headers: { Range: `bytes=0-${RANGE_SIZE - 1}` },
  });
  assert.equal(firstResponse.status, 206);

  const controller = new AbortController();
  const ok = await downloadParallelRanges({
    url,
    headers: {},
    firstResponse,
    filePath,
    startByte: 0,
    total: payload.length,
    rangeSize: RANGE_SIZE,
    connectionCount,
    signal: controller.signal,
    abort: () => controller.abort(),
    beforeChunk: async () => undefined,
    afterChunk: () => undefined,
    onReadPending: () => undefined,
  });

  return { ok, filePath };
};

await test("normalizes out-of-range connection counts", async () => {
  assert.equal(normalizeParallelConnectionCount(64), MAX_PARALLEL_CONNECTIONS);
  assert.equal(
    normalizeParallelConnectionCount(undefined),
    PARALLEL_RANGE_COUNT
  );
  assert.equal(
    normalizeParallelConnectionCount(Number.NaN),
    PARALLEL_RANGE_COUNT
  );
  assert.equal(normalizeParallelConnectionCount(0), 1);
  assert.equal(normalizeParallelConnectionCount(-5), 1);
  assert.equal(MAX_PARALLEL_CONNECTIONS, 32);
});

await test("downloads with the custom-link connection count of 32", async () => {
  const { ok, filePath } = await runDownload(32);
  assert.equal(ok, true);
  assert.deepEqual(await fs.readFile(filePath), payload);
  assert.deepEqual(await fs.readdir(path.dirname(filePath)), ["payload.bin"]);
  assert.deepEqual(await fs.readdir(rangeStateRoot), []);
});

await test("clamps an oversized connection count instead of failing", async () => {
  const { ok, filePath } = await runDownload(4096);
  assert.equal(ok, true);
  assert.deepEqual(await fs.readFile(filePath), payload);
});

await test("downloads with a single connection", async () => {
  const { ok, filePath } = await runDownload(1);
  assert.equal(ok, true);
  assert.deepEqual(await fs.readFile(filePath), payload);
});

server.close();
server.closeAllConnections?.();
await fs.rm(bundlePath, { force: true }).catch(() => undefined);
await fs
  .rm(rangeStateRoot, { recursive: true, force: true })
  .catch(() => undefined);
for (const root of tempRoots) {
  await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
}

const failed = results.filter((result) => !result.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed`
);
if (failed.length > 0) process.exitCode = 1;
