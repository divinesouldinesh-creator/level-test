export type PrintCardRow = {
  name: string;
  class: string;
  section: string;
  username: string;
  password?: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPrintHtml(rows: PrintCardRow[], documentTitle: string): string {
  const cards = rows
    .map(
      (r) => `
      <div class="card">
        <p class="label">Login card</p>
        <p class="name">${escapeHtml(r.name)}</p>
        <table>
          <tr><td>Class</td><td>${escapeHtml(r.class)}</td></tr>
          <tr><td>Section</td><td>${escapeHtml(r.section)}</td></tr>
          <tr><td>Username</td><td class="mono">${escapeHtml(r.username)}</td></tr>
          <tr><td>Password</td><td class="mono">${r.password ? escapeHtml(r.password) : "—"}</td></tr>
        </table>
        ${
          r.password
            ? ""
            : `<p class="hint">Password not on file. Reset password in admin to issue a new one.</p>`
        }
      </div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(documentTitle)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 16px; color: #0f172a; }
    h1 { font-size: 1.125rem; margin: 0 0 16px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    @media print {
      body { margin: 8px; }
      .grid { grid-template-columns: repeat(3, 1fr); }
    }
    .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; break-inside: avoid; }
    .label { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; margin: 0; }
    .name { font-size: 1.125rem; font-weight: 600; margin: 4px 0 8px; }
    table { width: 100%; font-size: 13px; border-collapse: collapse; }
    td { padding: 4px 0; vertical-align: top; }
    td:first-child { color: #64748b; width: 38%; }
    .mono { font-family: ui-monospace, monospace; font-weight: 600; }
    .hint { font-size: 11px; color: #64748b; margin: 8px 0 0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(documentTitle)}</h1>
  <div class="grid">${cards}</div>
</body>
</html>`;
}

function schedulePrint(win: Window) {
  const run = () => {
    window.setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        /* ignore */
      }
    }, 300);
  };
  if (win.document.readyState === "complete") run();
  else win.addEventListener("load", run, { once: true });
}

/**
 * Opens a printable HTML document in a new tab (blob URL) and triggers the print dialog.
 */
export function openPrintWindow(rows: PrintCardRow[], documentTitle: string) {
  if (!rows.length) {
    window.alert("Nothing to print.");
    return;
  }
  const html = buildPrintHtml(rows, documentTitle);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank", "width=960,height=800");
  if (!w) {
    URL.revokeObjectURL(url);
    window.alert(
      "Could not open the print window (often blocked by the browser). Use Download CSV or Download Excel below, or allow pop-ups for this site."
    );
    return;
  }
  schedulePrint(w);
  /* Revoke after delay so the tab keeps the document while the print dialog is open. */
  window.setTimeout(() => URL.revokeObjectURL(url), 600_000);
}

/** On-page preview grid (no print logic). */
export function PrintCardsPreview({ rows }: { rows: PrintCardRow[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {rows.map((r, i) => (
        <div
          key={`${r.username}-${i}`}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm break-inside-avoid"
        >
          <p className="text-xs uppercase tracking-wide text-slate-500">Login card</p>
          <p className="text-lg font-semibold text-slate-900 mt-1">{r.name}</p>
          <dl className="mt-3 space-y-1.5 text-sm text-slate-700">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Class</dt>
              <dd className="font-medium">{r.class}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Section</dt>
              <dd className="font-medium">{r.section}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Username</dt>
              <dd className="font-mono font-medium">{r.username}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Password</dt>
              <dd className="font-mono font-medium">{r.password ?? "—"}</dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}
