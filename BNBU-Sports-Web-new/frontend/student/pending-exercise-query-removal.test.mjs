import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sources = [
  new URL("./js/api.js", import.meta.url),
  new URL("./js/screens/checkin.js", import.meta.url),
];

test("student app contains no unfinished exercise query or recovery controls", async () => {
  const text = (await Promise.all(sources.map((source) => readFile(source, "utf8")))).join("\n");
  for (const retiredReference of [
    "/exercise-sessions/recoverable",
    "listRecoverableSessions",
    "recoverableSessions",
    "recoveryNextCursor",
    "checkin.moreRecovery",
    "checkin.recover",
    "待提交运动",
    "Unfinished sessions",
  ]) {
    assert.equal(text.includes(retiredReference), false, `retired reference remains: ${retiredReference}`);
  }
});
