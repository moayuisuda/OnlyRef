import fs from "fs-extra";
import path from "path";

type AsyncTask<T> = () => Promise<T>;

class KeyedMutex {
  private locks = new Map<string, Promise<void>>();

  async run<T>(key: string, task: AsyncTask<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chain = previous.then(() => current);
    this.locks.set(key, chain);
    await previous;
    try {
      return await task();
    } finally {
      release();
      if (this.locks.get(key) === chain) {
        this.locks.delete(key);
      }
    }
  }
}

const mutex = new KeyedMutex();

const normalizeKey = (target: string): string => {
  if (!target) return "unknown";
  try {
    return path.resolve(target);
  } catch {
    return target;
  }
};

export const withFileLock = async <T>(
  target: string,
  task: AsyncTask<T>
): Promise<T> => {
  return mutex.run(normalizeKey(target), task);
};

export const withFileLocks = async <T>(
  targets: string[],
  task: AsyncTask<T>
): Promise<T> => {
  const keys = Array.from(new Set(targets.map(normalizeKey))).sort();
  const run = async (index: number): Promise<T> => {
    if (index >= keys.length) return task();
    return mutex.run(keys[index], () => run(index + 1));
  };
  return run(0);
};

export const lockedFs = {
  pathExists: (target: string) => withFileLock(target, () => fs.pathExists(target)),
  ensureDir: (target: string) => withFileLock(target, () => fs.ensureDir(target)),
  ensureFile: (target: string) => withFileLock(target, () => fs.ensureFile(target)),
  readJson: <T = unknown>(target: string) =>
    withFileLock(target, () => fs.readJson(target) as Promise<T>),
  writeJson: (target: string, data: unknown) =>
    withFileLock(target, () => fs.writeJson(target, data)),
  readFile: (target: string, options?: unknown) =>
    withFileLock(target, () => fs.readFile(target, options as never)),
  writeFile: (
    target: string,
    data: unknown,
    options?: unknown
  ) =>
    withFileLock(target, () =>
      fs.writeFile(target, data as string | Uint8Array, options as never)
    ),
  appendFile: (target: string, data: unknown) =>
    withFileLock(target, () => fs.appendFile(target, data as string | Uint8Array)),
  readdir: (target: string, options?: unknown) =>
    withFileLock(target, () => fs.readdir(target, options as never)),
  stat: (target: string) => withFileLock(target, () => fs.stat(target)),
  rename: (src: string, dest: string) =>
    withFileLocks([src, dest], () => fs.rename(src, dest)),
  copy: (src: string, dest: string) =>
    withFileLocks([src, dest], () => fs.copy(src, dest)),
  remove: (target: string) => withFileLock(target, () => fs.remove(target)),
  unlink: (target: string) => withFileLock(target, () => fs.unlink(target)),
};
