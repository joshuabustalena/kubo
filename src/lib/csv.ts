/** RFC 4180 CSV with a UTF-8 BOM so Excel opens ₱ and ñ correctly. Guards against formula injection. */
export function toCsv(rows: Record<string, unknown>[], columns?: { key: string; label: string }[]): string {
  const cols = columns ?? Object.keys(rows[0] ?? {}).map((k) => ({ key: k, label: k }));
  const cell = (v: unknown) => {
    let s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map((c) => cell(c.label)).join(","), ...rows.map((r) => cols.map((c) => cell(r[c.key])).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}
