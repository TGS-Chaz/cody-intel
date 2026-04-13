// Branded PDF export for Cody Intel reports.
// Renders a title page + tabular data using jsPDF + autotable. For chart-heavy
// reports, call exportElementToPDF(element) to snapshot a DOM region.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";

const TEAL = [0, 212, 170] as [number, number, number]; // Cody intel teal
const GRAY = [100, 116, 139] as [number, number, number];

export interface PdfTableSection {
  heading: string;
  columns: string[];
  rows:    (string | number | null | undefined)[][];
}

export interface PdfReportOptions {
  title:      string;
  subtitle?:  string;
  filters?:   string;
  summary?:   string;
  sections:   PdfTableSection[];
  fileName?:  string;
}

function header(doc: jsPDF, title: string, subtitle?: string) {
  // Teal band
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 14, "F");

  // Logo-text
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("cody", 14, 9.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("INTEL", 26, 9.5);

  // Date right
  doc.setFontSize(8);
  doc.text(
    new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
    doc.internal.pageSize.getWidth() - 14,
    9.5,
    { align: "right" }
  );

  // Title block
  doc.setTextColor(20, 20, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(title, 14, 28);

  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...GRAY);
    doc.text(subtitle, 14, 34);
  }

  // Underline
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.5);
  doc.line(14, 37, 80, 37);
}

function footer(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.text("Cody Intel — Cannabis Market Intelligence", 14, h - 6);
    doc.text(`Page ${i} of ${pageCount}`, w - 14, h - 6, { align: "right" });
  }
}

export function exportReportToPDF(opts: PdfReportOptions) {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  header(doc, opts.title, opts.subtitle);

  let y = 44;
  if (opts.filters) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.text(`Filters: ${opts.filters}`, 14, y);
    y += 6;
  }

  if (opts.summary) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 50);
    const lines = doc.splitTextToSize(opts.summary, doc.internal.pageSize.getWidth() - 28);
    doc.text(lines, 14, y);
    y += lines.length * 5 + 4;
  }

  for (const s of opts.sections) {
    if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 20; }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 30);
    doc.text(s.heading, 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [s.columns],
      body: s.rows.map(r => r.map(v => v ?? "")),
      theme: "striped",
      styles:      { font: "helvetica", fontSize: 9, cellPadding: 2 },
      headStyles:  { fillColor: TEAL, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [247, 249, 252] },
      margin:      { left: 14, right: 14 },
    });
    // @ts-expect-error lastAutoTable is set by jspdf-autotable
    y = (doc.lastAutoTable?.finalY ?? y) + 10;
  }

  footer(doc);
  doc.save(opts.fileName ?? `${opts.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`);
}

// Snapshot a DOM element (e.g. a chart card) and write it as a full-page PDF.
export async function exportElementToPDF(element: HTMLElement, fileName: string, title = "Cody Intel Report") {
  const canvas = await html2canvas(element, { backgroundColor: "#ffffff", scale: 2 });
  const img    = canvas.toDataURL("image/png");
  const doc    = new jsPDF({ unit: "mm", format: "letter" });

  header(doc, title);
  const w = doc.internal.pageSize.getWidth() - 28;
  const ratio = canvas.height / canvas.width;
  const h = w * ratio;
  doc.addImage(img, "PNG", 14, 44, w, Math.min(h, doc.internal.pageSize.getHeight() - 60));
  footer(doc);
  doc.save(fileName);
}
