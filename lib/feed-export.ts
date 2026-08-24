type NoteKind = "liked" | "disliked";
type ExportNote = { kind: NoteKind; text: string; lines: string[] };
type FeedExportData = {
  title: string;
  author: string;
  number: string;
  profile: string;
  cover: string;
  tags: Array<{ text: string; color: string }>;
  rating: string;
  ratingMax: string;
  notes: ExportNote[];
};

const LOGICAL_WIDTH = 520;
const OUTPUT_WIDTH = 2080;
const MAX_LOGICAL_HEIGHT = 2500;
const FONT_FAMILY = "ReadDiaryExport";

let rendererReady: Promise<typeof import("@resvg/resvg-wasm")> | null = null;
let fontBuffers: Promise<Uint8Array[]> | null = null;

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character] || character);
}

function graphemes(value: string) {
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });
    return Array.from(segmenter.segment(value), (part) => part.segment);
  }
  return Array.from(value);
}

function glyphWidth(character: string, fontSize: number) {
  if (/\s/.test(character)) return fontSize * .34;
  if (/[\u1100-\u11ff\u3130-\u318f\u3400-\u9fff\uac00-\ud7af]/u.test(character)) return fontSize;
  if (/[A-Z0-9]/.test(character)) return fontSize * .62;
  if (/[a-z]/.test(character)) return fontSize * .53;
  return fontSize * .58;
}

function wrapText(value: string, maxWidth: number, fontSize: number) {
  const lines: string[] = [];
  for (const paragraph of value.replace(/\r/g, "").split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let line = "";
    let width = 0;
    for (const character of graphemes(paragraph)) {
      const nextWidth = glyphWidth(character, fontSize);
      if (line && width + nextWidth > maxWidth) {
        lines.push(line.trimEnd());
        line = character.trimStart();
        width = line ? nextWidth : 0;
      } else {
        line += character;
        width += nextWidth;
      }
    }
    if (line || !lines.length) lines.push(line.trimEnd());
  }
  return lines;
}

function fitSingleLine(value: string, maxWidth: number, fontSize: number) {
  let result = "";
  let width = 0;
  for (const character of graphemes(value)) {
    const nextWidth = glyphWidth(character, fontSize);
    if (width + nextWidth > maxWidth) return `${result.trimEnd()}…`;
    result += character;
    width += nextWidth;
  }
  return result;
}

async function toEmbeddedImage(source: string) {
  if (!source) return "";
  if (source.startsWith("data:")) return source;
  const url = /^https:\/\//.test(source) ? `/api/image?url=${encodeURIComponent(source)}` : source;
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) return "";
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("이미지를 읽지 못했어요"));
    reader.readAsDataURL(blob);
  });
}

function backgroundImageUrl(element: HTMLElement | null) {
  const value = element?.style.backgroundImage || "";
  return value.match(/url\(["']?(.+?)["']?\)$/)?.[1] || "";
}

function readFeedData(element: HTMLElement): FeedExportData {
  const notes: ExportNote[] = [];
  for (const group of element.querySelectorAll<HTMLElement>(".reviewNotes")) {
    const kind: NoteKind = group.classList.contains("liked") ? "liked" : "disliked";
    for (const paragraph of group.querySelectorAll<HTMLParagraphElement>(".reviewNote p")) {
      const text = paragraph.textContent?.trim() || "";
      if (text) notes.push({ kind, text, lines: wrapText(text, 395, 10.5) });
    }
  }
  const tags = Array.from(element.querySelectorAll<HTMLElement>(".genreText,.statusText")).map((tag) => ({
    text: tag.textContent?.trim() || "",
    color: getComputedStyle(tag).color || "#738eb2",
  })).filter((tag) => tag.text);
  const coverElement = element.querySelector<HTMLElement>(".frontCover");
  return {
    title: element.querySelector<HTMLElement>(".identity b")?.textContent?.trim() || "",
    author: element.querySelector<HTMLElement>(".identity small")?.textContent?.trim() || "",
    number: element.querySelector<HTMLElement>(".postNumber")?.textContent?.trim() || "",
    profile: element.querySelector<HTMLImageElement>(".profileCover img")?.currentSrc || element.querySelector<HTMLImageElement>(".profileCover img")?.src || "",
    cover: backgroundImageUrl(coverElement) || element.querySelector<HTMLImageElement>(".coverBackdrop")?.currentSrc || "",
    tags,
    rating: element.querySelector<HTMLElement>(".feedRating b")?.textContent?.trim() || "0",
    ratingMax: element.querySelector<HTMLElement>(".feedRating small")?.textContent?.trim() || "/ 5",
    notes,
  };
}

function noteHeight(note: ExportNote) {
  return Math.max(1, note.lines.length) * 17 + 16;
}

function splitNotes(notes: ExportNote[]) {
  const pages: ExportNote[][] = [];
  let current: ExportNote[] = [];
  let used = 0;
  const firstCapacity = MAX_LOGICAL_HEIGHT - 630;
  const continuationCapacity = MAX_LOGICAL_HEIGHT - 150;
  for (const note of notes) {
    let remaining = [...note.lines];
    while (remaining.length) {
      const capacity = pages.length ? continuationCapacity : firstCapacity;
      const labelSpace = !current.some((item) => item.kind === note.kind) ? 35 : 0;
      const availableLines = Math.floor((capacity - used - labelSpace - 16) / 17);
      if (availableLines <= 0 && current.length) {
        pages.push(current);
        current = [];
        used = 0;
        continue;
      }
      const selected = remaining.splice(0, Math.max(1, availableLines));
      current.push({ ...note, lines: selected });
      used += labelSpace + selected.length * 17 + 16;
      if (remaining.length) {
        pages.push(current);
        current = [];
        used = 0;
      }
    }
  }
  if (current.length || !pages.length) pages.push(current);
  return pages;
}

function heartPath(x: number, y: number, color: string) {
  return `<path d="M${x + 7} ${y + 13}C${x + 5} ${y + 10} ${x} ${y + 8} ${x} ${y + 4.5}C${x} ${y + 1.8} ${x + 2.2} ${y} ${x + 4.8} ${y}C${x + 6.2} ${y} ${x + 7.4} ${y + .8} ${x + 8} ${y + 2}C${x + 8.7} ${y + .8} ${x + 9.9} ${y} ${x + 11.3} ${y}C${x + 14} ${y} ${x + 16} ${y + 1.8} ${x + 16} ${y + 4.5}C${x + 16} ${y + 8} ${x + 11} ${y + 10} ${x + 8} ${y + 13}Z" fill="${color}"/>`;
}

function starPath(cx: number, cy: number, radius: number) {
  const points = Array.from({ length: 10 }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    const distance = index % 2 ? radius * .45 : radius;
    return `${cx + Math.cos(angle) * distance},${cy + Math.sin(angle) * distance}`;
  }).join(" ");
  return `<polygon points="${points}" fill="#ffbd32"/>`;
}

function textLines(lines: string[], x: number, firstBaseline: number, options: { size: number; weight: number; color: string; lineHeight: number }) {
  return lines.map((line, index) => `<text x="${x}" y="${firstBaseline + index * options.lineHeight}" font-family="${FONT_FAMILY}" font-size="${options.size}" font-weight="${options.weight}" fill="${options.color}">${escapeXml(line || " ")}</text>`).join("");
}

function noteSection(notes: ExportNote[], startY: number) {
  let y = startY;
  let previousKind: NoteKind | null = null;
  let svg = "";
  for (const note of notes) {
    if (note.kind !== previousKind) {
      if (previousKind) y += 15;
      const label = note.kind === "liked" ? "LOVE NOTES" : "NOPE NOTES";
      const count = notes.filter((item) => item.kind === note.kind).length.toString().padStart(2, "0");
      const color = note.kind === "liked" ? "#cf849f" : "#789fc7";
      svg += `<text x="54" y="${y}" font-family="Courier New" font-size="8" font-weight="700" letter-spacing="1.2" fill="${color}">${label}</text>`;
      svg += `<text x="125" y="${y}" font-family="Courier New" font-size="7" font-weight="700" letter-spacing="1" fill="#b8b8b3">${count}</text>`;
      y += 25;
      previousKind = note.kind;
    }
    svg += heartPath(54, y - 10, note.kind === "liked" ? "#f1a8c1" : "#86add3");
    svg += textLines(note.lines, 76, y, { size: 10.5, weight: 600, color: "#555551", lineHeight: 17 });
    y += noteHeight(note);
  }
  return { svg, endY: y };
}

function renderFirstPage(data: FeedExportData, notes: ExportNote[], profile: string, cover: string, pageNumber: number, pageCount: number) {
  const noteRender = noteSection(notes, 590);
  const height = Math.max(807, Math.ceil(noteRender.endY + 48));
  let tagX = 54;
  const tags = data.tags.map((tag) => {
    const node = `<text x="${tagX}" y="557" font-family="${FONT_FAMILY}" font-size="10" font-weight="700" fill="${escapeXml(tag.color)}">#${escapeXml(tag.text)}</text>`;
    tagX += 14 + graphemes(tag.text).length * 9;
    return node;
  }).join("");
  const continuation = pageCount > 1 ? `<text x="456" y="73" font-family="Courier New" font-size="7" fill="#aaa9a4">${pageNumber}/${pageCount}</text>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LOGICAL_WIDTH}" height="${height}" viewBox="0 0 ${LOGICAL_WIDTH} ${height}">
    <defs>
      <filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#2d2d28" flood-opacity=".09"/></filter>
      <filter id="coverBlur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="20"/><feColorMatrix type="saturate" values=".78"/></filter>
      <clipPath id="coverClip"><rect x="42" y="93" width="436" height="436" rx="16"/></clipPath>
      <clipPath id="profileClip"><circle cx="73" cy="63" r="17"/></clipPath>
      <linearGradient id="profileRing" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#ffd33d"/><stop offset=".25" stop-color="#ff8a22"/><stop offset=".48" stop-color="#ff334f"/><stop offset=".7" stop-color="#ef168c"/><stop offset=".86" stop-color="#a62cdb"/><stop offset="1" stop-color="#ffd33d"/></linearGradient>
    </defs>
    <rect width="520" height="${height}" fill="#fff"/>
    <rect x="24" y="24" width="472" height="${height - 48}" rx="10" fill="#fff" stroke="#dededb" stroke-width="1" filter="url(#cardShadow)"/>
    <circle cx="73" cy="63" r="19" fill="url(#profileRing)"/>
    <circle cx="73" cy="63" r="17.5" fill="#fff"/>
    ${profile ? `<image href="${escapeXml(profile)}" x="56" y="46" width="34" height="34" preserveAspectRatio="xMidYMid slice" clip-path="url(#profileClip)"/>` : ""}
    <text x="101" y="60" font-family="${FONT_FAMILY}" font-size="12.5" font-weight="800" fill="#41413d">${escapeXml(fitSingleLine(data.title, 315, 12.5))}</text>
    <text x="101" y="76" font-family="${FONT_FAMILY}" font-size="9" font-weight="600" fill="#777772">${escapeXml(data.author)}</text>
    <text x="435" y="67" font-family="Courier New" font-size="9" fill="#aaa9a4">${escapeXml(data.number)}</text>${continuation}
    <g clip-path="url(#coverClip)">
      <rect x="42" y="93" width="436" height="436" fill="#f7f7f5"/>
      ${cover ? `<image href="${escapeXml(cover)}" x="22" y="73" width="476" height="476" preserveAspectRatio="xMidYMid slice" filter="url(#coverBlur)" opacity=".56"/><rect x="42" y="93" width="436" height="436" fill="#fff" opacity=".42"/><image href="${escapeXml(cover)}" x="42" y="93" width="436" height="436" preserveAspectRatio="xMidYMid meet"/>` : ""}
    </g>
    ${tags}
    ${starPath(430, 551, 11)}
    <text x="445" y="557" font-family="${FONT_FAMILY}" font-size="11" font-weight="800" fill="#5d5d58">${escapeXml(data.rating)}</text>
    <text x="461" y="557" font-family="${FONT_FAMILY}" font-size="8" font-weight="600" fill="#aaa9a4">${escapeXml(data.ratingMax)}</text>
    ${noteRender.svg}
  </svg>`;
}

function renderContinuationPage(data: FeedExportData, notes: ExportNote[], profile: string, pageNumber: number, pageCount: number) {
  const noteRender = noteSection(notes, 122);
  const height = Math.max(420, Math.ceil(noteRender.endY + 48));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="${height}" viewBox="0 0 520 ${height}">
    <defs><filter id="cardShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#2d2d28" flood-opacity=".09"/></filter><clipPath id="profileClip"><circle cx="73" cy="63" r="17"/></clipPath><linearGradient id="profileRing" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#ffd33d"/><stop offset=".5" stop-color="#ff334f"/><stop offset="1" stop-color="#a62cdb"/></linearGradient></defs>
    <rect width="520" height="${height}" fill="#fff"/><rect x="24" y="24" width="472" height="${height - 48}" rx="10" fill="#fff" stroke="#dededb" filter="url(#cardShadow)"/>
    <circle cx="73" cy="63" r="19" fill="url(#profileRing)"/><circle cx="73" cy="63" r="17.5" fill="#fff"/>${profile ? `<image href="${escapeXml(profile)}" x="56" y="46" width="34" height="34" preserveAspectRatio="xMidYMid slice" clip-path="url(#profileClip)"/>` : ""}
    <text x="101" y="60" font-family="${FONT_FAMILY}" font-size="12.5" font-weight="800" fill="#41413d">${escapeXml(fitSingleLine(data.title, 315, 12.5))}</text><text x="101" y="76" font-family="${FONT_FAMILY}" font-size="9" font-weight="600" fill="#777772">${escapeXml(data.author)}</text><text x="435" y="67" font-family="Courier New" font-size="9" fill="#aaa9a4">${pageNumber}/${pageCount}</text>
    ${noteRender.svg}
  </svg>`;
}

async function getRenderer() {
  if (!rendererReady) {
    rendererReady = (async () => {
      const renderer = await import("@resvg/resvg-wasm");
      await renderer.initWasm(fetch("/resvg.wasm"));
      return renderer;
    })();
  }
  return rendererReady;
}

async function getFonts() {
  if (!fontBuffers) {
    fontBuffers = Promise.all([
      "/fonts/Pretendard-Regular.ttf",
      "/fonts/Pretendard-SemiBold.ttf",
      "/fonts/Pretendard-ExtraBold.ttf",
    ].map(async (url) => new Uint8Array(await (await fetch(url, { cache: "force-cache" })).arrayBuffer())));
  }
  return fontBuffers;
}

export async function renderFeedExport(element: HTMLElement) {
  const data = readFeedData(element);
  const [profile, cover, renderer, fonts] = await Promise.all([
    toEmbeddedImage(data.profile),
    toEmbeddedImage(data.cover),
    getRenderer(),
    getFonts(),
  ]);
  const pages = splitNotes(data.notes);
  return pages.map((notes, index) => {
    const svg = index === 0
      ? renderFirstPage(data, notes, profile, cover, index + 1, pages.length)
      : renderContinuationPage(data, notes, profile, index + 1, pages.length);
    const resvg = new renderer.Resvg(svg, {
      fitTo: { mode: "width", value: OUTPUT_WIDTH },
      background: "#ffffff",
      font: { fontBuffers: fonts, defaultFontFamily: FONT_FAMILY },
    });
    const png = resvg.render().asPng();
    return new Blob([new Uint8Array(png)], { type: "image/png" });
  });
}
