import { createHmac, timingSafeEqual } from "crypto";
import { access } from "fs/promises";
import { spawn } from "child_process";
import type { IncomingMessage, ServerResponse } from "http";
import { z } from "zod";
import { logger } from "../security/logger";

export type GithubWebhookConfig = {
  branch: string;
  deployScriptPath: string;
  path: string;
  repositoryFullName: string;
  secret: string;
  repoDir: string;
};

type GithubPushRepository = {
  full_name?: unknown;
};

type GithubPushPayload = {
  after?: unknown;
  ref?: unknown;
  repository?: GithubPushRepository;
};

let deployQueue = Promise.resolve();

const envSchema = z.object({
  GITHUB_WEBHOOK_SECRET: z.string().trim().min(1).optional(),
  GITHUB_WEBHOOK_PATH: z.string().trim().min(1).default("/webhooks/github"),
  GITHUB_WEBHOOK_BRANCH: z.string().trim().min(1).default("master"),
  GITHUB_WEBHOOK_REPOSITORY: z.string().trim().min(1).default("daviiferrer/99frelaas-mcp-server"),
  DEPLOY_REPO_DIR: z.string().trim().min(1).default("/repo"),
  DEPLOY_SCRIPT_PATH: z.string().trim().min(1).default("/repo/scripts/deploy-vps.sh"),
});

const readRequestBody = async (req: IncomingMessage): Promise<Buffer> =>
  await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("error", reject);
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });

const getHeaderValue = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

export const loadGithubWebhookConfig = (): GithubWebhookConfig | undefined => {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success || !parsed.data.GITHUB_WEBHOOK_SECRET) {
    return undefined;
  }

  return {
    branch: parsed.data.GITHUB_WEBHOOK_BRANCH,
    deployScriptPath: parsed.data.DEPLOY_SCRIPT_PATH,
    path: parsed.data.GITHUB_WEBHOOK_PATH,
    repositoryFullName: parsed.data.GITHUB_WEBHOOK_REPOSITORY,
    secret: parsed.data.GITHUB_WEBHOOK_SECRET,
    repoDir: parsed.data.DEPLOY_REPO_DIR,
  };
};

export const verifyGithubSignature = (
  secret: string,
  body: Buffer,
  signatureHeader: string | undefined,
): boolean => {
  if (!signatureHeader) {
    return false;
  }

  const [prefix, providedSignature] = signatureHeader.split("=", 2);
  if (prefix !== "sha256" || !providedSignature) {
    return false;
  }

  const expectedSignature = createHmac("sha256", secret).update(body).digest("hex");
  const providedBuffer = Buffer.from(providedSignature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
};

export const shouldDeployGithubPush = (
  payload: unknown,
  branch: string,
  repositoryFullName: string,
): boolean => {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const typedPayload = payload as GithubPushPayload;
  const ref = typeof typedPayload.ref === "string" ? typedPayload.ref : "";
  const repoName = typedPayload.repository?.full_name;

  return ref === `refs/heads/${branch}` && repoName === repositoryFullName;
};

const runDeployScript = async (
  config: GithubWebhookConfig,
  sha: string,
): Promise<void> => {
  await access(config.deployScriptPath);
  const child = spawn("/bin/bash", [config.deployScriptPath], {
    cwd: config.repoDir,
    env: {
      ...process.env,
      DEPLOY_DIR: config.repoDir,
      DEPLOY_BRANCH: config.branch,
      GITHUB_SHA: sha,
    },
  });

  let stdout = "";
  let stderr = "";

  const capture = (target: "stdout" | "stderr") => (chunk: Buffer): void => {
    const text = chunk.toString("utf8");
    if (target === "stdout") {
      stdout += text;
    } else {
      stderr += text;
    }
  };

  child.stdout?.on("data", capture("stdout"));
  child.stderr?.on("data", capture("stderr"));

  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`deploy script exited with code ${code ?? -1}`));
    });
  });

  logger.info("webhook.deploy.ok", {
    sha,
    stdout: stdout.slice(-2000),
    stderr: stderr.slice(-2000),
  });
};

const enqueueDeploy = (config: GithubWebhookConfig, sha: string, deliveryId?: string): void => {
  deployQueue = deployQueue
    .then(() => runDeployScript(config, sha))
    .catch((error) => {
      logger.error("webhook.deploy.fail", {
        deliveryId,
        sha,
        error: String(error),
      });
    });
};

export const handleGithubWebhookRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  config: GithubWebhookConfig,
): Promise<void> => {
  if (req.method !== "POST") {
    res.writeHead(405, { allow: "POST" });
    res.end();
    return;
  }

  const eventName = getHeaderValue(req.headers["x-github-event"]);
  const deliveryId = getHeaderValue(req.headers["x-github-delivery"]);
  const signature = getHeaderValue(req.headers["x-hub-signature-256"]);
  const body = await readRequestBody(req);

  if (!verifyGithubSignature(config.secret, body, signature)) {
    res.writeHead(401, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "Invalid signature" }));
    logger.warn("webhook.github.invalid_signature", { deliveryId, eventName });
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body.toString("utf8"));
  } catch (error) {
    res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "Invalid JSON" }));
    logger.warn("webhook.github.invalid_json", { deliveryId, eventName, error: String(error) });
    return;
  }
  if (eventName === "ping") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, event: "ping" }));
    logger.info("webhook.github.ping", { deliveryId });
    return;
  }

  if (eventName !== "push" || !shouldDeployGithubPush(payload, config.branch, config.repositoryFullName)) {
    res.writeHead(204);
    res.end();
    logger.info("webhook.github.ignored", { deliveryId, eventName, branch: config.branch });
    return;
  }

  const typedPayload = payload as GithubPushPayload;
  const sha: string = typeof typedPayload.after === "string" ? typedPayload.after : "local";
  res.writeHead(202, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: true, queued: true, sha }));
  logger.info("webhook.github.accepted", { deliveryId, sha });

  enqueueDeploy(config, sha, deliveryId);
};
