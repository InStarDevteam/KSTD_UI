/** Excel / spreadsheet import must not interpret exported untrusted text as formulas. */
export function safeSpreadsheetCell(value: unknown): string {
  const raw = typeof value === "string" ? value : (JSON.stringify(value) ?? "");
  let first = 0;
  while (
    first < raw.length &&
    (raw.charCodeAt(first) <= 32 || /\s/u.test(raw.charAt(first)))
  )
    first += 1;
  return /^[=+\-@]/u.test(raw.slice(first)) ? `'${raw}` : raw;
}
export function csvCell(value: unknown): string {
  return `"${safeSpreadsheetCell(value).replaceAll('"', '""')}"`;
}
export function makeCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "\uFEFFrule_id,title\r\n";
  const keys = Object.keys(rows[0] ?? {});
  return (
    "\uFEFF" +
    [
      keys.map(csvCell).join(","),
      ...rows.map((row) => keys.map((key) => csvCell(row[key])).join(",")),
    ].join("\r\n")
  );
}
export function downloadText(name: string, type: string, value: string): void {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
