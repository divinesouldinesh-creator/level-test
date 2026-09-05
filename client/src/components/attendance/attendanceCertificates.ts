export type AttendanceCertificateRow = {
  studentName: string;
  className: string;
  sectionName: string;
  monthLabel: string;
};

export type AttendanceCertificateOptions = {
  schoolName?: string;
  logoUrl?: string | null;
  documentTitle?: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function starSvg(): string {
  return `<svg class="star" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2l2.9 6.9 7.4.6-5.6 4.9 1.7 7.2L12 18.8 5.6 21.6l1.7-7.2L1.7 9.5l7.4-.6L12 2z"/>
  </svg>`;
}

function trophySvg(gradientId: string): string {
  return `<svg class="trophy" viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <path d="M18 8h28v6c0 8.8-4.4 16.2-11 19.5V40h6v16H21V40h6v-6.5C20.4 30.2 16 22.8 16 14V8h2z" fill="url(#${gradientId})" stroke="#b45309" stroke-width="1.5"/>
    <path d="M10 12h8v2c0 5.2-2.4 9.6-6 11.8V12zm44 0h-8v2c0 5.2 2.4 9.6 6 11.8V12z" fill="#fbbf24" stroke="#d97706" stroke-width="1"/>
    <rect x="21" y="56" width="22" height="4" rx="2" fill="#92400e"/>
    <defs>
      <linearGradient id="${gradientId}" x1="32" y1="8" x2="32" y2="56" gradientUnits="userSpaceOnUse">
        <stop stop-color="#fde68a"/>
        <stop offset="1" stop-color="#f59e0b"/>
      </linearGradient>
    </defs>
  </svg>`;
}

function buildCertificateHtml(
  row: AttendanceCertificateRow,
  schoolName: string,
  logoUrl: string | undefined,
  index: number
): string {
  const classDisplay = row.sectionName
    ? `${escapeHtml(row.className)} · Section ${escapeHtml(row.sectionName)}`
    : escapeHtml(row.className);
  const gradientId = `trophyGrad-${index}`;
  const headerGraphic = logoUrl
    ? `<img class="school-logo" src="${escapeHtml(logoUrl)}" alt="" />`
    : trophySvg(gradientId);

  return `
    <section class="cert-page">
      <div class="cert-outer">
        <div class="corner corner-tl"></div>
        <div class="corner corner-tr"></div>
        <div class="corner corner-bl"></div>
        <div class="corner corner-br"></div>
        <div class="cert-inner">
          <div class="cert-watermark">★</div>
          <div class="cert-header">
            ${headerGraphic}
            <p class="school-name">${escapeHtml(schoolName)}</p>
          </div>
          <div class="ribbon">
            ${starSvg()}
            <span>Certificate of Attendance</span>
            ${starSvg()}
          </div>
          <p class="intro">This certificate is proudly presented to</p>
          <h1 class="student-name">${escapeHtml(row.studentName)}</h1>
          <p class="body-text">
            of <strong class="class-badge">${classDisplay}</strong>
          </p>
          <p class="body-text">
            for excellent attendance during
          </p>
          <p class="month-badge">${escapeHtml(row.monthLabel)}</p>
          <div class="divider"></div>
          <p class="footer-note">Keep up the wonderful commitment!</p>
          <div class="signatures">
            <div class="sig">
              <div class="sig-line"></div>
              <p>Class Teacher</p>
            </div>
            <div class="sig">
              <div class="sig-line"></div>
              <p>Principal</p>
            </div>
          </div>
        </div>
      </div>
    </section>`;
}

export function buildAttendanceCertificatesHtml(
  rows: AttendanceCertificateRow[],
  options: AttendanceCertificateOptions = {}
): string {
  const schoolName = options.schoolName?.trim() || "Your School";
  const documentTitle = options.documentTitle?.trim() || "Attendance certificates";
  const logoUrl = options.logoUrl?.trim() || undefined;
  const certificates = rows.map((r, i) => buildCertificateHtml(r, schoolName, logoUrl, i)).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(documentTitle)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Source Sans 3", system-ui, sans-serif;
      background: #e2e8f0;
      color: #1e1b4b;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-toolbar {
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
      background: #1e1b4b;
      color: #fff;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .print-toolbar p { font-size: 14px; opacity: 0.9; }
    .print-toolbar button {
      border: none;
      border-radius: 8px;
      padding: 10px 20px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      background: linear-gradient(90deg, #fbbf24, #f59e0b);
      color: #78350f;
    }
    .print-toolbar button:hover { filter: brightness(1.05); }
    .cert-page {
      width: 297mm;
      min-height: 210mm;
      margin: 0 auto;
      padding: 10mm;
      page-break-after: always;
      break-after: page;
    }
    .cert-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .cert-outer {
      position: relative;
      width: 100%;
      min-height: 190mm;
      padding: 5mm;
      border-radius: 6px;
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 35%, #c026d3 70%, #f59e0b 100%);
      box-shadow: 0 12px 40px rgba(79, 70, 229, 0.25);
    }
    .cert-inner {
      position: relative;
      min-height: 180mm;
      padding: 14mm 16mm 12mm;
      border-radius: 4px;
      background: linear-gradient(180deg, #fffbeb 0%, #fef3c7 45%, #fff7ed 100%);
      border: 3px double #b45309;
      text-align: center;
      overflow: hidden;
    }
    .corner {
      position: absolute;
      width: 28px;
      height: 28px;
      border: 3px solid #fde68a;
      z-index: 2;
    }
    .corner-tl { top: 8px; left: 8px; border-right: none; border-bottom: none; }
    .corner-tr { top: 8px; right: 8px; border-left: none; border-bottom: none; }
    .corner-bl { bottom: 8px; left: 8px; border-right: none; border-top: none; }
    .corner-br { bottom: 8px; right: 8px; border-left: none; border-top: none; }
    .cert-watermark {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 180px;
      color: rgba(180, 83, 9, 0.06);
      pointer-events: none;
      user-select: none;
    }
    .cert-header {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      margin-bottom: 10px;
    }
    .trophy { width: 52px; height: 52px; }
    .school-logo {
      width: 72px;
      height: 72px;
      object-fit: contain;
      border-radius: 8px;
    }
    .school-name {
      font-size: 1.15rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #4338ca;
    }
    .ribbon {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      margin: 8px auto 18px;
      padding: 10px 28px;
      border-radius: 999px;
      background: linear-gradient(90deg, #4f46e5, #7c3aed, #db2777);
      color: #fff;
      font-size: 0.95rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);
    }
    .star { width: 16px; height: 16px; color: #fde68a; }
    .intro {
      position: relative;
      font-size: 1.05rem;
      color: #57534e;
      margin-bottom: 10px;
    }
    .student-name {
      position: relative;
      font-family: "Playfair Display", Georgia, serif;
      font-size: 2.75rem;
      font-weight: 700;
      line-height: 1.15;
      color: #1e1b4b;
      margin: 8px 0 16px;
      padding-bottom: 10px;
      border-bottom: 3px solid transparent;
      border-image: linear-gradient(90deg, transparent, #c9a227, #f59e0b, #c9a227, transparent) 1;
    }
    .body-text {
      position: relative;
      font-size: 1.15rem;
      color: #44403c;
      margin: 6px 0;
      line-height: 1.5;
    }
    .class-badge {
      display: inline-block;
      padding: 4px 14px;
      border-radius: 8px;
      background: linear-gradient(90deg, #e0e7ff, #ede9fe);
      color: #3730a3;
      font-weight: 700;
    }
    .month-badge {
      position: relative;
      display: inline-block;
      margin: 14px auto 18px;
      padding: 10px 32px;
      border-radius: 12px;
      background: linear-gradient(135deg, #fbbf24, #f59e0b);
      color: #78350f;
      font-size: 1.5rem;
      font-weight: 700;
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
    }
    .divider {
      width: 120px;
      height: 3px;
      margin: 12px auto;
      border-radius: 2px;
      background: linear-gradient(90deg, #4f46e5, #ec4899, #f59e0b);
    }
    .footer-note {
      position: relative;
      font-size: 1rem;
      font-style: italic;
      color: #7c3aed;
      margin-bottom: 28px;
    }
    .signatures {
      position: relative;
      display: flex;
      justify-content: space-around;
      gap: 40px;
      max-width: 420px;
      margin: 0 auto;
      padding-top: 8px;
    }
    .sig { flex: 1; }
    .sig-line {
      height: 1px;
      background: #a8a29e;
      margin-bottom: 6px;
    }
    .sig p {
      font-size: 0.85rem;
      color: #57534e;
      font-weight: 600;
    }
    @media print {
      .print-toolbar { display: none !important; }
      body { background: #fff; }
      .cert-page {
        margin: 0;
        padding: 0;
        width: 297mm;
        min-height: 210mm;
      }
      .cert-outer { box-shadow: none; }
    }
    @page {
      size: A4 landscape;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="print-toolbar">
    <p>${rows.length} certificate${rows.length === 1 ? "" : "s"} ready — scroll to preview, then print or save as PDF.</p>
    <button type="button" onclick="window.print()">Print / Save as PDF</button>
  </div>
  ${certificates}
  <script>
    window.addEventListener("load", function () {
      window.setTimeout(function () { window.print(); }, 600);
    });
  </script>
</body>
</html>`;
}

function downloadHtmlFile(html: string, title: string) {
  const safe = title.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-") || "attendance-certificates";
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe}.html`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Opens colorful attendance certificates in a new tab (print / Save as PDF).
 * Falls back to downloading an HTML file if pop-ups are blocked.
 */
export function openAttendanceCertificatesPrint(
  rows: AttendanceCertificateRow[],
  options: AttendanceCertificateOptions = {}
): "opened" | "downloaded" | "empty" {
  if (!rows.length) {
    return "empty";
  }
  const html = buildAttendanceCertificatesHtml(rows, options);
  const title = options.documentTitle?.trim() || "Attendance certificates";

  const w = window.open("", "_blank");
  if (!w) {
    downloadHtmlFile(html, title);
    return "downloaded";
  }

  try {
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
  } catch {
    w.close();
    downloadHtmlFile(html, title);
    return "downloaded";
  }

  return "opened";
}
