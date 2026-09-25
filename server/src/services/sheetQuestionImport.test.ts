import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { describe, it } from "node:test";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { parseQuestionSheetBuffer, parseQuestionSheetWithImages } from "./sheetQuestionImport.js";
import { extractXlsxEmbeddedImages, pickImageForRow } from "./xlsxSheetImages.js";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function textSheet() {
  const rows = [
    ["type", "question", "optionA", "optionB", "optionC", "optionD", "answer", "tolerance", "difficulty", "diagram"],
    ["MCQ", "Find the distance between (2,3) and (6,6).", "3", "4", "5", "6", "C", "", "MEDIUM", ""],
    ["NUMERIC", "What is 7 × 8?", "", "", "", "", "56", "0", "MEDIUM", ""],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Questions");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

async function sheetWithDiagram() {
  const zip = await JSZip.loadAsync(textSheet());
  zip.file("xl/media/image1.png", PNG);
  zip.file(
    "xl/drawings/drawing1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>9</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>10</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>2</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:pic>
      <xdr:nvPicPr><xdr:cNvPr id="2" name="Diagram"/><xdr:cNvPicPr/></xdr:nvPicPr>
      <xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill>
      <xdr:spPr/>
    </xdr:pic>
    <xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>`
  );
  zip.file(
    "xl/drawings/_rels/drawing1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
</Relationships>`
  );
  zip.file(
    "xl/worksheets/_rels/sheet1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`
  );
  const sheetFile = zip.file("xl/worksheets/sheet1.xml");
  if (sheetFile) {
    let xml = await sheetFile.async("string");
    if (!xml.includes("<drawing")) {
      xml = xml.replace("</worksheet>", '<drawing r:id="rId1"/></worksheet>');
      zip.file("xl/worksheets/sheet1.xml", xml);
    }
  }
  const ctFile = zip.file("[Content_Types].xml");
  if (ctFile) {
    let ct = await ctFile.async("string");
    if (!ct.includes("image/png")) {
      ct = ct.replace(
        "</Types>",
        '<Default Extension="png" ContentType="image/png"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>'
      );
      zip.file("[Content_Types].xml", ct);
    }
  }
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

describe("Excel question sheet import", () => {
  it("parses MCQ and numeric rows", () => {
    const questions = parseQuestionSheetBuffer(textSheet());
    assert.equal(questions.length, 2);
    assert.equal(questions[0].type, "MCQ");
    assert.equal(questions[0].correctOption, 2);
    assert.equal(questions[1].type, "NUMERIC");
    assert.equal(questions[1].correctNumeric, 56);
    assert.equal(questions[0].stemImageUrl, undefined);
  });

  it("skips title rows and incomplete rows", () => {
    const rows = [
      ["Optics chapter 1"],
      ["type", "question", "optionA", "optionB", "optionC", "optionD", "answer", "tolerance", "difficulty", "diagram"],
      ["MCQ", "", "3", "4", "5", "6", "", "", "", ""],
      ["MCQ", "Find the distance between (2,3) and (6,6).", "3", "4", "5", "6", "C", "", "MEDIUM", ""],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Questions");
    const buf = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    const questions = parseQuestionSheetBuffer(buf);
    assert.equal(questions.length, 1);
    assert.equal(questions[0].correctOption, 2);
  });

  it("picks the diagram-column image on that row", () => {
    const picked = pickImageForRow(1, 9, [
      { row: 1, col: 1, buffer: PNG, ext: "png" },
      { row: 1, col: 9, buffer: PNG, ext: "png" },
      { row: 2, col: 9, buffer: PNG, ext: "png" },
    ]);
    assert.equal(picked?.col, 9);
    assert.equal(picked?.row, 1);
  });

  it("attaches an embedded diagram to the matching question", async () => {
    const buf = await sheetWithDiagram();
    const extracted = await extractXlsxEmbeddedImages(buf);
    assert.equal(extracted.positioned.length, 1);
    assert.equal(extracted.positioned[0].row, 1);
    assert.equal(extracted.positioned[0].col, 9);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qimg-"));
    try {
      const { questions, imagesAttached } = await parseQuestionSheetWithImages(buf, dir);
      assert.equal(imagesAttached, 1);
      assert.match(questions[0].stemImageUrl ?? "", /^\/uploads\/questions\/.+\.png$/);
      assert.equal(questions[1].stemImageUrl, undefined);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
