import { test } from "node:test";
import assert from "node:assert/strict";
import { safeSpreadsheetCell, makeCsv } from "./export.ts";
void test("formula injection is neutralized including leading control characters", () => {
  for (const v of [
    "=1+1",
    "+CMD",
    "-12",
    "@SUM(A1)",
    '\t=HYPERLINK("https://example.test")',
    "\r\n=1",
  ])
    assert.equal(safeSpreadsheetCell(v), `'${v}`);
  assert.equal(safeSpreadsheetCell("정상 한글"), "정상 한글");
});
void test("CSV preserves Korean, quotes and embedded newlines in quoted fields", () => {
  assert.equal(
    makeCsv([{ id: "한글", text: '첫줄\n"두번째"' }]),
    '\uFEFF"id","text"\r\n"한글","첫줄\n""두번째"""',
  );
});
void test("large export keeps every data row and does not evaluate formulas", () => {
  const rows = Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    text: i === 9999 ? "=2+2" : "한글",
  }));
  const csv = makeCsv(rows);
  assert.ok(csv.endsWith('"9999","\'=2+2"'));
  assert.equal(csv.split("\r\n").length, 10001);
});
