import assert from "node:assert/strict";
import test from "node:test";
import { parseProtocolLink } from "../electron/protocol-links.mjs";

test("the open link targets the installed STRYKER application", () => {
  assert.deepEqual(parseProtocolLink("stryker://open"), { type: "open" });
  assert.deepEqual(parseProtocolLink("stryker://open/"), { type: "open" });
});

test("install links keep their mod and repository information", () => {
  assert.deepEqual(
    parseProtocolLink("stryker://install/sample-mod?repository=https%3A%2F%2Fmods.example"),
    { type: "install", modId: "sample-mod", repository: "https://mods.example" },
  );
});

test("unknown or incomplete protocol links are ignored", () => {
  assert.equal(parseProtocolLink("https://example.com"), null);
  assert.equal(parseProtocolLink("stryker://unknown"), null);
  assert.equal(parseProtocolLink("stryker://install/missing-repository"), null);
});
