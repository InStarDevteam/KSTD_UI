import { test } from "node:test";
import assert from "node:assert/strict";
import { safeRequestReturnPath } from "./navigation.ts";
void test("request return path preserves local query context but rejects external and alternate routes", () => {
  const path =
    "/requests?q=%ED%95%9C%EA%B8%80&status=submitted&page=2&sort=title_asc";
  assert.equal(safeRequestReturnPath(path), path);
  for (const unsafe of [
    null,
    "https://evil.test/requests",
    "//evil.test/requests",
    "javascript:alert(1)",
    "/requests/1",
    "/requests/../privacy",
    "/privacy",
    "/requests#bad",
  ])
    assert.equal(safeRequestReturnPath(unsafe), "/requests");
});
