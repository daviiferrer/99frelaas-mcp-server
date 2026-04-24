const test = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");

test("github webhook signature verification accepts a valid sha256 signature", () => {
  const { verifyGithubSignature } = require("../dist/deploy/githubWebhook.js");
  const secret = "super-secret";
  const body = Buffer.from('{"ref":"refs/heads/master"}', "utf8");
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  assert.equal(verifyGithubSignature(secret, body, signature), true);
});

test("github webhook signature verification rejects invalid signatures", () => {
  const { verifyGithubSignature } = require("../dist/deploy/githubWebhook.js");
  const body = Buffer.from('{"ref":"refs/heads/master"}', "utf8");

  assert.equal(verifyGithubSignature("secret", body, "sha256=deadbeef"), false);
  assert.equal(verifyGithubSignature("secret", body, undefined), false);
});

test("github push filter requires the expected branch and repository", () => {
  const { shouldDeployGithubPush } = require("../dist/deploy/githubWebhook.js");
  const payload = {
    ref: "refs/heads/master",
    repository: { full_name: "daviiferrer/99frelaas-mcp-server" },
  };

  assert.equal(
    shouldDeployGithubPush(payload, "master", "daviiferrer/99frelaas-mcp-server"),
    true,
  );
  assert.equal(shouldDeployGithubPush(payload, "develop", "daviiferrer/99frelaas-mcp-server"), false);
  assert.equal(shouldDeployGithubPush(payload, "master", "other/repo"), false);
});
