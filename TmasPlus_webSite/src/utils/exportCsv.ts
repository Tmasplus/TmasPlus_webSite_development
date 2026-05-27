type CsvValue = string | number | boolean | null | undefined;

function escapeCsvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportToCsv<T>(
  filename: string,
  rows: T[],
  columns: Array<{ header: string; value: (row: T) => CsvValue }>
): void {
  const headerLine = columns.map((c) => escapeCsvCell(c.header)).join(",");
  const dataLines = rows.map((row) =>
    columns.map((c) => escapeCsvCell(c.value(row))).join(",")
  );
  const csv = "﻿" + [headerLine, ...dataLines].join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  link.href = url;
  link.setAttribute("download", safeName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
