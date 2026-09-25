import JSZip from "jszip";

export type EmbeddedSheetImage = {
  row: number;
  col: number;
  buffer: Buffer;
  ext: "jpg" | "jpeg" | "png" | "gif" | "webp";
  name?: string;
};

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp"]);

function sniffExt(name: string, buf: Buffer): EmbeddedSheetImage["ext"] | null {
  const fromName = name.split(".").pop()?.toLowerCase() ?? "";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return fromName === "jpg" ? "jpg" : "jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.length >= 6 && buf.subarray(0, 6).toString("ascii") === "GIF87a") return "gif";
  if (buf.length >= 6 && buf.subarray(0, 6).toString("ascii") === "GIF89a") return "gif";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return "webp";
  }
  if (IMAGE_EXT.has(fromName) && fromName !== "jpeg") return fromName as EmbeddedSheetImage["ext"];
  if (fromName === "jpeg" || fromName === "jpg") return fromName;
  return null;
}

function isZip(buf: Buffer) {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b;
}

function decodeXml(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function parseRels(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /<Relationship\b([^>]*)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1];
    const id = attrs.match(/\bId="([^"]+)"/i)?.[1];
    const target = attrs.match(/\bTarget="([^"]+)"/i)?.[1];
    if (id && target) map.set(id, decodeXml(target.split("#")[0]));
  }
  return map;
}

function resolveRelTarget(relsFile: string, target: string) {
  const t = decodeURIComponent(target.replace(/\\/g, "/").replace(/^\//, ""));
  if (t.startsWith("xl/")) return t;
  const relsDir = relsFile.replace(/\/_rels\/[^/]+$/, "");
  const joined = `${relsDir}/${t}`.replace(/\/+/g, "/");
  const parts: string[] = [];
  for (const p of joined.split("/")) {
    if (!p || p === ".") continue;
    if (p === "..") parts.pop();
    else parts.push(p);
  }
  return parts.join("/");
}

function zipFile(zip: JSZip, name: string) {
  const want = name.replace(/\\/g, "/");
  const exact = zip.file(want);
  if (exact) return exact;
  const found = Object.keys(zip.files).find((k) => k.replace(/\\/g, "/") === want);
  return found ? zip.file(found) : null;
}

async function readText(zip: JSZip, name: string) {
  const f = zipFile(zip, name);
  return f ? f.async("string") : "";
}

function firstSheetPath(workbookXml: string, workbookRels: Map<string, string>) {
  const m = workbookXml.match(/<sheet\b[^>]*\br:id="([^"]+)"/i) ?? workbookXml.match(/<sheet\b[^>]*\bId="([^"]+)"/i);
  if (!m) return "xl/worksheets/sheet1.xml";
  const target = workbookRels.get(m[1]);
  if (!target) return "xl/worksheets/sheet1.xml";
  return resolveRelTarget("xl/_rels/workbook.xml.rels", target);
}

function sheetRelsPath(sheetPath: string) {
  const i = sheetPath.lastIndexOf("/");
  const dir = sheetPath.slice(0, i);
  const file = sheetPath.slice(i + 1);
  return `${dir}/_rels/${file}.rels`;
}

function drawingTargets(sheetRelsXml: string, sheetRelsFile: string) {
  const out: string[] = [];
  const typeRe = /<Relationship\b([^>]*)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = typeRe.exec(sheetRelsXml)) !== null) {
    const attrs = m[1];
    const type = attrs.match(/\bType="([^"]+)"/i)?.[1] ?? "";
    const target = attrs.match(/\bTarget="([^"]+)"/i)?.[1];
    if (target && /drawing/i.test(type + target)) out.push(resolveRelTarget(sheetRelsFile, target));
  }
  return [...new Set(out)];
}

function parseAnchorBlocks(xml: string): { row: number; col: number; embedId: string }[] {
  const out: { row: number; col: number; embedId: string }[] = [];
  const blocks = xml.split(/<(?:[\w-]+:)?(?:twoCellAnchor|oneCellAnchor|absoluteAnchor)\b/i);
  for (const block of blocks.slice(1)) {
    const from = block.match(
      /<(?:[\w-]+:)?from\b[^>]*>[\s\S]*?<(?:[\w-]+:)?col>(\d+)<\/(?:[\w-]+:)?col>[\s\S]*?<(?:[\w-]+:)?row>(\d+)<\/(?:[\w-]+:)?row>/i
    );
    const embed = block.match(/\b(?:r:embed|r:link)="([^"]+)"/i);
    if (!from || !embed) continue;
    out.push({ col: Number(from[1]), row: Number(from[2]), embedId: embed[1] });
  }
  return out;
}

function parseCellImageNames(xml: string): { name: string; embedId: string }[] {
  const out: { name: string; embedId: string }[] = [];
  const pics = xml.split(/<(?:[\w-]+:)?pic\b/i);
  for (const pic of pics.slice(1)) {
    const name = pic.match(/<(?:[\w-]+:)?cNvPr\b[^>]*\bname="([^"]+)"/i)?.[1];
    const embed = pic.match(/\b(?:r:embed|r:link)="([^"]+)"/i)?.[1];
    if (name && embed) out.push({ name: decodeXml(name), embedId: embed });
  }
  return out;
}

export function pickImageForRow(
  row: number,
  preferredCol: number | null,
  images: EmbeddedSheetImage[]
): EmbeddedSheetImage | undefined {
  const onRow = images.filter((im) => im.row === row);
  if (!onRow.length) return undefined;
  if (preferredCol != null) {
    const exact = onRow.find((im) => im.col === preferredCol);
    if (exact) return exact;
    const near = onRow.find((im) => Math.abs(im.col - preferredCol) <= 1);
    if (near) return near;
  }
  return onRow[0];
}

export type ExtractedSheetImages = {
  positioned: EmbeddedSheetImage[];
  byName: Map<string, { buffer: Buffer; ext: EmbeddedSheetImage["ext"] }>;
};

export async function extractXlsxEmbeddedImages(buf: Buffer): Promise<ExtractedSheetImages> {
  const empty: ExtractedSheetImages = { positioned: [], byName: new Map() };
  if (!isZip(buf)) return empty;
  const zip = await JSZip.loadAsync(buf);
  const media = new Map<string, { buffer: Buffer; ext: EmbeddedSheetImage["ext"] }>();
  for (const name of Object.keys(zip.files)) {
    const n = name.replace(/\\/g, "/");
    if (!/^xl\/media\//i.test(n) || zip.files[name].dir) continue;
    const buffer = Buffer.from(await zip.files[name].async("nodebuffer"));
    const ext = sniffExt(n, buffer);
    if (!ext) continue;
    media.set(n, { buffer, ext });
    media.set(n.split("/").pop() ?? n, { buffer, ext });
  }
  if (!media.size) return empty;

  const images: EmbeddedSheetImage[] = [];
  const byName = new Map<string, { buffer: Buffer; ext: EmbeddedSheetImage["ext"] }>();
  const seen = new Set<string>();
  const mediaAt = (filePath: string) =>
    media.get(filePath.replace(/\\/g, "/")) ?? media.get(filePath.replace(/\\/g, "/").split("/").pop() ?? "");
  const add = (row: number, col: number, filePath: string, name?: string) => {
    const item = mediaAt(filePath);
    if (!item || !Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0) return;
    const key = `${row}:${col}:${item.buffer.length}:${name ?? filePath}`;
    if (seen.has(key)) return;
    seen.add(key);
    images.push({ row, col, buffer: item.buffer, ext: item.ext, name });
  };

  const workbookXml = await readText(zip, "xl/workbook.xml");
  const workbookRelsXml = await readText(zip, "xl/_rels/workbook.xml.rels");
  const sheetPath = firstSheetPath(workbookXml, parseRels(workbookRelsXml));
  const sRelsFile = sheetRelsPath(sheetPath);
  const sRelsXml = await readText(zip, sRelsFile);

  for (const drawingPath of drawingTargets(sRelsXml, sRelsFile)) {
    const drawingXml = await readText(zip, drawingPath);
    if (!drawingXml) continue;
    const dRelsFile = `${drawingPath.replace(/\/([^/]+)$/, "/_rels/$1")}.rels`;
    const dRels = parseRels(await readText(zip, dRelsFile));
    for (const anchor of parseAnchorBlocks(drawingXml)) {
      const target = dRels.get(anchor.embedId);
      if (!target) continue;
      add(anchor.row, anchor.col, resolveRelTarget(dRelsFile, target));
    }
  }

  const cellImagesXml = await readText(zip, "xl/cellimages.xml");
  if (cellImagesXml) {
    const cellRelsFile = "xl/_rels/cellimages.xml.rels";
    const cellRels = parseRels(await readText(zip, cellRelsFile));
    for (const item of parseCellImageNames(cellImagesXml)) {
      const target = cellRels.get(item.embedId);
      if (!target) continue;
      const mediaItem = mediaAt(resolveRelTarget(cellRelsFile, target));
      if (mediaItem) byName.set(item.name, mediaItem);
    }
  }

  return { positioned: images, byName };
}
