import { constants } from "node:fs";
import { access, mkdir, open, readFile, unlink, type FileHandle } from "node:fs/promises";
import path from "node:path";

export type LockRelease = () => void;

export class BrowserProfileBusyError extends Error {
  constructor(lockPath: string) {
    super(`HH browser profile is already in use: ${lockPath}`);
    this.name = "BrowserProfileBusyError";
  }
}

export class BrowserFlowLock {
  #locked = false;

  tryAcquire(): LockRelease | undefined {
    if (this.#locked) return undefined;
    this.#locked = true;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.#locked = false;
      }
    };
  }
}

type LeaseContents = { pid: number; acquiredAt: string };

export class BrowserProfileLease {
  readonly lockPath: string;
  #handle: FileHandle | undefined;

  constructor(profileDir: string) {
    this.lockPath = `${path.resolve(profileDir)}.hh-mcp.lock`;
  }

  async acquire(): Promise<void> {
    if (this.#handle) return;
    await mkdir(path.dirname(this.lockPath), { recursive: true });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const handle = await open(this.lockPath, "wx", 0o600);
        const contents: LeaseContents = { pid: process.pid, acquiredAt: new Date().toISOString() };
        await handle.writeFile(JSON.stringify(contents));
        this.#handle = handle;
        return;
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
        if (!(await this.removeIfStale())) throw new BrowserProfileBusyError(this.lockPath);
      }
    }

    throw new BrowserProfileBusyError(this.lockPath);
  }

  async release(): Promise<void> {
    const handle = this.#handle;
    this.#handle = undefined;
    if (!handle) return;
    await handle.close();
    await unlink(this.lockPath).catch((error: unknown) => {
      if (!isNotFound(error)) throw error;
    });
  }

  private async removeIfStale(): Promise<boolean> {
    try {
      await access(this.lockPath, constants.F_OK);
      const raw = await readFile(this.lockPath, "utf8");
      const contents = JSON.parse(raw) as Partial<LeaseContents>;
      if (typeof contents.pid !== "number" || isProcessAlive(contents.pid)) return false;
      await unlink(this.lockPath);
      return true;
    } catch (error) {
      if (isNotFound(error) || error instanceof SyntaxError) return false;
      throw error;
    }
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function isAlreadyExists(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "EEXIST";
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}
