/**
 * Shared CSV export utility for Cody Intel.
 * Downloads a CSV file directly in the browser.
 */
export function exportCSV(filename: string, rows: Record<string, any>[], columns?: string[]) {
  if (!rows.length) return;

  const keys = columns ?? Object.keys(rows[0]);
  const header = keys.join(",");
  const body = rows.map((row) =>
    keys.map((k) => {
      const v = row[k];
      if (v === null || v === undefined) return "";
      const str = String(v);
      // Escape strings containing commas, quotes, or newlines
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(",")
  ).join("\n");

  const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
