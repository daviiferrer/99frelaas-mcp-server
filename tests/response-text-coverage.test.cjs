const test = require("node:test");
const assert = require("node:assert/strict");

test("response text fallback branches", async () => {
  const { readResponseText } = require("../dist/clients/responseText.js");

  const encoder = new TextEncoder();

  const noContentType = await readResponseText({
    headers: { get: () => null },
    arrayBuffer: async () => encoder.encode("Fallback").buffer,
  });
  assert.equal(noContentType, "Fallback");

  const invalidCharset = await readResponseText({
    headers: { get: () => "text/plain; charset=not-a-real-charset" },
    arrayBuffer: async () => encoder.encode("Fallback").buffer,
  });
  assert.equal(invalidCharset, "Fallback");
});
