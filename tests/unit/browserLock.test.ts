import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BrowserFlowLock,
  BrowserProfileBusyError,
  BrowserProfileLease,
} from "../../src/browser/BrowserLock.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("BrowserFlowLock", () => {
  it("returns BUSY semantics until the current owner releases", () => {
    const lock = new BrowserFlowLock();
    const release = lock.tryAcquire();
    expect(release).toBeTypeOf("function");
    expect(lock.tryAcquire()).toBeUndefined();
    release?.();
    expect(lock.tryAcquire()).toBeTypeOf("function");
  });
});

describe("BrowserProfileLease", () => {
  it("prevents a second process lease", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "hh-mcp-lock-"));
    tempDirs.push(dir);
    const first = new BrowserProfileLease(path.join(dir, "profile"));
    const second = new BrowserProfileLease(path.join(dir, "profile"));
    await first.acquire();
    await expect(second.acquire()).rejects.toBeInstanceOf(BrowserProfileBusyError);
    await first.release();
    await expect(second.acquire()).resolves.toBeUndefined();
    await second.release();
  });

  it("recovers a stale PID lock", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "hh-mcp-lock-"));
    tempDirs.push(dir);
    const lease = new BrowserProfileLease(path.join(dir, "profile"));
    await writeFile(lease.lockPath, JSON.stringify({ pid: 999_999_999, acquiredAt: "old" }));
    await expect(lease.acquire()).resolves.toBeUndefined();
    await lease.release();
  });
});
