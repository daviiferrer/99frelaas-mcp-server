import { spawn, type ChildProcess } from "child_process";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";
import net from "net";
import { tmpdir } from "os";
import { join } from "path";

type LaunchChromeResult = {
  process: ChildProcess;
  endpointURL: string;
  port: number;
  userDataDir: string;
};

const DEFAULT_EXE_CANDIDATES = [
  process.env.CHROME_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter((value): value is string => Boolean(value));

const BASE_URL = process.env.NINETY_NINE_BASE_URL ?? "https://www.99freelas.com.br";
const DEFAULT_START_URL = process.env.CHROME_START_URL ?? `${BASE_URL}/login`;

const getFreePort = async (): Promise<number> =>
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "object" && address) {
      const port = address.port;
      server.close(() => resolve(port));
      return;
    }
      /* c8 ignore next */
      reject(new Error("Unable to allocate a free port"));
    });
  });

const resolveChromeExecutable = (): string => {
  for (const candidate of DEFAULT_EXE_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error("CHROME_EXECUTABLE_PATH is not set and Chrome/Edge was not found");
};

export const launchChromeWithRemoteDebug = async (input?: {
  executablePath?: string;
  userDataDir?: string;
  port?: number;
}): Promise<LaunchChromeResult> => {
  const executablePath = input?.executablePath ?? resolveChromeExecutable();
  const envPort = Number(process.env.CHROME_REMOTE_DEBUG_PORT ?? "");
  const port = input?.port ?? (Number.isFinite(envPort) && envPort > 0 ? envPort : await getFreePort());
  const userDataDir =
    input?.userDataDir ??
    process.env.CHROME_USER_DATA_DIR ??
    join(tmpdir(), "99freelas-mcp-chrome-profile");

  await mkdir(userDataDir, { recursive: true });

  const child = spawn(
    executablePath,
    [
      `--remote-debugging-port=${port}`,
      "--remote-debugging-address=127.0.0.1",
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      DEFAULT_START_URL,
    ],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    },
  );

  child.unref();
  return {
    process: child,
    endpointURL: `http://127.0.0.1:${port}`,
    port,
    userDataDir,
  };
};
