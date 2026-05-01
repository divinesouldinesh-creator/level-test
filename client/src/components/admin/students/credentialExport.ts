import * as XLSX from "xlsx";

export type CredentialExportRow = {
  name: string;
  class: string;
  section: string;
  username: string;
  password: string;
};

function escCsv(s: string): string {
  return s.replace(/"/g, '""');
}

/** UTF-8 BOM so Excel opens encoding correctly. */
export function downloadCredentialsCsv(rows: CredentialExportRow[], baseFilename: string) {
  const lines = [
    "Name,Class,Section,Username,Password",
    ...rows.map(
      (r) =>
        `"${escCsv(r.name)}","${escCsv(r.class)}","${escCsv(r.section)}","${escCsv(r.username)}","${escCsv(r.password)}"`
    ),
  ];
  const csv = `\ufeff${lines.join("\r\n")}`;
  const name = baseFilename.endsWith(".csv") ? baseFilename : `${baseFilename}.csv`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadCredentialsXlsx(rows: CredentialExportRow[], baseFilename: string) {
  const sheetData = rows.map((r) => ({
    Name: r.name,
    Class: r.class,
    Section: r.section,
    Username: r.username,
    Password: r.password,
  }));
  const ws = XLSX.utils.json_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Login details");
  const name = baseFilename.endsWith(".xlsx") ? baseFilename : `${baseFilename}.xlsx`;
  XLSX.writeFile(wb, name);
}
