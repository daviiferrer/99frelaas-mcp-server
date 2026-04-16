const test = require("node:test");
const assert = require("node:assert/strict");

test("public re-exports and tool constants", async () => {
  const register = require("../dist/server/registerTools.js");
  const stdio = require("../dist/transport/stdio.js");
  assert.equal(typeof register.createServer, "function");
  assert.equal(typeof stdio.startStdioServer, "function");

  const constants = [
    require("../dist/tools/auth.importCookies.js").TOOL_AUTH_IMPORT_COOKIES,
    require("../dist/tools/auth.checkSession.js").TOOL_AUTH_CHECK_SESSION,
    require("../dist/tools/auth.clearSession.js").TOOL_AUTH_CLEAR_SESSION,
    require("../dist/tools/profile.getEditState.js").TOOL_PROFILE_GET_EDIT_STATE,
    require("../dist/tools/profile.update.js").TOOL_PROFILE_UPDATE,
    require("../dist/tools/projects.list.js").TOOL_PROJECTS_LIST,
    require("../dist/tools/projects.get.js").TOOL_PROJECTS_GET,
    require("../dist/tools/projects.getBidContext.js").TOOL_PROJECTS_GET_BID_CONTEXT,
    require("../dist/tools/proposals.send.js").TOOL_PROPOSALS_SEND,
    require("../dist/tools/inbox.listConversations.js").TOOL_INBOX_LIST_CONVERSATIONS,
    require("../dist/tools/inbox.getMessages.js").TOOL_INBOX_GET_MESSAGES,
    require("../dist/tools/inbox.sendMessage.js").TOOL_INBOX_SEND_MESSAGE,
    require("../dist/tools/inbox.getDirectoryCounts.js").TOOL_INBOX_GET_DIRECTORY_COUNTS,
    require("../dist/tools/account.getConnections.js").TOOL_ACCOUNT_GET_CONNECTIONS,
    require("../dist/tools/account.getDashboardSummary.js").TOOL_ACCOUNT_GET_DASHBOARD_SUMMARY,
    require("../dist/tools/profiles.get.js").TOOL_PROFILES_GET,
    require("../dist/tools/system.health.js").TOOL_SYSTEM_HEALTH,
  ];
  assert.equal(constants.length, 17);
  assert.equal(constants.includes("system_health"), true);
});

test("index exports build/run", async () => {
  const { buildServer, run } = require("../dist/index.js");
  assert.equal(typeof buildServer, "function");
  assert.equal(typeof run, "function");
});

test("startStdioServer connects transport", async () => {
  const { startStdioServer } = require("../dist/server/createServer.js");
  let called = 0;
  await startStdioServer({
    async connect() {
      called += 1;
    },
  });
  assert.equal(called, 1);
});
