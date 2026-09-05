"use client";
import { FormEvent, TouchEvent, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getFontEmbedCSS, toPng } from "html-to-image";
import {
  ChevronLeft,
  ChevronRight,
  Grid3X3,
  LayoutGrid,
  ImagePlus,
  CircleArrowDown,
  List,
  Hash,
  Ellipsis,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  ArrowDownUp,
  Star,
  Trash2,
  Type,
  X,
} from "lucide-react";
import type { BookRecord, VolumePurchase } from "@/lib/books";
import BookExcerpts from './book-excerpts';
import { BookAbout, BookAboutEditor } from './book-about';

type Book = BookRecord & { id: string };
type SearchBook = {
  title: string;
  author: string;
  cover: string;
  url: string;
  totalCount: number;
  countUnit?: "권" | "화";
  category: string;
  platform: string;
};

const BOOK_CACHE_DATABASE = "readiary-cache";
const BOOK_CACHE_STORE = "records";
const BOOK_CACHE_KEY = "books";

function openBookCache() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(BOOK_CACHE_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(BOOK_CACHE_STORE)) request.result.createObjectStore(BOOK_CACHE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readCachedBooks() {
  if (typeof window === "undefined" || !window.indexedDB) return [] as Book[];
  const database = await openBookCache();
  try {
    return await new Promise<Book[]>((resolve, reject) => {
      const request = database.transaction(BOOK_CACHE_STORE, "readonly").objectStore(BOOK_CACHE_STORE).get(BOOK_CACHE_KEY);
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as Book[] : []);
      request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
}

async function writeCachedBooks(books: Book[]) {
  if (typeof window === "undefined" || !window.indexedDB) return;
  const database = await openBookCache();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(BOOK_CACHE_STORE, "readwrite").objectStore(BOOK_CACHE_STORE).put(books, BOOK_CACHE_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
}
type ViewMode = "grid" | "feed" | "calendar" | "records" | "stats";
type SortMode = "created" | "purchase";
type SortDirection = "desc" | "asc";

function firstPurchaseDate(book: Pick<BookRecord, "purchase_date" | "purchase_items">) {
  const itemDates = (book.purchase_items || [])
    .map((item) => item.purchase_date || "")
    .filter(Boolean)
    .sort();
  return itemDates[0] || book.purchase_date || "";
}

function purchaseItemsByDate(items: VolumePurchase[], fallbackDate = "") {
  return items
    .map((item, index) => ({ item, index, date: item.purchase_date || fallbackDate }))
    .sort((a, b) => {
      if (!a.date && b.date) return 1;
      if (a.date && !b.date) return -1;
      return a.date.localeCompare(b.date) || a.index - b.index;
    })
    .map(({ item }) => item);
}

function purchaseItemQuantity(item: VolumePurchase, book: BookRecord, legacy = false) {
  if (legacy || /^(기존\s*)?합계$/.test(item.label.trim())) return Math.max(1, book.total_count || 1);
  const range = item.label.match(/(\d+)\s*(?:~|-|–)\s*(\d+)/);
  if (range) return Math.max(1, Number(range[2]) - Number(range[1]) + 1);
  return 1;
}

function bookPurchaseEntries(book: Book) {
  const legacy = !book.purchase_items?.length;
  const items = legacy
    ? [{ label: "합계", purchase_date: book.purchase_date, list_price: book.list_price, paid_price: book.paid_price, methods: book.purchase_method ? [book.purchase_method] : [] }]
    : book.purchase_items || [];
  return items.map((item) => ({
    book,
    item,
    date: item.purchase_date || book.purchase_date || "",
    quantity: purchaseItemQuantity(item, book, legacy),
  }));
}

async function downloadImage(dataUrl: string, filename: string) {
  const safeFilename = `${filename.replace(/[\\/:*?"<>|]/g, "-")}.png`;
  const blob = await (await fetch(dataUrl)).blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = safeFilename;
  link.href = objectUrl;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

async function shareOrDownloadBlob(blob: Blob, filename: string) {
  const safeFilename = `${filename.replace(/[\\/:*?"<>|]/g, "-")}.png`;
  const file = new File([blob], safeFilename, { type: "image/png" });
  if (isMobileDevice() && typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    try {
      await navigator.share({ files: [file], title: safeFilename });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = safeFilename;
  link.href = objectUrl;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

function isMobileDevice() {
  const userAgent = navigator.userAgent;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)
    || Boolean((navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile)
    || (/Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1);
}

function isDesktopChrome() {
  const userAgent = navigator.userAgent;
  const chrome = /(Chrome|Chromium)\//.test(userAgent) && !/(Edg|OPR|CriOS)\//.test(userAgent);
  const mobile = isMobileDevice();
  const narrowViewport = window.innerWidth <= 520;
  const forceServerExport = new URLSearchParams(window.location.search).has("serverExport");
  return chrome && !mobile && !narrowViewport && !forceServerExport;
}

function isDesktopSafari() {
  const userAgent = navigator.userAgent;
  return /Safari\//.test(userAgent) && !/(Chrome|Chromium|CriOS|Edg|OPR|FxiOS)\//.test(userAgent) && !isMobileDevice();
}

function submitSafariExport(input: { html: string; css: string; kind: string; filename: string }) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/api/export";
  form.enctype = "multipart/form-data";
  form.target = "_self";
  form.hidden = true;
  for (const [name, value] of Object.entries(input)) {
    const field = document.createElement("textarea");
    field.name = name;
    field.value = value;
    form.appendChild(field);
  }
  document.body.appendChild(form);
  form.submit();
  form.remove();
}

async function saveElementWithServerChrome(element: HTMLElement, filename: string) {
  const usageResponse = await fetch("/api/export", { cache: "no-store" });
  if (usageResponse.ok) {
    const usage = await usageResponse.json() as { usedMs?: number; averageMs?: number; remainingMs?: number; limitMs?: number; resetTime?: string };
    const remainingMs = Number(usage.remainingMs || 0);
    const averageMs = Number(usage.averageMs || 0);
    if (remainingMs <= 0 || Number(usage.usedMs || 0) >= Number(usage.limitMs || 600_000)) {
      window.alert(`오늘의 이멋공 사용량을 모두 소진했어요. 내일 오전 ${usage.resetTime || "09:00"} 이후 다시 시도해주세요.`);
      return;
    }
    if (averageMs > 0 && remainingMs < averageMs * 2) {
      const proceed = window.confirm("남은 사용시간을 계산하면 이번이 오늘의 마지막 이멋공이 될 가능성이 높아요. 오늘의 마지막 이멋공을 진행하시겠습니까?");
      if (!proceed) return;
    }
  }

  const clone = element.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  clone.id = "export-root";
  clone.classList.add("imageExporting");

  const kind = clone.classList.contains("calendarPage")
    ? "calendar"
    : clone.classList.contains("recordModal") ? "detail" : "feed";
  if (kind === "calendar") clone.style.width = "635px";
  if (kind === "detail") clone.style.width = `${Math.max(560, Math.ceil(element.getBoundingClientRect().width))}px`;

  await prepareServerExportResources(element, clone);
  clone.querySelectorAll(".imageShareButton,.imageExportExclude").forEach((node) => node.remove());
  const css = Array.from(document.styleSheets).map((sheet) => {
    try { return Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n"); }
    catch { return ""; }
  }).join("\n");
  if (isDesktopSafari()) {
    submitSafariExport({ html: clone.outerHTML, css, kind, filename });
    return;
  }
  const response = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html: clone.outerHTML, css, kind, filename }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { code?: string; error?: string };
    if (result.code === "DAILY_LIMIT") window.alert(result.error || "오늘의 이멋공은 더 이상 사용할 수 없어요. 내일 다시 시도해주세요.");
    throw new Error(result.error || "호환 이미지를 만들지 못했어요");
  }
  await shareOrDownloadBlob(await response.blob(), filename);
}

function serverExportImageUrl(url: string) {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return url;
  return new URL(url, window.location.href).href;
}

async function prepareServerExportResources(source: HTMLElement, clone: HTMLElement) {
  const sourceNodes = [source, ...Array.from(source.querySelectorAll<HTMLElement>("*"))];
  const cloneNodes = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))];
  cloneNodes.forEach((cloneNode, index) => {
    const sourceNode = sourceNodes[index];
    if (!sourceNode) return;
    const computedStyle = getComputedStyle(sourceNode);
    cloneNode.style.fontFamily = computedStyle.fontFamily;
    cloneNode.style.fontWeight = computedStyle.fontWeight;
    cloneNode.style.fontStyle = computedStyle.fontStyle;
    if (cloneNode instanceof HTMLImageElement && sourceNode instanceof HTMLImageElement) {
      const url = sourceNode.currentSrc || sourceNode.src || sourceNode.getAttribute("src") || "";
      if (url) cloneNode.src = serverExportImageUrl(url);
    }
    const background = getComputedStyle(sourceNode).backgroundImage;
    if (background && background !== "none") {
      const match = background.match(/url\(["']?(.+?)["']?\)/);
      if (match?.[1]) cloneNode.style.backgroundImage = `url("${serverExportImageUrl(match[1])}")`;
    }
  });
  await Promise.all(Array.from(clone.querySelectorAll<HTMLElement>(".noteHeart")).map(async (heart) => {
    const image = heart.querySelector<HTMLImageElement>("img");
    if (!image) return;
    const asset = heart.closest(".disliked") ? "/note-heart-blue.png" : "/note-heart-pink.png";
    image.src = await imageUrlToDataUrl(asset);
  }));
}

async function imageUrlToDataUrl(url: string) {
  if (!url || url.startsWith("data:")) return url;
  const absoluteUrl = new URL(url, window.location.href).href;
  const requestUrl = absoluteUrl.startsWith(window.location.origin)
    ? absoluteUrl
    : `/api/image?url=${encodeURIComponent(absoluteUrl)}`;
  const response = await fetch(requestUrl, { cache: "no-store" });
  if (!response.ok) throw new Error("표지 이미지를 불러오지 못했어요");
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("표지 이미지를 변환하지 못했어요"));
    reader.readAsDataURL(blob);
  });
}

async function inlineExportResources(source: HTMLElement, clone: HTMLElement) {
  const sourceNodes = [source, ...Array.from(source.querySelectorAll<HTMLElement>("*"))];
  const cloneNodes = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))];

  await Promise.all(cloneNodes.map(async (cloneNode, index) => {
    const sourceNode = sourceNodes[index];
    if (!sourceNode) return;

    const computedStyle = getComputedStyle(sourceNode);
    cloneNode.style.fontFamily = computedStyle.fontFamily;
    cloneNode.style.fontWeight = computedStyle.fontWeight;
    cloneNode.style.fontStyle = computedStyle.fontStyle;

    if (cloneNode instanceof HTMLImageElement && sourceNode instanceof HTMLImageElement) {
      const url = sourceNode.currentSrc || sourceNode.src || sourceNode.getAttribute("src") || "";
      if (url) cloneNode.src = await imageUrlToDataUrl(url);
    }

    const background = getComputedStyle(sourceNode).backgroundImage;
    if (background && background !== "none") {
      const match = background.match(/url\(["']?(.+?)["']?\)/);
      if (match?.[1]) cloneNode.style.backgroundImage = `url("${await imageUrlToDataUrl(match[1])}")`;
    }
  }));

  const images = Array.from(clone.querySelectorAll<HTMLImageElement>("img"));
  await Promise.all(images.map(async (image) => {
    try {
      if (!image.complete) await new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
      if (image.naturalWidth > 0 && typeof image.decode === "function") await image.decode().catch(() => undefined);
    } catch { /* 캡처 가능한 나머지 요소는 계속 저장한다. */ }
  }));
}

async function saveElementAsImage(element: HTMLElement, filename: string) {
  await document.fonts.ready;
  const fontEmbedCSS = await getFontEmbedCSS(element);
  const isCalendarExport = element.classList.contains("calendarPage");
  const isCardExport = isCalendarExport || element.classList.contains("post") || element.classList.contains("recordModal");
  const sourceWidth = Math.max(1, Math.ceil(element.getBoundingClientRect().width));
  const exportWidth = isCalendarExport ? 635 : sourceWidth;
  const staging = document.createElement("div");
  Object.assign(staging.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: `${exportWidth}px`,
    height: "0",
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: "-2147483648",
  });
  const exportElement = element.cloneNode(true) as HTMLElement;
  exportElement.removeAttribute("id");
  exportElement.classList.add("imageExporting");
  Object.assign(exportElement.style, {
    position: "relative",
    left: "0",
    top: "0",
    margin: "0",
    transform: "none",
    pointerEvents: "none",
  });
  if (exportElement.classList.contains("recordModal") || exportElement.classList.contains("calendarPage")) {
    exportElement.style.width = `${exportWidth}px`;
  }
  staging.appendChild(exportElement);
  document.body.appendChild(staging);
  try {
    await inlineExportResources(element, exportElement);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const width = Math.max(exportElement.scrollWidth, exportElement.offsetWidth);
    const height = Math.max(exportElement.scrollHeight, exportElement.offsetHeight);
    const dataUrl = await toPng(exportElement, {
      cacheBust: true,
      includeQueryParams: true,
      backgroundColor: isCardExport ? undefined : "#ffffff",
      pixelRatio: 4,
      fontEmbedCSS,
      width,
      height,
      style: { maxHeight: "none", height: `${height}px`, overflow: "visible" },
      filter: (node) => !(node instanceof HTMLElement && (node.classList.contains("imageShareButton") || node.classList.contains("imageExportExclude"))),
    });
    await downloadImage(dataUrl, filename);
  } finally {
    staging.remove();
  }
}

function ImageShareButton({ getTarget, targetId, bookId, filename, compact = false }: { getTarget?: (button: HTMLButtonElement) => HTMLElement | null; targetId?: string; bookId?: string; filename: string; compact?: boolean }) {
  const [savingImage, setSavingImage] = useState(false);
  const [failed, setFailed] = useState("");
  return <button type="button" className={`imageShareButton ${compact ? "compact" : ""}`} title={failed || "이미지로 멋지게 공유"} aria-label="이미지로 멋지게 공유" disabled={savingImage} onClick={async (event) => {
    event.stopPropagation();
    const target = targetId ? document.getElementById(targetId) : getTarget?.(event.currentTarget);
    if (!target) return;
    if (bookId && target.dataset.exportBookId !== bookId) {
      setFailed("선택한 책의 이미지를 찾지 못했어요");
      return;
    }
    const targetFilename = target.dataset.exportFilename || filename;
    setSavingImage(true);
    setFailed("");
    try {
      if (isDesktopChrome()) await saveElementAsImage(target, targetFilename);
      else await saveElementWithServerChrome(target, targetFilename);
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error || "이미지를 저장하지 못했어요");
      setFailed(message);
      if (isDesktopSafari()) window.alert(message);
    }
    finally { setSavingImage(false); }
  }}><CircleArrowDown size={compact ? 15 : 16} strokeWidth={1.45} /><span>{savingImage ? "만드는 중" : "이멋공"}</span></button>;
}
const defaultPlatforms = ["리디북스", "카카오페이지", "네이버시리즈", "조아라", "디리토", "밀리의 서재"];
const defaultPurchaseMethods = [
  "100년대여(70%)", "100년대여(50%)", "100년대여(40%)", "100년대여(30%)", "100년대여(10%)",
  "100년 대여 15% 할인 쿠폰", "십오야 100년 보장 15% 할인 쿠폰", "포인트모아하나씩", "정가박치기",
  "위클리쿠폰(10%)", "재정가(70%)", "재정가(50%)", "재정가(40%)", "재정가(30%)", "재정가(10%)",
  "선물", "비공개이벤트(80%포백)", "비공개이벤트(90%포백)", "십오야쿠폰(10%)", "1권무료",
  "노정나눔", "비포인트", "눈포인트", "십오야보너스포인트", "리디캐시", "십오야랜덤포인트",
];
const demo: Book[] = [
  {
    id: "sample-1",
    title: "빌어먹을 가이딩을 받을 바에야",
    author: "목해",
    cover_url: "https://img.ridicdn.net/cover/425387012/xxlarge?dpi=xxhdpi",
    category: "BL",
    status: "완독",
    rating: 4,
    read_count: 4,
    total_count: 4,
    platform: "리디북스",
    purchase_date: "2026-04-15",
    finished_date: "2026-04-15",
    list_price: 13200,
    paid_price: 11880,
    purchase_method: "위클리쿠폰(10%)",
    liked_notes: [
      "수가 정병이 조금 있어서 죽고싶어하는데 그게 좀 맛있음",
      "공 초반에 재수없긴한데 뒤로 갈수록 다정해짐",
      "공수관계가 꽤 맛남",
    ],
    disliked_notes: ["가이딩이 시작하면 어느 순간처럼 흐물흐물해짐"],
    reading_dates: ["2026-08-20", "2026-08-22"],
    source_url: "",
  },
  {
    id: "sample-2",
    title: "겨울 정원의 하와르",
    author: "문시현",
    cover_url:
      "https://image.aladin.co.kr/product/33688/92/cover500/k692939802_1.jpg",
    category: "로맨스판타지",
    status: "읽는 중",
    rating: 4.5,
    read_count: 3,
    total_count: 6,
    platform: "리디북스",
    purchase_date: null,
    finished_date: null,
    list_price: 18000,
    paid_price: 15000,
    purchase_method: "포인트 사용",
    liked_notes: ["차분하게 쌓이는 관계와 겨울의 분위기"],
    disliked_notes: [],
    reading_dates: ["2026-08-22", "2026-08-23"],
    source_url: "",
  },
  {
    id: "sample-3",
    title: "파과",
    author: "구병모",
    cover_url: "https://img.ridicdn.net/cover/734001567/xxlarge?dpi=xxhdpi",
    category: "문학",
    status: "완독",
    rating: 5,
    read_count: 1,
    total_count: 1,
    platform: "리디북스",
    purchase_date: null,
    finished_date: null,
    list_price: 14000,
    paid_price: 12600,
    purchase_method: "온라인 구매",
    liked_notes: ["단단하고 서늘한 문장", "조각이라는 인물이 오래 남는다"],
    disliked_notes: [],
    reading_dates: ["2026-08-23"],
    source_url: "",
  },
];
const empty: BookRecord = {
  title: "",
  author: "",
  total_count: 0,
  count_unit: "권",
  category: "",
  status: "책바구니",
  purchase_date: null,
  platform: "",
  cover_url: "",
  finished_date: null,
  rating: null,
  read_count: 0,
  list_price: 0,
  paid_price: 0,
  purchase_method: "",
  purchase_items: [],
  liked_notes: [],
  disliked_notes: [],
  basket_reason: "",
  basket_images: [],
  reading_dates: [],
  source_url: "",
};

async function prepareCoverImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("이미지 파일을 선택해주세요.");
  if (file.size > 12 * 1024 * 1024) throw new Error("12MB 이하의 이미지를 선택해주세요.");
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("이미지를 불러오지 못했어요."));
      element.src = source;
    });
    const scale = Math.min(1, 600 / image.naturalWidth, 900 / image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이미지를 처리하지 못했어요.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", .84);
  } finally {
    URL.revokeObjectURL(source);
  }
}

async function prepareNoteImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("이미지 파일만 첨부할 수 있어요.");
  if (file.size > 15 * 1024 * 1024) throw new Error("이미지는 장당 15MB 이하여야 해요.");
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("이미지를 불러오지 못했어요."));
      element.src = source;
    });
    const scale = Math.min(1, 1000 / image.naturalWidth, 1400 / image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이미지를 처리하지 못했어요.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let quality = .78;
    let result = canvas.toDataURL("image/jpeg", quality);
    while (result.length > 170_000 && quality > .38) {
      quality -= .08;
      result = canvas.toDataURL("image/jpeg", quality);
    }
    if (result.length > 210_000) throw new Error("이미지를 더 작게 잘라서 다시 첨부해주세요.");
    return result;
  } finally {
    URL.revokeObjectURL(source);
  }
}

async function prepareProfileImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("이미지 파일을 선택해주세요.");
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("이미지를 불러오지 못했어요."));
      element.src = source;
    });
    const size = Math.min(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 320;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이미지를 처리하지 못했어요.");
    context.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2, size, size, 0, 0, 320, 320);
    return canvas.toDataURL("image/jpeg", .82);
  } finally {
    URL.revokeObjectURL(source);
  }
}

function EditableSelect({ label, value, options, onChange, onAdd }: { label: string; value: string; options: string[]; onChange: (value: string) => void; onAdd: (value: string) => Promise<void> }) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [savingOption, setSavingOption] = useState(false);
  const all = [...new Set([...options, ...(value ? [value] : [])])];
  async function commit() {
    const clean = draft.trim();
    if (!clean) return;
    setSavingOption(true);
    try {
      await onAdd(clean);
      onChange(clean);
      setDraft("");
      setCreating(false);
    } finally {
      setSavingOption(false);
    }
  }
  return (
    <div className={`editableSelect ${value ? "" : "isEmpty"}`}>
      <span>{label}</span>
      {creating ? (
        <span className="newOptionField">
          <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void commit(); } if (event.key === "Escape") setCreating(false); }} placeholder="새 선택지" />
          <button type="button" disabled={savingOption || !draft.trim()} onClick={() => void commit()}>추가</button>
          <button type="button" aria-label="선택지 추가 취소" onClick={() => { setCreating(false); setDraft(""); }}><X size={11} /></button>
        </span>
      ) : (
        <select value={value} onChange={(event) => { if (event.target.value === "__new__") setCreating(true); else onChange(event.target.value); }}>
          <option value="">비어 있음</option>
          {all.map((option) => <option key={option}>{option}</option>)}
          <option value="__new__">＋ 새 선택지 추가</option>
        </select>
      )}
    </div>
  );
}

function MultiEditableSelect({ values, options, onChange, onAdd, onOptionsChange }: { values: string[]; options: string[]; onChange: (values: string[]) => void; onAdd: (value: string) => Promise<void>; onOptionsChange: (options: string[]) => Promise<void> }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [savingOption, setSavingOption] = useState(false);
  const [changingOption, setChangingOption] = useState("");
  const [orderedOptions, setOrderedOptions] = useState(options);
  const [draggingOption, setDraggingOption] = useState("");
  const dragOptionRef = useRef("");
  const dragOrderRef = useRef(options);
  const dragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressOptionClickRef = useRef(false);
  useEffect(() => {
    if (dragOptionRef.current) return;
    setOrderedOptions(options);
    dragOrderRef.current = options;
  }, [options]);
  const all = [...new Set([...orderedOptions, ...values])];
  const filtered = all.filter((option) => option.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  useEffect(() => {
    function closeMenu() {
      const details = detailsRef.current;
      if (!details?.open) return false;
      details.open = false;
      setCreating(false);
      setDraft("");
      setQuery("");
      return true;
    }
    function closeOnOutsidePointer(event: PointerEvent) {
      const details = detailsRef.current;
      if (!details?.open || !(event.target instanceof Node) || details.contains(event.target)) return;
      closeMenu();
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || !closeMenu()) return;
      event.preventDefault();
      event.stopPropagation();
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, []);
  async function commit() {
    const clean = draft.trim();
    if (!clean) return;
    setSavingOption(true);
    try {
      await onAdd(clean);
      onChange([...new Set([...values, clean])]);
      setDraft("");
      setCreating(false);
    } finally {
      setSavingOption(false);
    }
  }
  async function replaceOptions(next: string[], option: string) {
    setChangingOption(option);
    try { await onOptionsChange(next); }
    finally { setChangingOption(""); }
  }
  function beginOptionDrag(event: React.PointerEvent<HTMLElement>, option: string) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const row = event.currentTarget;
    const pointerId = event.pointerId;
    if (dragTimerRef.current) clearTimeout(dragTimerRef.current);
    dragTimerRef.current = setTimeout(() => {
      row.setPointerCapture(pointerId);
      dragOptionRef.current = option;
      dragOrderRef.current = [...orderedOptions];
      suppressOptionClickRef.current = true;
      setDraggingOption(option);
    }, 220);
  }
  function moveOptionDrag(event: React.PointerEvent<HTMLElement>) {
    const dragged = dragOptionRef.current;
    if (!dragged) return;
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-purchase-option]")?.dataset.purchaseOption;
    if (!target || target === dragged) return;
    const current = [...dragOrderRef.current];
    const from = current.indexOf(dragged);
    const to = current.indexOf(target);
    if (from < 0 || to < 0) return;
    current.splice(from, 1);
    current.splice(to, 0, dragged);
    dragOrderRef.current = current;
    setOrderedOptions(current);
  }
  function endOptionDrag() {
    if (dragTimerRef.current) { clearTimeout(dragTimerRef.current); dragTimerRef.current = null; }
    const dragged = dragOptionRef.current;
    if (!dragged) return;
    const next = [...dragOrderRef.current];
    dragOptionRef.current = "";
    setDraggingOption("");
    if (next.some((item, index) => item !== options[index])) void replaceOptions(next, dragged);
    window.setTimeout(() => { suppressOptionClickRef.current = false; }, 0);
  }
  async function removeOption(option: string) {
    onChange(values.filter((value) => value !== option));
    const next = orderedOptions.filter((item) => item !== option);
    setOrderedOptions(next);
    dragOrderRef.current = next;
    await replaceOptions(next, option);
  }
  return (
    <details ref={detailsRef} className="multiEditableSelect">
      <summary className={values.length ? "" : "isEmpty"}><span>{values.length ? values.join(" + ") : "비어 있음"}</span></summary>
      <div className="multiOptionMenu">
        <div className="multiOptionSearch" role="search"><Search size={12} /><input aria-label="구매방법 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="구매방법 검색" /></div>
        <div className="multiOptionList">
          {filtered.map((option) => {
            const optionIndex = orderedOptions.indexOf(option);
            const changing = changingOption === option;
            return <div data-purchase-option={option} className={`multiOptionRow ${values.includes(option) ? "selected" : ""} ${draggingOption === option ? "dragging" : ""}`} key={option} onPointerDown={(event) => { if (!(event.target as HTMLElement).closest(".multiOptionDelete")) beginOptionDrag(event, option); }} onPointerMove={moveOptionDrag} onPointerUp={endOptionDrag} onPointerCancel={endOptionDrag}>
              <button type="button" className="multiOptionToggle" disabled={changing} onClick={() => { if (suppressOptionClickRef.current) return; onChange(values.includes(option) ? values.filter((value) => value !== option) : [...values, option]); }}><span>{option}</span><i aria-hidden="true" /></button>
              {optionIndex >= 0 && <span className="multiOptionActions">
                <button type="button" className="multiOptionDelete" aria-label={`${option} 삭제`} disabled={changing} onClick={() => void removeOption(option)}><Trash2 size={10} /></button>
              </span>}
            </div>;
          })}
          {!filtered.length && <p className="multiOptionEmpty">검색 결과가 없습니다.</p>}
        </div>
        {creating ? (
          <span className="newMultiOption">
            <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void commit(); } if (event.key === "Escape") setCreating(false); }} placeholder="새 구매방법" />
            <button type="button" disabled={savingOption || !draft.trim()} onClick={() => void commit()}>추가</button>
          </span>
        ) : (
          <button type="button" className="openNewMultiOption" onClick={(event) => { event.preventDefault(); setCreating(true); }}><Plus size={11} /> 새 선택지 추가</button>
        )}
      </div>
    </details>
  );
}

function displayDate(value: string) {
  if (!value) return "비어 있음";
  const [year, month, day] = value.split("-");
  return `${year}. ${Number(month)}. ${Number(day)}.`;
}

function FlexibleDatePicker({
  value,
  onChange,
  ariaLabel,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  compact?: boolean;
}) {
  const today = new Date();
  const parsed = value ? new Date(`${value}T00:00:00`) : today;
  const [open, setOpen] = useState(false);
  const [pickerPanel, setPickerPanel] = useState<"calendar" | "year" | "month">("calendar");
  const [viewYear, setViewYear] = useState(parsed.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed.getMonth());
  const [yearDraft, setYearDraft] = useState(String(parsed.getFullYear()));
  const rootRef = useRef<HTMLSpanElement>(null);
  const selectedYearRef = useRef<HTMLButtonElement>(null);
  const yearInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setPickerPanel("calendar");
  }, [open]);

  useEffect(() => {
    if (!value) return;
    const next = new Date(`${value}T00:00:00`);
    setViewYear(next.getFullYear());
    setYearDraft(String(next.getFullYear()));
    setViewMonth(next.getMonth());
  }, [value]);

  useEffect(() => {
    if (!open || pickerPanel !== "year") return;
    setYearDraft(String(viewYear));
    const frame = requestAnimationFrame(() => {
      yearInputRef.current?.focus();
      yearInputRef.current?.select();
      selectedYearRef.current?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, pickerPanel, viewYear]);

  const selected = value ? new Date(`${value}T00:00:00`) : null;
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const previousMonthDays = new Date(viewYear, viewMonth, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstWeekday + 1;
    if (day < 1) return { day: previousMonthDays + day, offset: -1 };
    if (day > daysInMonth) return { day: day - daysInMonth, offset: 1 };
    return { day, offset: 0 };
  });
  const lastYear = Math.max(today.getFullYear() + 100, viewYear + 50);
  const firstYear = Math.min(1900, viewYear - 50);
  const years = Array.from(
    { length: lastYear - firstYear + 1 },
    (_, index) => firstYear + index,
  );
  const commitYearDraft = () => {
    const nextYear = Number.parseInt(yearDraft, 10);
    if (!Number.isFinite(nextYear) || nextYear < 1 || nextYear > 9999) {
      setYearDraft(String(viewYear));
      return;
    }
    setViewYear(nextYear);
    setYearDraft(String(nextYear));
    setPickerPanel("calendar");
  };
  const moveMonth = (amount: number) => {
    const next = new Date(viewYear, viewMonth + amount, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };
  const pickDay = (day: number, offset: number) => {
    const next = new Date(viewYear, viewMonth + offset, day);
    const key = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
    onChange(key);
    setOpen(false);
  };
  const pickToday = () => {
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    onChange(key);
    setOpen(false);
  };

  return (
    <span className={`flexDatePicker ${compact ? "compact" : ""}`} ref={rootRef}>
      <button
        type="button"
        className={`flexDateTrigger ${value ? "" : "isEmpty"}`}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {compact ? <Plus size={15} strokeWidth={1.8} /> : displayDate(value)}
      </button>
      {open && (
        <span
          className="flexDatePopover"
          role="dialog"
          aria-label={`${ariaLabel} 선택`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <span className="flexDateHeader">
            <button type="button" onClick={() => moveMonth(-1)} aria-label="이전 달"><ChevronLeft size={17} /></button>
            <span className="flexDateJumps">
              {pickerPanel === "year" ? (
                <span className="flexDateYearEditor">
                  <input
                    ref={yearInputRef}
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={yearDraft}
                    aria-label="연도 직접 입력"
                    onChange={(event) => setYearDraft(event.target.value.replace(/\D/g, ""))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitYearDraft();
                      }
                    }}
                  />
                  <span>년</span>
                </span>
              ) : (
                <button
                  type="button"
                  aria-label="연도 선택 및 직접 입력"
                  aria-expanded={false}
                  onClick={() => setPickerPanel("year")}
                >
                  {viewYear}년
                </button>
              )}
              <button
                type="button"
                className={pickerPanel === "month" ? "active" : ""}
                aria-label="월 목록 열기"
                aria-expanded={pickerPanel === "month"}
                onClick={() => setPickerPanel((panel) => panel === "month" ? "calendar" : "month")}
              >
                {viewMonth + 1}월
              </button>
            </span>
            <button type="button" onClick={() => moveMonth(1)} aria-label="다음 달"><ChevronRight size={17} /></button>
          </span>
          {pickerPanel === "year" ? (
            <span className="flexDateYearGrid" aria-label="연도 선택">
              {years.map((year) => (
                <button
                  type="button"
                  key={year}
                  ref={year === viewYear ? selectedYearRef : undefined}
                  className={year === viewYear ? "selected" : ""}
                  onClick={() => { setViewYear(year); setYearDraft(String(year)); setPickerPanel("calendar"); }}
                >{year}</button>
              ))}
            </span>
          ) : pickerPanel === "month" ? (
            <span className="flexDateMonthGrid" aria-label="월 선택">
              {Array.from({ length: 12 }, (_, month) => (
                <button
                  type="button"
                  key={month}
                  className={month === viewMonth ? "selected" : ""}
                  onClick={() => { setViewMonth(month); setPickerPanel("calendar"); }}
                >{month + 1}월</button>
              ))}
            </span>
          ) : (
            <>
              <span className="flexDateWeekdays">
                {["일", "월", "화", "수", "목", "금", "토"].map((day) => <span key={day}>{day}</span>)}
              </span>
              <span className="flexDateDays">
                {cells.map(({ day, offset }, index) => {
                  const date = new Date(viewYear, viewMonth + offset, day);
                  const isSelected = !!selected && selected.getFullYear() === date.getFullYear() && selected.getMonth() === date.getMonth() && selected.getDate() === date.getDate();
                  const isToday = today.getFullYear() === date.getFullYear() && today.getMonth() === date.getMonth() && today.getDate() === date.getDate();
                  return (
                    <button type="button" key={`${offset}-${day}-${index}`} className={`${offset ? "muted" : ""} ${isSelected ? "selected" : ""} ${isToday ? "today" : ""}`} onClick={() => pickDay(day, offset)}>
                      {day}
                    </button>
                  );
                })}
              </span>
            </>
          )}
          <span className="flexDateFooter">
            <button type="button" disabled={!value} onClick={() => { onChange(""); setOpen(false); }}>날짜 지우기</button>
            <button type="button" onClick={pickToday}>오늘</button>
          </span>
        </span>
      )}
    </span>
  );
}

function StarScale({
  value,
  interactive = false,
}: {
  value: number;
  interactive?: boolean;
}) {
  const safeValue = Math.max(0, Math.min(5, value));
  return (
    <span
      className={`starScale ${interactive ? "interactive" : ""}`}
      aria-hidden="true"
    >
      {[0, 1, 2, 3, 4].map((index) => {
        const fill = Math.max(0, Math.min(1, safeValue - index)) * 100;
        return (
          <span className="starUnit" key={index}>
            <span className="starEmpty">
              <span className="starCharacter">★</span>
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.164.75a.53.53 0 0 1 .294.904l-3.737 3.642a2.123 2.123 0 0 0-.609 1.878l.882 5.143a.53.53 0 0 1-.769.559l-4.618-2.428a2.122 2.122 0 0 0-1.974 0L6.396 21.01a.53.53 0 0 1-.77-.559l.883-5.143a2.123 2.123 0 0 0-.61-1.878L2.163 9.788a.53.53 0 0 1 .294-.904l5.165-.75a2.123 2.123 0 0 0 1.594-1.16z" />
              </svg>
            </span>
            <span className="starFill" style={{ width: `${fill}%` }}>
              <span className="starCharacter">★</span>
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.164.75a.53.53 0 0 1 .294.904l-3.737 3.642a2.123 2.123 0 0 0-.609 1.878l.882 5.143a.53.53 0 0 1-.769.559l-4.618-2.428a2.122 2.122 0 0 0-1.974 0L6.396 21.01a.53.53 0 0 1-.77-.559l.883-5.143a2.123 2.123 0 0 0-.61-1.878L2.163 9.788a.53.53 0 0 1 .294-.904l5.165-.75a2.123 2.123 0 0 0 1.594-1.16z" />
              </svg>
            </span>
          </span>
        );
      })}
    </span>
  );
}

function Rating({ rating }: { rating: number | null }) {
  const value =
    typeof rating === "number" ? Math.max(0, Math.min(5, rating)) : 0;
  return (
    <span
      className="feedRating"
      role="img"
      aria-label={rating == null ? "평점 없음" : `평점 ${value}점`}
    >
      <StarScale value={value} />
    </span>
  );
}

function ClassicRating({ rating }: { rating: number | null }) {
  const value =
    typeof rating === "number" ? Math.max(0, Math.min(5, rating)) : null;
  return (
    <span
      className="classicRating"
      aria-label={value == null ? "평점 없음" : `평점 ${value}점`}
    >
      <Star
        size={17}
        strokeWidth={1.7}
        fill={value == null ? "none" : "currentColor"}
      />
      <b className={value == null ? "empty" : ""}>
        {value == null ? "–" : value}
      </b>
      <small>/ 5</small>
    </span>
  );
}

function CoverLightbox({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="coverLightbox" role="dialog" aria-modal="true" aria-label={`${title} 표지 전체보기`} onMouseDown={onClose}>
      <button type="button" className="coverLightboxClose" aria-label="표지 전체보기 닫기" onClick={onClose}><X size={22} /></button>
      <img src={src} alt={`${title} 표지`} onMouseDown={(event) => event.stopPropagation()} />
    </div>,
    document.body,
  );
}

function InteractiveRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const gestureRef = useRef<{ startX: number; dragging: boolean } | null>(null);
  const valueAtPointer = (target: HTMLSpanElement, clientX: number, halfSteps: boolean) => {
    const stars = target.querySelector<HTMLElement>(".starScale");
    const rect = stars?.getBoundingClientRect() || target.getBoundingClientRect();
    const raw = Math.max(0, Math.min(5, ((clientX - rect.left) / rect.width) * 5));
    return halfSteps ? Math.round(raw * 2) / 2 : Math.max(1, Math.ceil(raw));
  };
  return (
    <span
      className="ratingControl"
      onPointerDown={(event) => {
        event.preventDefault();
        gestureRef.current = { startX: event.clientX, dragging: false };
        event.currentTarget.setPointerCapture(event.pointerId);
        onChange(valueAtPointer(event.currentTarget, event.clientX, false));
      }}
      onPointerMove={(event) => {
        const gesture = gestureRef.current;
        if (!gesture) return;
        if (Math.abs(event.clientX - gesture.startX) >= 3) gesture.dragging = true;
        if (gesture.dragging) onChange(valueAtPointer(event.currentTarget, event.clientX, true));
      }}
      onPointerUp={(event) => {
        gestureRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { gestureRef.current = null; }}
    >
      <StarScale value={value} interactive />
      <input
        type="range"
        min="0"
        max="5"
        step="0.5"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={`평점 ${value}점. 좌우로 움직여 조절`}
      />
    </span>
  );
}

function CalendarCover({ books, onOpen }: { books: Book[]; onOpen: (book: Book) => void }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (books.length < 2) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % books.length), 3200);
    return () => window.clearInterval(timer);
  }, [books.length]);
  useEffect(() => setIndex(0), [books]);
  const book = books[index] || books[0];
  if (!book) return null;
  return (
    <button className="calendarCover" onClick={() => onOpen(book)} aria-label={`${book.title} 상세보기`}>
      <Cover book={book} />
      <span className="calendarRating"><ClassicRating rating={book.rating} /></span>
      {books.length > 1 && <span className="calendarCount">+{books.length - 1}</span>}
      {books.length > 1 && (
        <span className="calendarDots" aria-hidden="true">
          {books.slice(0, 4).map((_, dot) => <i className={dot === index ? "on" : ""} key={dot} />)}
        </span>
      )}
    </button>
  );
}

function CalendarView({ books, onOpen }: { books: Book[]; onOpen: (book: Book) => void }) {
  const calendarRef = useRef<HTMLElement>(null);
  const calendarPickerRef = useRef<HTMLDivElement>(null);
  const selectedCalendarYearRef = useRef<HTMLButtonElement>(null);
  const now = new Date();
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [calendarPicker, setCalendarPicker] = useState<"year" | "month" | null>(null);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const [calendarYearDraft, setCalendarYearDraft] = useState(String(year));
  const firstDay = new Date(year, month, 1).getDay();
  const dayCount = new Date(year, month + 1, 0).getDate();
  const dateKey = (day: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const byDate = useMemo(() => {
    const map = new Map<string, Book[]>();
    books.forEach((book) => (book.reading_dates || []).forEach((date) => map.set(date, [...(map.get(date) || []), book])));
    return map;
  }, [books]);
  const cells = Array.from({ length: Math.ceil((firstDay + dayCount) / 7) * 7 }, (_, index) => {
    const day = index - firstDay + 1;
    return day > 0 && day <= dayCount ? day : null;
  });
  const firstPickerYear = Math.min(1900, year - 50);
  const lastPickerYear = Math.max(now.getFullYear() + 100, year + 50);
  const pickerYears = Array.from({ length: lastPickerYear - firstPickerYear + 1 }, (_, index) => firstPickerYear + index);
  useEffect(() => {
    if (!calendarPicker) return;
    const closePicker = (event: PointerEvent) => {
      if (!calendarPickerRef.current?.contains(event.target as Node)) setCalendarPicker(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCalendarPicker(null);
    };
    document.addEventListener("pointerdown", closePicker);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closePicker);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [calendarPicker]);
  useEffect(() => {
    if (calendarPicker !== "year") return;
    setCalendarYearDraft(String(year));
    const frame = requestAnimationFrame(() => selectedCalendarYearRef.current?.scrollIntoView({ block: "center" }));
    return () => cancelAnimationFrame(frame);
  }, [calendarPicker, year]);
  const commitCalendarYear = () => {
    const nextYear = Number.parseInt(calendarYearDraft, 10);
    if (!Number.isFinite(nextYear) || nextYear < 1 || nextYear > 9999) {
      setCalendarYearDraft(String(year));
      return;
    }
    setCursor(new Date(nextYear, month, 1));
    setCalendarPicker(null);
  };
  return (
    <section className="calendarPage" ref={calendarRef}>
      <header className="calendarHeader">
        <button onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="이전 달"><ChevronLeft size={17} /></button>
        <div className="calendarDatePicker" ref={calendarPickerRef}>
          <button type="button" className="calendarYearTrigger" aria-label="연도 선택" aria-expanded={calendarPicker === "year"} onClick={() => setCalendarPicker((current) => current === "year" ? null : "year")}><b>{year}</b></button>
          <button type="button" className="calendarMonthTrigger" aria-label="월 선택" aria-expanded={calendarPicker === "month"} onClick={() => setCalendarPicker((current) => current === "month" ? null : "month")}><strong>{String(month + 1).padStart(2, "0")}</strong></button>
          {calendarPicker === "year" && (
            <span className="calendarPickerPopover calendarYearPopover" role="dialog" aria-label="이동할 연도 선택">
              <span className="calendarYearInput">
                <input type="text" inputMode="numeric" maxLength={4} value={calendarYearDraft} aria-label="연도 직접 입력" onChange={(event) => setCalendarYearDraft(event.target.value.replace(/\D/g, ""))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitCalendarYear(); } }} />
                <button type="button" onClick={commitCalendarYear}>이동</button>
              </span>
              <span className="calendarYearOptions">
                {pickerYears.map((pickerYear) => <button type="button" key={pickerYear} ref={pickerYear === year ? selectedCalendarYearRef : undefined} className={pickerYear === year ? "selected" : ""} onClick={() => { setCursor(new Date(pickerYear, month, 1)); setCalendarPicker(null); }}>{pickerYear}</button>)}
              </span>
            </span>
          )}
          {calendarPicker === "month" && (
            <span className="calendarPickerPopover calendarMonthPopover" role="dialog" aria-label="이동할 월 선택">
              {Array.from({ length: 12 }, (_, pickerMonth) => <button type="button" key={pickerMonth} className={pickerMonth === month ? "selected" : ""} onClick={() => { setCursor(new Date(year, pickerMonth, 1)); setCalendarPicker(null); }}>{String(pickerMonth + 1).padStart(2, "0")}</button>)}
            </span>
          )}
        </div>
        <span className="calendarHeadActions"><ImageShareButton compact filename={`readiary-${year}-${String(month + 1).padStart(2, "0")}-calendar`} getTarget={() => calendarRef.current} /><button onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="다음 달"><ChevronRight size={17} /></button></span>
      </header>
      <div className="calendarWeek">{["SUN","MON","TUE","WED","THU","FRI","SAT"].map(day => <span key={day}>{day}</span>)}</div>
      <div className="calendarGrid">
        {cells.map((day, index) => {
          const key = day ? dateKey(day) : `empty-${index}`;
          const dayBooks = day ? byDate.get(key) || [] : [];
          return (
            <div className={`calendarDay ${dayBooks.length ? "hasBooks" : ""}`} key={key}>
              {day && <span className="dayNumber">{String(day).padStart(2, "0")}</span>}
              {dayBooks.length > 0 && <CalendarCover books={dayBooks} onOpen={onOpen} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
const noteColors = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"] as const;
type NoteColor = typeof noteColors[number];
const noteColorHex: Record<NoteColor, string> = { gray: "#787774", brown: "#9f6b53", orange: "#d9730d", yellow: "#cb912f", green: "#448361", blue: "#337ea9", purple: "#9065b0", pink: "#c14c8a", red: "#d44c47" };
function noteColorFromCss(value: string): NoteColor | null | undefined {
  const cssColor = value.toLowerCase().replace(/\s/g, "");
  if (!cssColor) return undefined;
  for (const [color, hex] of Object.entries(noteColorHex) as [NoteColor, string][]) {
    const rgb = hex.match(/[a-f\d]{2}/gi)?.map((part) => Number.parseInt(part, 16));
    if (cssColor === hex || cssColor === `rgb(${rgb?.join(",")})`) return color;
  }
  return null;
}
const noteFormatPattern = /(\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\{\{(gray|brown|orange|yellow|green|blue|purple|pink|red|gold):([\s\S]+?)\}\})/g;

function formattedNoteParts(value: string, keyPrefix = "note"): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  const pattern = new RegExp(noteFormatPattern.source, "g");
  while ((match = pattern.exec(value))) {
    if (match.index > cursor) parts.push(value.slice(cursor, match.index));
    const key = `${keyPrefix}-${match.index}`;
    if (match[2] !== undefined) parts.push(<strong key={key}>{formattedNoteParts(match[2], `${key}-bold`)}</strong>);
    else if (match[3] !== undefined) parts.push(<u key={key}>{formattedNoteParts(match[3], `${key}-underline`)}</u>);
    else parts.push(<span key={key} className={`noteAccent ${match[4]}`}>{formattedNoteParts(match[5], `${key}-color`)}</span>);
    cursor = pattern.lastIndex;
  }
  if (cursor < value.length) parts.push(value.slice(cursor));
  return parts;
}

function FormattedNote({ value }: { value: string }) {
  return <>{formattedNoteParts(value)}</>;
}

function escapeNoteHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "<br>");
}

function noteValueToHtml(value: string): string {
  let html = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  const pattern = new RegExp(noteFormatPattern.source, "g");
  while ((match = pattern.exec(value))) {
    html += escapeNoteHtml(value.slice(cursor, match.index));
    if (match[2] !== undefined) html += `<strong>${noteValueToHtml(match[2])}</strong>`;
    else if (match[3] !== undefined) html += `<u>${noteValueToHtml(match[3])}</u>`;
    else {
      const color = match[4] === "gold" ? "yellow" : match[4];
      html += `<span class="noteAccent ${color}" data-note-color="${color}">${noteValueToHtml(match[5])}</span>`;
    }
    cursor = pattern.lastIndex;
  }
  return html + escapeNoteHtml(value.slice(cursor));
}

function noteEditorToValue(root: HTMLElement) {
  const declaredColor = (element: HTMLElement): { found: boolean; color: NoteColor | null } => {
    const explicitColor = noteColorFromCss(element.style.color || element.getAttribute("color") || "");
    if (explicitColor !== undefined) return { found: true, color: explicitColor };
    const dataColor = element.dataset.noteColor;
    if (dataColor && noteColors.includes(dataColor as NoteColor)) return { found: true, color: dataColor as NoteColor };
    return { found: false, color: null };
  };
  const textValue = (node: Node) => {
    let content = node.textContent || "";
    let bold = false;
    let underline = false;
    let color: NoteColor | null = null;
    let colorResolved = false;
    let parent = node.parentElement;
    while (parent && parent !== root) {
      const weight = parent.style.fontWeight;
      if (parent.tagName === "B" || parent.tagName === "STRONG" || Number.parseInt(weight, 10) >= 600 || weight === "bold") bold = true;
      if (parent.tagName === "U" || parent.style.textDecoration.includes("underline")) underline = true;
      if (!colorResolved) {
        const result = declaredColor(parent);
        if (result.found) { colorResolved = true; color = result.color; }
      }
      parent = parent.parentElement;
    }
    if (color) content = `{{${color}:${content}}}`;
    if (underline) content = `__${content}__`;
    if (bold) content = `**${content}**`;
    return content;
  };
  const serialize = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return textValue(node);
    if (!(node instanceof HTMLElement)) return "";
    if (node.tagName === "BR") return "\n";
    const content = Array.from(node.childNodes).map(serialize).join("");
    if (node.tagName === "DIV" || node.tagName === "P") return `${content}\n`;
    return content;
  };
  return Array.from(root.childNodes).map(serialize).join("").replace(/\n{3,}/g, "\n\n").replace(/\n$/, "");
}

function Notes({
  notes,
  kind,
}: {
  notes: string[];
  kind: "liked" | "disliked";
}) {
  const visibleNotes = notes.map((note) => note.trim()).filter(Boolean);
  if (!visibleNotes.length) return null;
  return (
    <section className={`reviewNotes ${kind}`}>
      <span className="reviewLabel">
        {kind === "liked" ? "LIKES" : "DISLIKES"}{" "}
        <small>{String(visibleNotes.length).padStart(2, "0")}</small>
      </span>
      {visibleNotes.map((note, i) => (
        <div className="reviewNote" key={i}>
          <span className="noteHeart"><img src={kind === "liked" ? "/note-heart-pink.gif" : "/note-heart-blue.gif"} alt="" /></span>
          <p><FormattedNote value={note} /></p>
        </div>
      ))}
    </section>
  );
}

function BookNotes({ book, showEmpty = false, hideBasket = false }: { book: Book | BookRecord; showEmpty?: boolean; hideBasket?: boolean }) {
  const [openImage, setOpenImage] = useState<string | null>(null);
  useEffect(() => {
    if (!openImage) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenImage(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [openImage]);
  if (book.status === "책바구니") {
    if (hideBasket) return null;
    const reason = (book.basket_reason || "").trim();
    const images = book.basket_images || [];
    if (!reason && !images.length) return showEmpty ? <p className="emptyNotes">담아둔 이유가 없습니다.</p> : null;
    return (
      <section className="basketNotes">
        <span className="reviewLabel">BASKET NOTES</span>
        {reason && <p>{reason}</p>}
        {!!images.length && <div className="basketNoteImages">{images.map((image, index) => <button type="button" key={index} onClick={() => setOpenImage(image)}><img src={image} alt={`추천 캡처 ${index + 1}`} /></button>)}</div>}
        {openImage && <div className="noteImageLightbox" role="dialog" aria-modal="true" aria-label="추천 캡처 크게 보기" onMouseDown={() => setOpenImage(null)}><button type="button" aria-label="이미지 닫기" onClick={() => setOpenImage(null)}><X size={18} /></button><img src={openImage} alt="추천 캡처 크게 보기" onMouseDown={(event) => event.stopPropagation()} /></div>}
      </section>
    );
  }
  const hasNotes = book.liked_notes.some(note => note.trim()) || book.disliked_notes.some(note => note.trim());
  if (!hasNotes) {
    if (book.content_forgotten) return <p className="emptyNotes">내용이 기억나지 않는 작품이에요.</p>;
    return showEmpty ? <p className="emptyNotes">기록된 감상이 없습니다.</p> : null;
  }
  return <>{book.content_forgotten && <p className="notesMemoryHint">지금은 내용이 기억나지 않아요.</p>}<Notes notes={book.liked_notes} kind="liked" /><Notes notes={book.disliked_notes} kind="disliked" /></>;
}

function BasketNoteEditor({ reason, images, onReasonChange, onImagesChange }: { reason: string; images: string[]; onReasonChange: (value: string) => void; onImagesChange: (images: string[]) => void }) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  async function addImages(files: FileList | null) {
    if (!files?.length) return;
    const slots = Math.max(0, 3 - images.length);
    if (!slots) { setError("추천 캡처는 최대 3장까지 첨부할 수 있어요."); return; }
    setProcessing(true);
    setError("");
    try {
      const added: string[] = [];
      for (const file of Array.from(files).slice(0, slots)) added.push(await prepareNoteImage(file));
      onImagesChange([...images, ...added]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "이미지를 첨부하지 못했어요.");
    } finally {
      setProcessing(false);
    }
  }
  return (
    <section className="basketNoteEditor full">
      <label>담아둔 이유<AutoTextarea value={reason} onChange={onReasonChange} placeholder="누가, 어떤 이유로 추천했는지 적어주세요" /></label>
      <div className="basketImageEditor">
        {images.map((image, index) => <span key={index}><img src={image} alt={`추천 캡처 ${index + 1}`} /><button type="button" aria-label={`추천 캡처 ${index + 1} 삭제`} onClick={() => onImagesChange(images.filter((_, itemIndex) => itemIndex !== index))}><X size={11} /></button></span>)}
        {images.length < 3 && <label className="addBasketImage"><ImagePlus size={15} /><b>{processing ? "처리 중" : "추천 캡처"}</b><small>{images.length}/3</small><input type="file" accept="image/*" multiple disabled={processing} onChange={(event) => { void addImages(event.target.files); event.target.value = ""; }} /></label>}
      </div>
      {error && <p className="basketImageError">{error}</p>}
    </section>
  );
}

function AutoTextarea({ value, onChange, placeholder, ariaLabel }: { value: string; onChange: (value: string) => void; placeholder?: string; ariaLabel?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} rows={1} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={ariaLabel} />;
}

function RichNoteTextarea({ value, onChange, placeholder, ariaLabel }: { value: string; onChange: (value: string) => void; placeholder?: string; ariaLabel?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null);
  const [toolbar, setToolbar] = useState<{ top: number; left: number; bold: boolean; underline: boolean; color: NoteColor | null } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const editor = ref.current;
    if (!editor || value === lastEmitted.current) return;
    editor.innerHTML = noteValueToHtml(value);
  }, [value]);
  const emitValue = () => {
    const editor = ref.current;
    if (!editor) return;
    const next = noteEditorToValue(editor);
    lastEmitted.current = next;
    onChange(next);
  };
  const updateToolbar = () => {
    const editor = ref.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount || selection.isCollapsed || !editor.contains(selection.anchorNode) || !editor.contains(selection.focusNode)) {
      setToolbar(null);
      setPaletteOpen(false);
      return;
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    const colorElement = (selection.anchorNode instanceof HTMLElement ? selection.anchorNode : selection.anchorNode?.parentElement)?.closest<HTMLElement>("[data-note-color], [style*='color'], font[color]");
    const explicitColor = noteColorFromCss(colorElement?.style.color || colorElement?.getAttribute("color") || "");
    const dataColor = colorElement?.dataset.noteColor;
    const selectedColor = explicitColor !== undefined
      ? explicitColor
      : dataColor && noteColors.includes(dataColor as NoteColor) ? dataColor as NoteColor : null;
    setToolbar({
      top: Math.max(8, rect.top - 46),
      left: Math.min(window.innerWidth - 92, Math.max(92, rect.left + rect.width / 2)),
      bold: document.queryCommandState("bold"),
      underline: document.queryCommandState("underline"),
      color: selectedColor,
    });
  };
  const toggleFormat = (command: "bold" | "underline") => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    document.execCommand(command, false);
    emitValue();
    updateToolbar();
  };
  const colorSelection = (color: NoteColor) => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed) return;
    const shouldReset = toolbar?.color === color;
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand("foreColor", false, shouldReset ? "#4d4d49" : noteColorHex[color]);
    document.execCommand("styleWithCSS", false, "false");
    emitValue();
    setPaletteOpen(false);
    requestAnimationFrame(updateToolbar);
  };
  return (
    <div className="richNoteField">
      <div ref={ref} className="richNoteEditor" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={ariaLabel || placeholder} data-placeholder={placeholder} onInput={emitValue} onPointerUp={() => requestAnimationFrame(updateToolbar)} onKeyUp={() => requestAnimationFrame(updateToolbar)} onBlur={() => setTimeout(() => { if (!document.activeElement?.closest(".selectionFormatToolbar")) { setToolbar(null); setPaletteOpen(false); } }, 0)} />
      {toolbar && createPortal(
        <span className="selectionFormatToolbar" style={{ top: toolbar.top, left: toolbar.left }} aria-label="선택한 글자 서식">
          <button type="button" className={`bold ${toolbar.bold ? "active" : ""}`} aria-label="굵게" aria-pressed={toolbar.bold} onPointerDown={(event) => event.preventDefault()} onClick={() => toggleFormat("bold")}>B</button>
          <button type="button" className={`underline ${toolbar.underline ? "active" : ""}`} aria-label="밑줄" aria-pressed={toolbar.underline} onPointerDown={(event) => event.preventDefault()} onClick={() => toggleFormat("underline")}>U</button>
          <button type="button" className="paletteTrigger" style={{ color: toolbar.color ? noteColorHex[toolbar.color] : undefined }} aria-label="글자색 선택" aria-expanded={paletteOpen} onPointerDown={(event) => event.preventDefault()} onClick={() => setPaletteOpen((open) => !open)}><span>A</span></button>
          {paletteOpen && <span className="noteColorPalette">
            {noteColors.map((color) => <button type="button" key={color} className={`${color} ${toolbar.color === color ? "active" : ""}`} aria-label={`${color} 색상${toolbar.color === color ? " 해제" : " 적용"}`} aria-pressed={toolbar.color === color} onPointerDown={(event) => event.preventDefault()} onClick={() => colorSelection(color)}><i /></button>)}
          </span>}
        </span>,
        document.body,
      )}
    </div>
  );
}

function NoteEditor({ label, notes, kind, onChange }: { label: string; notes: string[]; kind: "liked" | "disliked"; onChange: (notes: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const addNote = () => {
    const clean = draft.trim();
    if (!clean) return;
    onChange([...notes.filter((note) => note.trim()), clean]);
    setDraft("");
  };
  const startEditing = (index: number) => { setEditingIndex(index); setEditingDraft(notes[index]); };
  const cancelEditing = () => { setEditingIndex(null); setEditingDraft(""); };
  const saveEditing = () => {
    if (editingIndex === null) return;
    const clean = editingDraft.trim();
    if (!clean) return;
    onChange(notes.map((note, index) => index === editingIndex ? clean : note));
    cancelEditing();
  };
  return (
    <section className={`noteEditor full ${kind}`}>
      <label>{label}</label>
      <div className="noteComposer">
        <RichNoteTextarea value={draft} onChange={setDraft} placeholder="감상을 적어주세요" />
        <button type="button" disabled={!draft.trim()} onClick={addNote}>등록</button>
      </div>
      {!!notes.some((note) => note.trim()) && (
        <div className="savedNoteList">
          {notes.map((note, index) => note.trim() && (
            <div className={`savedNote ${editingIndex === index ? "editing" : ""}`} key={index}>
              <span className="noteHeart"><img src={kind === "liked" ? "/note-heart-pink.gif" : "/note-heart-blue.gif"} alt="" /></span>
              {editingIndex === index ? <div className="savedNoteEdit">
                <RichNoteTextarea ariaLabel={`${label} ${index + 1} 수정`} value={editingDraft} onChange={setEditingDraft} />
                <span><button type="button" onClick={cancelEditing}>취소</button><button type="button" disabled={!editingDraft.trim()} onClick={saveEditing}>수정 완료</button></span>
              </div> : <button type="button" className="savedNoteText" aria-label={`${label} ${index + 1} 수정`} onClick={() => startEditing(index)}><FormattedNote value={note} /></button>}
              <button type="button" className="savedNoteDelete" aria-label={`${label} ${index + 1} 삭제`} onClick={() => { if (editingIndex === index) cancelEditing(); onChange(notes.filter((_, itemIndex) => itemIndex !== index)); }}><X size={11} /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
function Cover({ book }: { book: Book }) {
  return book.cover_url ? (
    <img src={book.cover_url} alt={`${book.title} 표지`} loading="lazy" decoding="async" />
  ) : (
    <div className="noCover">
      <span>▦</span>
      <b>NO COVER</b>
    </div>
  );
}

function FeedArtwork({ book }: { book: Book }) {
  return (
    <span className="feedArtwork">
      {book.cover_url && <img className="coverBackdrop" src={book.cover_url} alt="" loading="lazy" decoding="async" />}
      <span className="coverWash" />
      <span className="coverMain">
        {book.cover_url
          ? <img className="frontCover" src={book.cover_url} alt="" loading="lazy" decoding="async" />
          : <Cover book={book} />}
      </span>
    </span>
  );
}

function RecordArchive({ books }: { books: Book[] }) {
  return (
    <section className="archiveList">
      <header className="archiveHead">
        <span>MY BOOK RECORDS</span>
        <b>{String(books.length).padStart(2, "0")}</b>
      </header>
      {books.map((book, index) => {
        const progress = Math.min(
          100,
          Math.round((book.read_count / book.total_count) * 100),
        );
        const discount = book.list_price
          ? Math.max(
              0,
              Math.round((1 - book.paid_price / book.list_price) * 100),
            )
          : 0;
        return (
          <details className="archiveItem" key={book.id}>
            <summary>
              <span className="archiveCover">
                {book.cover_url ? (
                  <img src={book.cover_url} alt="" />
                ) : (
                  <span>▦</span>
                )}
              </span>
              <span className="archiveIdentity">
                <b>{book.title}</b>
                <small>
                  {book.author || "저자 미상"} · {book.category}
                </small>
              </span>
              <span
                className={`archiveStatus ${book.status === "완독" ? "done" : book.status === "하차" ? "paused" : book.status === "읽는 중" ? "reading" : book.status === "읽기 전" ? "before" : "basket"}`}
              >
                {book.status}
                <small>{progress}%</small>
              </span>
            </summary>
            <div className="archiveBody">
              <span className="archiveNumber">
                RECORD {String(index + 1).padStart(2, "0")}
              </span>
              <dl>
                <div>
                  <dt>저자</dt>
                  <dd>{book.author || "–"}</dd>
                </div>
                <div>
                  <dt>{book.count_unit === "화" ? "총 화수" : "총 권수"}</dt>
                  <dd>{book.total_count}{book.count_unit || "권"}</dd>
                </div>
                <div>
                  <dt>카테고리</dt>
                  <dd>{book.category}</dd>
                </div>
                <div>
                  <dt>상태</dt>
                  <dd>{book.status}</dd>
                </div>
                <div>
                  <dt>구매일</dt>
                  <dd>{book.purchase_date || "–"}</dd>
                </div>
                <div>
                  <dt>플랫폼</dt>
                  <dd>{book.platform || "–"}</dd>
                </div>
                <div>
                  <dt>구매연도</dt>
                  <dd>{book.purchase_year || "–"}</dd>
                </div>
                <div>
                  <dt>완독 / 하차일</dt>
                  <dd>{book.finished_date || "–"}</dd>
                </div>
                <div>
                  <dt>평점</dt>
                  <dd>
                    <Rating rating={book.rating} />
                  </dd>
                </div>
                <div>
                  <dt>독서량</dt>
                  <dd>
                    {book.read_count} / {book.total_count}{book.count_unit || "권"}
                  </dd>
                </div>
                <div>
                  <dt>진행률</dt>
                  <dd>{progress}%</dd>
                </div>
                <div>
                  <dt>총 판매가</dt>
                  <dd>{book.list_price.toLocaleString()}원</dd>
                </div>
                <div>
                  <dt>총 실구매가</dt>
                  <dd>{book.paid_price.toLocaleString()}원</dd>
                </div>
                <div>
                  <dt>할인율</dt>
                  <dd>{discount}%</dd>
                </div>
                <div className="wide">
                  <dt>구매방법</dt>
                  <dd>{book.purchase_method || "–"}</dd>
                </div>
                <div className="wide">
                  <dt>커버 이미지</dt>
                  <dd>{book.cover_url ? "등록됨" : "–"}</dd>
                </div>
              </dl>
              <div className="archiveNotes">
                <BookNotes book={book} />
              </div>
            </div>
          </details>
        );
      })}
    </section>
  );
}

function GroupedRecordArchive({ books }: { books: Book[] }) {
  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="recordRow">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
  return (
    <section className="archiveList">
      <header className="archiveHead">
        <span>MY BOOK RECORDS</span>
        <b>{String(books.length).padStart(2, "0")}</b>
      </header>
      {books.map((book, index) => {
        const progress = Math.min(
          100,
          Math.round((book.read_count / book.total_count) * 100),
        );
        const discount = book.list_price
          ? Math.max(
              0,
              Math.round((1 - book.paid_price / book.list_price) * 100),
            )
          : 0;
        return (
          <details className="archiveItem grouped" key={book.id}>
            <summary>
              <span className="archiveCover">
                {book.cover_url ? (
                  <img src={book.cover_url} alt="" />
                ) : (
                  <span>▦</span>
                )}
              </span>
              <span className="archiveIdentity">
                <b>{book.title}</b>
                <small>
                  {book.author || "저자 미상"} · {book.category}
                </small>
              </span>
              <span
                className={`archiveStatus ${book.status === "완독" ? "done" : book.status === "하차" ? "paused" : book.status === "읽는 중" ? "reading" : book.status === "읽기 전" ? "before" : "basket"}`}
              >
                {book.status}
                <small>{progress}%</small>
              </span>
            </summary>
            <div className="archiveBody">
              <span className="archiveNumber">
                RECORD {String(index + 1).padStart(2, "0")}
              </span>
              <div className="recordHighlights">
                <div>
                  <Rating rating={book.rating} />
                  <small>평점</small>
                </div>
                <div>
                  <b>
                    {book.read_count} / {book.total_count}{book.count_unit || "권"}
                  </b>
                  <small>독서량</small>
                </div>
                <div className={`statusHighlight ${book.status === "완독" ? "done" : book.status === "하차" ? "paused" : book.status === "읽는 중" ? "reading" : book.status === "읽기 전" ? "before" : "basket"}`}>
                  <b>{book.status}</b>
                  <small>{book.finished_date ? `${book.status === "하차" ? "하차일" : "완독일"} ${book.finished_date}` : "상태"}</small>
                </div>
              </div>
              <section className="recordGroup purchaseGroup">
                <h3>PURCHASE</h3>
                <div className="priceLine">
                  <span>
                    <small>총 판매가</small>
                    <s>{book.list_price.toLocaleString()}원</s>
                  </span>
                  <b>{book.paid_price.toLocaleString()}원</b>
                  <em>{discount}% OFF</em>
                </div>
                <dl>
                  <Row label="구매일" value={book.purchase_date || "–"} />
                  <Row label="플랫폼" value={book.platform || "–"} />
                  <Row
                    label="총 판매가"
                    value={`${book.list_price.toLocaleString()}원`}
                  />
                  <Row
                    label="총 실구매가"
                    value={`${book.paid_price.toLocaleString()}원`}
                  />
                  <Row label="할인율" value={`${discount}%`} />
                  <Row label="구매방법" value={book.purchase_method || "–"} />
                </dl>
              </section>
              <BookAbout book={book} />
                  <section className="recordGroup notesGroup">
                <div className="archiveNotes">
                  <BookNotes book={book} showEmpty />
                </div>
              </section>
            </div>
          </details>
        );
      })}
    </section>
  );
}

function ModalRecordArchive({ books, openBook, onClose, onEdit, onAddPurchase, onEditNotes, onStatusChange, onDelete, hideList = false, summerFont = false, embedded = false }: { books: Book[]; openBook?: Book | null; onClose?: () => void; onEdit?: (book: Book) => void; onAddPurchase?: (book: Book) => void; onEditNotes?: (book: Book) => void; onStatusChange?: (book: Book, status: string) => Promise<Book>; onDelete?: (book: Book) => Promise<void>; hideList?: boolean; summerFont?: boolean; embedded?: boolean }) {
  const [selected, setSelected] = useState<{
    book: Book;
    index: number;
  } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [purchaseDetailsOpen, setPurchaseDetailsOpen] = useState(false);
  const [statusEditing, setStatusEditing] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [coverOpen, setCoverOpen] = useState(false);
  useEffect(() => {
    if (openBook) setSelected({ book: openBook, index: Math.max(0, books.findIndex((book) => book.id === openBook.id)) });
  }, [openBook, books]);
  const closeSelected = () => { setSelected(null); setCoverOpen(false); setPurchaseDetailsOpen(false); setStatusEditing(false); setStatusError(""); setConfirmingDelete(false); setDeleteError(""); onClose?.(); };
  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (purchaseDetailsOpen) setPurchaseDetailsOpen(false);
      else closeSelected();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selected, purchaseDetailsOpen]);
  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="recordRow">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
  const statusClass = (status: string) =>
    status === "완독"
      ? "done"
      : status === "하차"
        ? "paused"
        : status === "읽는 중"
          ? "reading"
          : status === "읽기 전"
            ? "before"
            : "basket";
  return (
    <section className={`archiveList modalArchive ${embedded ? "embeddedArchive" : ""}`}>
      {!hideList && <header className="archiveHead">
        <span>MY BOOK RECORDS</span>
        <b>{String(books.length).padStart(2, "0")}</b>
      </header>}
      {!hideList && books.map((book, index) => {
        const progress = Math.min(
          100,
          Math.round((book.read_count / book.total_count) * 100),
        );
        return (
          <button
            className="archiveListButton"
            key={book.id}
            onClick={() => setSelected({ book, index })}
          >
            <span className="archiveCover">
              {book.cover_url ? (
                <img src={book.cover_url} alt="" />
              ) : (
                <span>▦</span>
              )}
            </span>
            <span className="archiveIdentity">
              <b>{book.title}</b>
              <small>
                {book.author || "저자 미상"} · {book.category}
              </small>
            </span>
            <span className={`archiveStatus ${statusClass(book.status)}`}>
              {book.status}
              <small>{progress}%</small>
            </span>
          </button>
        );
      })}
      {selected &&
        (() => {
          const { book, index } = selected;
          const progress = Math.min(
            100,
            Math.round((book.read_count / book.total_count) * 100),
          );
          const discount = book.list_price
            ? Math.max(
                0,
                Math.round((1 - book.paid_price / book.list_price) * 100),
              )
            : 0;
          const hasNotes = book.status === "책바구니"
            ? Boolean((book.basket_reason || "").trim() || book.basket_images?.length)
            : Boolean(book.liked_notes.some((note) => note.trim()) || book.disliked_notes.some((note) => note.trim()));
          return (
            <div
              className={`recordModalShade ${embedded ? "embeddedRecordModalShade" : ""}`}
              onMouseDown={closeSelected}
            >
              <section
                key={book.id}
                id={`record-modal-${book.id}`}
                className="recordModal"
                data-export-book-id={book.id}
                data-export-filename={`readiary-${book.title}-detail`}
                role="dialog"
                aria-modal="true"
                aria-label={`${book.title} 상세 기록`}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <header className="recordModalHead">
                  <button type="button" className="modalBookCover" disabled={!book.cover_url} onClick={() => setCoverOpen(true)} aria-label={book.cover_url ? `${book.title} 표지 전체보기` : undefined}>
                    {book.cover_url ? (
                      <img src={book.cover_url} alt="" />
                    ) : (
                      <span>▦</span>
                    )}
                  </button>
                  <span>
                    <small>RECORD {String(index + 1).padStart(2, "0")}</small>
                    <b>{book.title}</b>
                    <em>
                      {book.author || "저자 미상"} · {book.category}
                    </em>
                  </span>
                  <div className="modalHeadActions imageExportExclude">
                    <details className="recordActionMenu">
                      <summary aria-label="상세 기록 메뉴"><Ellipsis size={17} /></summary>
                      <div className="recordActionMenuPanel">
                        <ImageShareButton key={book.id} filename={`readiary-${book.title}-detail`} targetId={`record-modal-${book.id}`} bookId={book.id} />
                        {onEdit && <button className="editRecordButton" onClick={() => { closeSelected(); onEdit(book); }}><Pencil size={13} /><span>기록 수정</span></button>}
                        {onDelete && <button className="deleteRecordButton" onClick={() => setConfirmingDelete(true)}><Trash2 size={13} /><span>기록 삭제</span></button>}
                      </div>
                    </details>
                    {!embedded && <button onClick={closeSelected} aria-label="상세 기록 닫기"><X size={17} /></button>}
                  </div>
                </header>
                {confirmingDelete && (
                  <div className="deleteConfirm" role="alertdialog" aria-modal="true" aria-label="기록 삭제 확인">
                    <div>
                      <small>DELETE RECORD</small>
                      <b>이 기록을 삭제할까요?</b>
                      <p>삭제한 기록은 다시 되돌릴 수 없어요.</p>
                      {deleteError && <em>{deleteError}</em>}
                      <span>
                        <button onClick={() => { setConfirmingDelete(false); setDeleteError(""); }} disabled={deleting}>취소</button>
                        <button className="confirmDeleteButton" disabled={deleting} onClick={async () => {
                          if (!onDelete) return;
                          setDeleting(true);
                          setDeleteError("");
                          try { await onDelete(book); closeSelected(); }
                          catch (error) { setDeleteError(error instanceof Error ? error.message : "삭제하지 못했어요."); }
                          finally { setDeleting(false); }
                        }}>{deleting ? "삭제 중…" : "삭제"}</button>
                      </span>
                    </div>
                  </div>
                )}
                <div className="recordModalBody">
                  <div className="recordHighlights">
                    <div>
                      <Rating rating={book.rating} />
                      <small>평점</small>
                    </div>
                    <div>
                      <b>
                        {book.read_count} / {book.total_count}{book.count_unit || "권"}
                      </b>
                      <small>독서량</small>
                    </div>
                    <div className={`statusHighlight ${statusClass(book.status)} ${statusEditing ? "editing" : ""}`}>
                      {statusEditing && onStatusChange ? <div className="statusQuickEditor">
                        <select aria-label="독서 상태 수정" autoFocus value={book.status} disabled={statusSaving} onChange={async (event) => {
                          const nextStatus = event.target.value;
                          if (nextStatus === book.status) return;
                          setStatusSaving(true);
                          setStatusError("");
                          try {
                            const updated = await onStatusChange(book, nextStatus);
                            setSelected({ book: updated, index });
                            setStatusEditing(false);
                          } catch (error) {
                            setStatusError(error instanceof Error ? error.message : "상태를 수정하지 못했어요.");
                          } finally { setStatusSaving(false); }
                        }}>
                          <option>책바구니</option><option>읽기 전</option><option>읽는 중</option><option>완독</option><option>하차</option>
                        </select>
                        <button type="button" aria-label="상태 수정 닫기" onClick={() => { setStatusEditing(false); setStatusError(""); }}><X size={11} /></button>
                        <small>{statusSaving ? "저장 중…" : statusError || "상태 선택"}</small>
                      </div> : <button type="button" className="statusQuickButton" disabled={!onStatusChange} onClick={() => { setStatusEditing(true); setStatusError(""); }}>
                        <b>{book.status}</b>
                        <small>{book.finished_date ? `${book.status === "하차" ? "하차일" : "완독일"} ${book.finished_date}` : "상태"}</small>
                      </button>}
                    </div>
                  </div>
                  <section className="recordGroup purchaseGroup">
                    <h3>PURCHASE</h3>
                    <button type="button" className="priceLine purchaseSummaryButton" onClick={() => setPurchaseDetailsOpen(true)} aria-label="권별 구매 상세 보기">
                      <span>
                        <small>총 판매가</small>
                        <s>{book.list_price.toLocaleString()}원</s>
                      </span>
                      <b>{book.paid_price.toLocaleString()}원</b>
                      <em>{discount}% OFF</em>
                    </button>
                    <dl>
                      <Row label="구매일" value={book.purchase_date || "–"} />
                      <Row label="플랫폼" value={book.platform || "–"} />
                      <Row
                        label="총 판매가"
                        value={`${book.list_price.toLocaleString()}원`}
                      />
                      <Row
                        label="총 실구매가"
                        value={`${book.paid_price.toLocaleString()}원`}
                      />
                      <Row label="할인율" value={`${discount}%`} />
                      <Row
                        label="구매방법"
                        value={book.purchase_method || "–"}
                      />
                    </dl>
                  </section>
                  {purchaseDetailsOpen && createPortal(<div className={`purchaseDetailShade imageExportExclude ${summerFont ? "fontSummer" : ""}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPurchaseDetailsOpen(false); }}>
                    <section className="purchaseDetailModal" role="dialog" aria-modal="true" aria-label={`${book.title} 권별 구매 내역`}>
                      <header>
                        <span><small>PURCHASE DETAILS</small><b>권별 구매 내역</b></span>
                        <div>
                          {onAddPurchase && <button type="button" className="purchaseDetailAdd" onClick={() => { setPurchaseDetailsOpen(false); closeSelected(); onAddPurchase(book); }}><Plus size={13} /><span>구매 기록</span></button>}
                          <button type="button" className="purchaseDetailClose" onClick={() => setPurchaseDetailsOpen(false)} aria-label="권별 구매 내역 닫기"><X size={15} /></button>
                        </div>
                      </header>
                      <div className="purchaseDetailTable">
                        <div className="purchaseDetailHead"><span>{book.count_unit || "권"} 정보</span><span>구매일</span><span>판매가</span><span>실구매가</span><span>구매방법</span></div>
                        {purchaseItemsByDate(book.purchase_items?.length ? book.purchase_items : [{ label: "합계", purchase_date: book.purchase_date, list_price: book.list_price, paid_price: book.paid_price, methods: book.purchase_method ? [book.purchase_method] : [] }], book.purchase_date || "").map((item, itemIndex) => <div className="purchaseDetailRow" key={`${item.label}-${itemIndex}`}>
                          <b>{item.label}</b>
                          <span>{item.purchase_date || book.purchase_date || "–"}</span>
                          <s>{item.list_price.toLocaleString()}원</s>
                          <strong>{item.paid_price.toLocaleString()}원</strong>
                          <em>{item.methods?.length ? item.methods.join(" · ") : "–"}</em>
                        </div>)}
                      </div>
                      <footer><span><small>총 판매가</small><s>{book.list_price.toLocaleString()}원</s></span><span><small>총 실구매가</small><b>{book.paid_price.toLocaleString()}원</b></span></footer>
                    </section>
                  </div>, document.body)}
                  <BookAbout book={book} />
                  <section className="recordGroup notesGroup">
                    {!hasNotes && <div className="notesEmptyHead"><span>{book.status === "책바구니" ? "BASKET NOTES" : "NOTES"}</span>{onEditNotes && <button type="button" className="imageExportExclude" aria-label="감상 기록 추가" title="감상 기록 추가" onClick={() => { closeSelected(); onEditNotes(book); }}><Plus size={9} /></button>}</div>}
                    {hasNotes && onEditNotes && <div className="notesQuickActions imageExportExclude"><button type="button" aria-label="감상 기록 추가" title="감상 기록 추가" onClick={() => { closeSelected(); onEditNotes(book); }}><Plus size={9} /></button></div>}
                    <div className="archiveNotes">
                      <BookNotes book={book} showEmpty />
                    </div>
                  </section>
                  <BookExcerpts key={book.id} bookId={book.id} title={book.title} />
                </div>
                {coverOpen && book.cover_url && <CoverLightbox src={book.cover_url} title={book.title} onClose={() => setCoverOpen(false)} />}
              </section>
            </div>
          );
        })()}
    </section>
  );
}

function StatsListModal({ title, subtitle, books, mode, purchaseMonth, onClose }: { title: string; subtitle: string; books: Book[]; mode: "status" | "purchase" | "reading" | "genre"; purchaseMonth?: string; onClose: () => void }) {
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const listScrollRef = useRef(0);
  const shouldRestoreScrollRef = useRef(false);
  function openDetail(book: Book) {
    listScrollRef.current = listRef.current?.scrollTop || 0;
    setSelectedBook(book);
  }
  function returnToList() {
    shouldRestoreScrollRef.current = true;
    setSelectedBook(null);
  }
  useLayoutEffect(() => {
    if (selectedBook || !shouldRestoreScrollRef.current) return;
    shouldRestoreScrollRef.current = false;
    if (listRef.current) listRef.current.scrollTop = listScrollRef.current;
  }, [selectedBook]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (selectedBook) returnToList();
      else onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, selectedBook]);
  const statusClass = (status: string) => status === "완독" ? "done" : status === "하차" ? "paused" : status === "읽는 중" ? "reading" : status === "읽기 전" ? "before" : "basket";
  const monthlyEntries = (book: Book) => mode === "purchase" && purchaseMonth ? bookPurchaseEntries(book).filter(entry => entry.date.startsWith(purchaseMonth)) : [];
  const monthlyTotal = books.reduce((sum, book) => sum + monthlyEntries(book).reduce((bookSum, entry) => bookSum + (entry.item.paid_price || 0), 0), 0);
  return (
    <div className="statsListShade" onMouseDown={onClose}>
      <section className={`statsListModal ${selectedBook ? "showingDetail" : ""}`} role="dialog" aria-modal="true" aria-label={`${title} 목록`} onMouseDown={(event) => event.stopPropagation()}>
        <header className={`statsListHead ${selectedBook ? "showingDetail" : ""}`}>
          {selectedBook ? <button type="button" className="statsListBack" onClick={returnToList}><ChevronLeft size={17} /><span>{title} 목록</span></button> : <span><small>{mode === "status" ? "READING STATUS" : mode === "reading" ? "MY READING YEAR" : mode === "genre" ? "BY GENRE" : "PURCHASE LOG"}</small><b>{title}</b><em>{subtitle}</em></span>}
          <button type="button" onClick={onClose} aria-label="목록 닫기"><X size={17} /></button>
        </header>
        {selectedBook ? <ModalRecordArchive books={books} openBook={selectedBook} onClose={returnToList} hideList embedded /> : <><div ref={listRef} className="statsBookList">
          {books.length ? books.map((book) => {
            const entries = monthlyEntries(book);
            const labels = entries.map(entry => entry.item.label);
            const days = [...new Set(entries.map(entry => entry.date.slice(8, 10)).filter(Boolean))];
            const monthPaid = entries.reduce((sum, entry) => sum + (entry.item.paid_price || 0), 0);
            return (
            <button type="button" className="statsBookItem" key={book.id} onClick={() => openDetail(book)} aria-label={`${book.title} 상세 기록 열기`}>
              <span className="archiveCover">{book.cover_url ? <img src={book.cover_url} alt="" /> : <span>▦</span>}</span>
              <span className="archiveIdentity">
                <b>{book.title}</b>
                <small>{book.author || "저자 미상"} · {book.category}</small>
                {mode === "purchase" && <em>{labels.length ? labels.join(" · ") : "권 정보 미기록"}</em>}
              </span>
              {mode !== "purchase" ? (
                <span className={`archiveStatus ${statusClass(book.status)}`}>{book.status}<small>{book.read_count}/{book.total_count}{book.count_unit || "권"}</small></span>
              ) : (
                <span className="statsPurchaseAmount"><b>{monthPaid.toLocaleString()}원</b><small>{days.length ? `${days.map(day => `${Number(day)}일`).join(" · ")} · ` : ""}{book.platform || "플랫폼 미기록"}</small></span>
              )}
            </button>
          );}) : <div className="statsListEmpty">해당하는 기록이 아직 없어요.</div>}
        </div>
        <footer><span>{String(books.length).padStart(2, "0")} BOOKS</span>{mode === "purchase" && <b>합계 {monthlyTotal.toLocaleString()}원</b>}</footer></>}
      </section>
    </div>
  );
}

function HallOfFame({ books, onEdit, onAddPurchase, onEditNotes, onStatusChange, onDelete, summerFont = false }: { books: Book[]; onEdit: (book: Book) => void; onAddPurchase: (book: Book) => void; onEditNotes: (book: Book) => void; onStatusChange: (book: Book, status: string) => Promise<Book>; onDelete: (book: Book) => Promise<void>; summerFont?: boolean }) {
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const favorites = books.filter((book) => book.rating === 5);
  return (
    <section className="hallPage">
      <header className="hallHero">
        <h1>명예의 전당</h1>
        <span aria-label="별점 5점">{summerFont ? <StarScale value={5} /> : <><Star size={12} fill="currentColor" /><Star size={12} fill="currentColor" /><Star size={12} fill="currentColor" /><Star size={12} fill="currentColor" /><Star size={12} fill="currentColor" /></>}</span>
      </header>
      {favorites.length ? (
        <div className="hallShelf">
          {favorites.map((book, index) => (
            <button type="button" className="hallBook" key={book.id} onClick={() => setSelectedBook(book)} aria-label={`${book.title} 상세 기록 열기`}>
              <span className="hallCover">{book.cover_url ? <img src={book.cover_url} alt="" /> : <span>▦</span>}</span>
              <b>{book.title}</b>
              <small>{book.author || "저자 미상"}</small>
              <i>{String(index + 1).padStart(2, "0")}</i>
            </button>
          ))}
        </div>
      ) : (
        <div className="hallEmpty"><Star size={20} strokeWidth={1.2} /><b>첫 번째 인생책을 기다리고 있어요</b><small>별점 5점을 준 책이 이곳에 전시됩니다.</small></div>
      )}
      <footer className="hallCount"><span>{String(favorites.length).padStart(2, "0")} FAVORITES</span></footer>
      {selectedBook && <ModalRecordArchive books={favorites} openBook={selectedBook} onClose={() => setSelectedBook(null)} onEdit={onEdit} onAddPurchase={onAddPurchase} onEditNotes={onEditNotes} onStatusChange={onStatusChange} onDelete={onDelete} hideList summerFont={summerFont} />}
    </section>
  );
}

function StatsView({ books, profileImage, onProfileImage }: { books: Book[]; profileImage: string; onProfileImage: (file?: File) => void }) {
  const [statsTab, setStatsTab] = useState<"reading" | "taste" | "spending">("reading");
  const [purchaseYear, setPurchaseYear] = useState("");
  const [readingYear, setReadingYear] = useState("");
  const [genreStatus, setGenreStatus] = useState("");
  const [listModal, setListModal] = useState<{ title: string; subtitle: string; books: Book[]; mode: "status" | "purchase" | "reading" | "genre"; purchaseMonth?: string } | null>(null);
  const won = (value: number) => `${value.toLocaleString()}원`;
  const paid = books.reduce((sum, book) => sum + (book.paid_price || 0), 0);
  const list = books.reduce((sum, book) => sum + (book.list_price || 0), 0);
  const rated = books.filter(book => typeof book.rating === "number" && book.rating > 0);
  const averageRating = rated.length ? rated.reduce((sum, book) => sum + (book.rating || 0), 0) / rated.length : 0;
  const averageRatingDisplay = averageRating
    ? (Math.round((averageRating + Number.EPSILON) * 10) / 10).toFixed(1)
    : "–";
  const group = (key: "category" | "platform" | "status") => Object.values(books.reduce<Record<string, { name: string; works: number; volumes: number; paid: number }>>((all, book) => {
    const name = book[key] || "미분류";
    all[name] ||= { name, works: 0, volumes: 0, paid: 0 };
    all[name].works += 1;
    all[name].volumes += book.total_count || 0;
    all[name].paid += book.paid_price || 0;
    return all;
  }, {})).sort((a, b) => b.paid - a.paid || b.volumes - a.volumes);
  const recordedStatuses = group("status");
  const statuses = ["책바구니", "읽기 전", "읽는 중", "완독", "하차"].map(name => recordedStatuses.find(item => item.name === name) || { name, works: 0, volumes: 0, paid: 0 });
  const genreBooks = books.filter(book => book.status !== "책바구니" && (!genreStatus || book.status === genreStatus));
  const genreGroups = Object.values(genreBooks.reduce<Record<string, { name: string; books: Book[] }>>((all, book) => {
    const name = book.category || "미분류";
    all[name] ||= { name, books: [] };
    all[name].books.push(book);
    return all;
  }, {})).sort((a, b) => b.books.length - a.books.length || a.name.localeCompare(b.name));
  const genreInitial = (genre: string) => genre === "BL" ? "B" : genre === "로맨스" ? "R" : genre === "로맨스판타지" ? "RF" : genre === "문학" ? "L" : genre.slice(0, 1).toUpperCase();
  const purchaseEntries = books.flatMap(bookPurchaseEntries).filter(entry => entry.date);
  const months = [...new Set(purchaseEntries.map(entry => entry.date.slice(0, 7)))].map(name => {
    const entries = purchaseEntries.filter(entry => entry.date.startsWith(name));
    return {
      name,
      works: new Set(entries.map(entry => entry.book.id)).size,
      volumes: entries.reduce((sum, entry) => sum + entry.quantity, 0),
      paid: entries.reduce((sum, entry) => sum + (entry.item.paid_price || 0), 0),
    };
  }).sort((a, b) => b.name.localeCompare(a.name));
  const purchaseYears = [...new Set(months.map(item => item.name.slice(0, 4)))];
  const activePurchaseYear = purchaseYears.includes(purchaseYear) ? purchaseYear : purchaseYears[0];
  const finishedBooks = books.filter(book => (book.status === "완독" || book.status === "하차") && /^\d{4}-\d{2}-\d{2}$/.test(book.finished_date || ""));
  const currentYear = String(new Date().getFullYear());
  const readingYears = [...new Set(finishedBooks.map(book => (book.finished_date || "").slice(0, 4)))].sort((a, b) => b.localeCompare(a));
  if (!readingYears.includes(currentYear)) readingYears.unshift(currentYear);
  const activeReadingYear = readingYears.includes(readingYear) ? readingYear : readingYears[0];
  const yearlyFinishedBooks = finishedBooks.filter(book => book.finished_date?.startsWith(activeReadingYear));
  const yearlyCompleted = yearlyFinishedBooks.filter(book => book.status === "완독");
  const yearlyDropped = yearlyFinishedBooks.filter(book => book.status === "하차");
  const currentYearCompleted = finishedBooks.filter(book => book.status === "완독" && book.finished_date?.startsWith(currentYear)).length;
  const readingMonths = Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    const monthBooks = yearlyFinishedBooks.filter(book => book.finished_date?.startsWith(`${activeReadingYear}-${month}`));
    return {
      month,
      books: monthBooks,
      completed: monthBooks.filter(book => book.status === "완독").length,
      dropped: monthBooks.filter(book => book.status === "하차").length,
    };
  });
  if (!books.length) return <div className="state">통계를 만들 기록이 아직 없어요.</div>;
  return (
    <section className="statsPage">
      <header className="profileStatsHeader">
        <label className="profileImagePicker" aria-label={profileImage ? "프로필 사진 변경" : "프로필 사진 추가"}>
          <span>{profileImage ? <img src={profileImage} alt="나의 프로필" /> : <i>R</i>}</span>
          <b><Plus size={12} strokeWidth={1.7} /></b>
          <input type="file" accept="image/*" onChange={(event) => { onProfileImage(event.target.files?.[0]); event.target.value = ""; }} />
        </label>
        <div className="profileNumbers">
          <div><strong>{books.length}</strong><small>작품</small></div>
          <div><strong>{currentYearCompleted}</strong><small>올해 완독</small></div>
          <div><strong>{averageRatingDisplay}</strong><small>평균 평점</small></div>
        </div>
        <div className="profileReadingBio"><b>나의 독서 통계</b><span>books, notes &amp; little memories</span></div>
      </header>
      <nav className="statsCategoryTabs" role="tablist" aria-label="통계 분야">
        <button type="button" role="tab" aria-selected={statsTab === "reading"} className={statsTab === "reading" ? "on" : ""} onClick={() => setStatsTab("reading")}>독서</button>
        <button type="button" role="tab" aria-selected={statsTab === "taste"} className={statsTab === "taste" ? "on" : ""} onClick={() => setStatsTab("taste")}>취향</button>
        <button type="button" role="tab" aria-selected={statsTab === "spending"} className={statsTab === "spending" ? "on" : ""} onClick={() => setStatsTab("spending")}>소비</button>
      </nav>
      {statsTab === "reading" && <div className="statsTabPanel" role="tabpanel">
      <section className="statsSection"><header><span>READING STATUS</span><small>현재 독서 상태</small></header><div className="statusStats">{statuses.map(item => <button type="button" key={item.name} onClick={() => setListModal({ title: item.name, subtitle: `${item.works}작품`, books: books.filter(book => book.status === item.name), mode: "status" })}><small>{item.name}</small><b>{item.works}</b><i>작품</i></button>)}</div></section>
      <section className="statsSection readingYearSection">
        <header><span>MY READING YEAR</span><label className="purchaseYearSelect"><span>독서 연도 선택</span><select aria-label="독서 통계 연도 선택" value={activeReadingYear} onChange={(event) => setReadingYear(event.target.value)}>{readingYears.map(year => <option key={year} value={year}>{year}</option>)}</select></label></header>
        <div className="readingYearTotals">
          <button type="button" onClick={() => setListModal({ title: `${activeReadingYear}년 완독`, subtitle: `${yearlyCompleted.length}작품`, books: yearlyCompleted, mode: "reading" })}><small>완독한 작품</small><strong>{yearlyCompleted.length}<i>작품</i></strong></button>
          <button type="button" onClick={() => setListModal({ title: `${activeReadingYear}년 하차`, subtitle: `${yearlyDropped.length}작품`, books: yearlyDropped, mode: "reading" })}><small>하차한 작품</small><strong>{yearlyDropped.length}<i>작품</i></strong></button>
        </div>
        <div className="readingYearMonths">
          {readingMonths.map(item => <button type="button" className={item.books.length ? "hasReading" : ""} key={item.month} onClick={() => setListModal({ title: `${activeReadingYear}년 ${Number(item.month)}월`, subtitle: item.books.length ? `완독 ${item.completed}작품 · 하차 ${item.dropped}작품` : "완독·하차 기록 없음", books: item.books, mode: "reading" })}><span>{item.month}</span><div><i style={{ height: `${Math.max(item.completed ? 14 : 0, Math.min(54, item.completed * 12))}px` }} /><i style={{ height: `${Math.max(item.dropped ? 8 : 0, Math.min(54, item.dropped * 12))}px` }} /></div><small>{item.books.length ? `${item.completed} · ${item.dropped}` : "–"}</small></button>)}
        </div>
        <footer className="readingYearLegend"><span><i />완독</span><span><i />하차</span></footer>
      </section>
      </div>}
      {statsTab === "taste" && <div className="statsTabPanel" role="tabpanel">
      <section className="statsSection genreStatsSection">
        <header><span>BY GENRE</span><small>책바구니를 제외한 작품 분포</small></header>
        <div className="genreStatsBody">
          <div className="genreStatusFilters" aria-label="장르 통계 독서 상태">
            {["", "읽기 전", "읽는 중", "완독", "하차"].map(status => {
              const count = books.filter(book => book.status !== "책바구니" && (!status || book.status === status)).length;
              return <button type="button" className={genreStatus === status ? "on" : ""} key={status || "all"} onClick={() => setGenreStatus(status)}><span>{status || "전체"}</span><small>{count}</small></button>;
            })}
          </div>
          <div className="genreChapterList">
            {genreGroups.length ? genreGroups.map((item, index) => <button type="button" key={item.name} onClick={() => setListModal({ title: item.name, subtitle: `${genreStatus || "전체 상태"} · ${item.books.length}작품`, books: item.books, mode: "genre" })}><span className="genreChapterIndex"><small>GENRE</small><b>{String(index + 1).padStart(2, "0")}</b></span><span className="genreChapterName"><i>{genreInitial(item.name)}</i><b>{item.name}</b><em /></span><span className="genreChapterMeta"><strong>{item.books.length}<small>작품</small></strong><em>목록 보기 ↗</em></span></button>) : <p>해당 상태의 작품이 아직 없어요.</p>}
          </div>
        </div>
      </section>
      </div>}
      {statsTab === "spending" && <div className="statsTabPanel" role="tabpanel">
      <section className="statsSection spendingSection">
        <header><span>SPENDING</span><small>나의 전체 구매 기록</small></header>
        <div className="statsSummary spendingSummary">
          <div><small>총 실구매액</small><strong>{won(paid)}</strong></div>
          <div><small>절약한 금액</small><strong>{won(Math.max(0, list - paid))}</strong></div>
        </div>
      </section>
      {months.length > 0 && <section className="statsSection purchaseLog"><header><span>PURCHASE LOG</span><label className="purchaseYearSelect"><span>연도 선택</span><select aria-label="구매 로그 연도 선택" value={activePurchaseYear} onChange={(event) => setPurchaseYear(event.target.value)}>{purchaseYears.map(year => <option key={year} value={year}>{year}</option>)}</select></label></header><div className="purchaseMonths">{Array.from({ length: 12 }, (_, index) => {
        const month = String(index + 1).padStart(2, "0");
        const item = months.find(value => value.name === `${activePurchaseYear}-${month}`);
        const purchaseMonth = `${activePurchaseYear}-${month}`;
        const monthBooks = [...new Map(purchaseEntries.filter(entry => entry.date.startsWith(purchaseMonth)).map(entry => [entry.book.id, entry.book])).values()];
        return <button type="button" className={item ? "hasPurchase" : ""} key={month} onClick={() => setListModal({ title: `${activePurchaseYear}년 ${Number(month)}월`, subtitle: item ? `${item.volumes}권 · ${item.works}작품 구매` : "구매 기록 없음", books: monthBooks, mode: "purchase", purchaseMonth })}><span>{month}</span><strong>{item ? won(item.paid) : "–"}</strong><small>{item ? `${item.volumes}권 · ${item.works}작품` : "기록 없음"}</small></button>;
      })}</div></section>}
      </div>}
      {listModal && <StatsListModal {...listModal} onClose={() => setListModal(null)} />}
    </section>
  );
}

export default function FeedPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [view, setView] = useState<ViewMode>("grid");
  const [recordView, setRecordView] = useState<"calendar" | "records">("calendar");
  const [profileView, setProfileView] = useState<"stats" | "hall">("stats");
  const [pending, setPending] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [topMenuOpen, setTopMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [collectionQuickFilter, setCollectionQuickFilter] = useState<"genre" | "status" | null>(null);
  const [fontMode, setFontMode] = useState<"default" | "summer">("default");
  const [fontScale, setFontScale] = useState(100);
  const [sortMode, setSortMode] = useState<SortMode>("created");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [step, setStep] = useState<"search" | "book" | "reading" | "purchase" | "notes">("search");
  const [search, setSearch] = useState("");
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
  const [searchAuthor, setSearchAuthor] = useState("");
  const [searchPlatform, setSearchPlatform] = useState("");
  const [results, setResults] = useState<SearchBook[]>([]);
  const [searching, setSearching] = useState(false);
  const [form, setForm] = useState<BookRecord>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [readingDate, setReadingDate] = useState("");
  const [purchaseDraft, setPurchaseDraft] = useState<VolumePurchase>({ label: "1권", purchase_date: null, list_price: 0, paid_price: 0, methods: [] });
  const [editingPurchaseIndex, setEditingPurchaseIndex] = useState<number | null>(null);
  const [purchaseOnlyEdit, setPurchaseOnlyEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [coverProcessing, setCoverProcessing] = useState(false);
  const [platformOptions, setPlatformOptions] = useState(defaultPlatforms);
  const [purchaseMethodOptions, setPurchaseMethodOptions] = useState(defaultPurchaseMethods);
  const [profileImage, setProfileImage] = useState("");
  const [message, setMessage] = useState("");
  const [detailBook, setDetailBook] = useState<Book | null>(null);
  const [feedCoverBook, setFeedCoverBook] = useState<Book | null>(null);
  const [resumeDraft, setResumeDraft] = useState<{ form: BookRecord; step: "book" | "reading" | "purchase" | "notes"; readingDate: string } | null>(null);
  const sectionScrollRef = useRef<Record<"grid" | "feed" | "record" | "stats", number>>({ grid: 0, feed: 0, record: 0, stats: 0 });
  const scrollRestoreTargetRef = useRef<"grid" | "feed" | "record" | "stats" | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const addSearchInputRef = useRef<HTMLInputElement | null>(null);
  const topMenuRef = useRef<HTMLDivElement | null>(null);
  const topMenuToggleRef = useRef<HTMLButtonElement | null>(null);
  const coverScrollRef = useRef(0);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  async function load(show = false) {
    setLoading(true);
    try {
      const r = await fetch("/api/books", { cache: "no-store" });
      const data = await r.json() as { items?: Book[]; configured?: boolean };
      if (!r.ok) throw new Error("최신 기록을 불러오지 못했어요.");
      setBooks(data.items || []);
      if (show) {
        setNotice(
          data.configured
            ? "최신 기록으로 업데이트했어요"
            : "Firebase 연결 전 미리보기예요",
        );
        setTimeout(() => setNotice(""), 2200);
      }
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const cachedBooks = await readCachedBooks();
        if (active && cachedBooks.length) {
          setBooks(cachedBooks);
          setLoading(false);
        }
      } catch {
        // Cache failure should never prevent the live Firebase request.
      }
      if (active) await load();
    })();
    const savedSort = window.localStorage.getItem("readiary-sort-mode");
    if (savedSort === "created" || savedSort === "purchase") setSortMode(savedSort);
    const savedDirection = window.localStorage.getItem("readiary-sort-direction");
    if (savedDirection === "desc" || savedDirection === "asc") setSortDirection(savedDirection);
    if (window.localStorage.getItem("readiary-font-mode") === "summer") setFontMode("summer");
    const savedFontScale = Number(window.localStorage.getItem("readiary-font-scale"));
    if (savedFontScale >= 80 && savedFontScale <= 150 && savedFontScale % 5 === 0) setFontScale(savedFontScale);
    fetch("/api/options", { cache: "no-store" }).then((response) => response.json() as Promise<{ platforms?: string[]; purchase_methods?: string[]; purchase_methods_customized?: boolean; profile_image?: string }>).then((data) => {
      setPlatformOptions([...new Set([...defaultPlatforms, ...(data.platforms || [])])]);
      setPurchaseMethodOptions(data.purchase_methods_customized ? (data.purchase_methods || []) : [...new Set([...defaultPurchaseMethods, ...(data.purchase_methods || [])])]);
      const localProfile = window.localStorage.getItem("readiary-profile-image") || "";
      setProfileImage(data.profile_image || localProfile);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty("--font-scale", String((fontScale / 100) * 1.1));
    window.localStorage.setItem("readiary-font-scale", String(fontScale));
  }, [fontScale]);
  useEffect(() => {
    if (!topMenuOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setTopMenuOpen(false);
    }
    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target as Node;
      if (topMenuRef.current?.contains(target) || topMenuToggleRef.current?.contains(target)) return;
      setTopMenuOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
    };
  }, [topMenuOpen]);
  useEffect(() => {
    if (!adding) return;
    function closeAddOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setAdding(false);
    }
    document.addEventListener("keydown", closeAddOnEscape);
    return () => document.removeEventListener("keydown", closeAddOnEscape);
  }, [adding]);
  useEffect(() => {
    if (!adding || step !== "search") return;
    const frame = requestAnimationFrame(() => addSearchInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [adding, step]);
  useEffect(() => {
    if (loading) return;
    void writeCachedBooks(books).catch(() => undefined);
  }, [books, loading]);
  useEffect(() => {
    if (!adding || editingId || step === "search") return;
    const meaningful = Boolean(form.title.trim() || form.author.trim() || form.cover_url || step !== "book");
    if (!meaningful) return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem("readiary-record-draft", JSON.stringify({ form, step, readingDate, savedAt: Date.now() }));
      } catch {
        // Large local images can exceed browser draft storage. The live form is
        // still kept intact, so drafting simply pauses until it becomes smaller.
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [adding, editingId, form, readingDate, step]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return books.filter((book) => {
      const textMatch = !q || `${book.title} ${book.author}`.toLowerCase().includes(q);
      return textMatch && (!statusFilters.length || statusFilters.includes(book.status)) && (!categoryFilters.length || categoryFilters.includes(book.category));
    }).sort((a, b) => {
      const aDate = sortMode === "purchase" ? firstPurchaseDate(a) : (a.created_at || "");
      const bDate = sortMode === "purchase" ? firstPurchaseDate(b) : (b.created_at || "");
      if (!aDate && bDate) return 1;
      if (aDate && !bDate) return -1;
      const dateOrder = aDate.localeCompare(bDate);
      const createdOrder = String(a.created_at || "").localeCompare(String(b.created_at || ""));
      return sortDirection === "asc" ? (dateOrder || createdOrder) : -(dateOrder || createdOrder);
    });
  }, [books, query, statusFilters, categoryFilters, sortMode, sortDirection]);
  function selectSort(mode: SortMode) {
    const nextDirection = sortMode === mode ? (sortDirection === "desc" ? "asc" : "desc") : "desc";
    setSortMode(mode);
    setSortDirection(nextDirection);
    window.localStorage.setItem("readiary-sort-mode", mode);
    window.localStorage.setItem("readiary-sort-direction", nextDirection);
  }
  function toggleFontMode() {
    const next = fontMode === "default" ? "summer" : "default";
    setFontMode(next);
    window.localStorage.setItem("readiary-font-mode", next);
    setTopMenuOpen(false);
  }
  function adjustFontScale(direction: -1 | 1) {
    setFontScale((current) => Math.min(150, Math.max(80, current + direction * 5)));
  }
  useLayoutEffect(() => {
    if (view === "feed" && pending)
      document.getElementById(pending)?.scrollIntoView({ block: "start" });
  }, [view, pending]);
  function restoreSectionScroll(section: "grid" | "feed" | "record" | "stats") {
    scrollRestoreTargetRef.current = section;
  }
  function openPost(book: Book, index: number) {
    sectionScrollRef.current[currentSection as "grid" | "feed" | "record" | "stats"] = window.scrollY;
    setPending(`post-${book.id || index}`);
    setView("feed");
  }
  function showGrid() {
    sectionScrollRef.current[currentSection as "grid" | "feed" | "record" | "stats"] = window.scrollY;
    setPending(null);
    setView("grid");
    restoreSectionScroll("grid");
  }
  function openAdd() {
    setPurchaseOnlyEdit(false);
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const storedDraft = window.localStorage.getItem("readiary-record-draft");
    if (storedDraft) {
      try {
        const draft = JSON.parse(storedDraft) as { form?: BookRecord; step?: "book" | "reading" | "purchase" | "notes"; readingDate?: string };
        if (draft.form?.title) {
          setResumeDraft({ form: { ...empty, ...draft.form }, step: draft.step || "book", readingDate: draft.readingDate || "" });
          return;
        }
      } catch {
        // An outdated draft is discarded below.
      }
      window.localStorage.removeItem("readiary-record-draft");
    }
    setAdding(true);
    setEditingId(null);
    setStep("search");
    setSearch("");
    setAdvancedSearchOpen(false);
    setSearchAuthor("");
    setSearchPlatform("");
    setResults([]);
    setMessage("");
    setForm({ ...empty, reading_dates: [todayKey] });
    setReadingDate("");
    setPurchaseDraft({ label: "1권", purchase_date: null, list_price: 0, paid_price: 0, methods: [] });
    setEditingPurchaseIndex(null);
  }
  function continueDraft() {
    if (!resumeDraft) return;
    setEditingId(null);
    setPurchaseOnlyEdit(false);
    setForm(resumeDraft.form);
    setStep(resumeDraft.step);
    setReadingDate(resumeDraft.readingDate);
    setPurchaseDraft({ label: `${(resumeDraft.form.purchase_items?.length || 0) + 1}${resumeDraft.form.count_unit || "권"}`, purchase_date: null, list_price: 0, paid_price: 0, methods: [] });
    setEditingPurchaseIndex(null);
    setSearch("");
    setAdvancedSearchOpen(false);
    setSearchAuthor("");
    setSearchPlatform("");
    setResults([]);
    setMessage("");
    setResumeDraft(null);
    setAdding(true);
  }
  function discardDraft() {
    window.localStorage.removeItem("readiary-record-draft");
    setResumeDraft(null);
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    setEditingId(null);
    setPurchaseOnlyEdit(false);
    setStep("search");
    setSearch("");
    setAdvancedSearchOpen(false);
    setSearchAuthor("");
    setSearchPlatform("");
    setResults([]);
    setMessage("");
    setForm({ ...empty, reading_dates: [todayKey] });
    setReadingDate("");
    setPurchaseDraft({ label: "1권", purchase_date: null, list_price: 0, paid_price: 0, methods: [] });
    setEditingPurchaseIndex(null);
    setAdding(true);
  }
  function openEdit(book: Book, initialStep: "book" | "reading" | "purchase" | "notes" = "book") {
    const { id, ...record } = book;
    const purchaseItems = purchaseItemsByDate(record.purchase_items?.length
      ? record.purchase_items.map((item) => ({ ...item, purchase_date: item.purchase_date || record.purchase_date || null, methods: item.methods || [] }))
      : [{ label: "기존 합계", purchase_date: record.purchase_date || null, list_price: record.list_price || 0, paid_price: record.paid_price || 0, methods: record.purchase_method ? [record.purchase_method] : [] }], record.purchase_date || "");
    if (record.purchase_method && !purchaseItems.some((item) => item.methods?.length)) purchaseItems[0].methods = [record.purchase_method];
    setEditingId(id);
    setPurchaseOnlyEdit(initialStep === "purchase");
    setForm({
      ...record,
      purchase_items: purchaseItems,
    });
    setReadingDate("");
    setPurchaseDraft({ label: `${purchaseItems.length + 1}${record.count_unit || "권"}`, purchase_date: null, list_price: 0, paid_price: 0, methods: [] });
    setEditingPurchaseIndex(null);
    setMessage("");
    setStep(initialStep);
    setDetailBook(null);
    setAdding(true);
  }
  async function deleteBook(book: Book) {
    const r = await fetch("/api/books", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: book.id }),
    });
    const data = await r.json() as { error?: string };
    if (!r.ok) throw new Error(data.error || "삭제하지 못했어요.");
    setBooks((prev) => prev.filter((item) => item.id !== book.id));
    setDetailBook(null);
  }
  async function changeBookStatus(book: Book, status: string) {
    const finishedDate = status === "완독" || status === "하차" ? book.finished_date : null;
    const r = await fetch("/api/books", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...book, status, finished_date: finishedDate }),
    });
    const data = await r.json() as { error?: string; item: Book };
    if (!r.ok) throw new Error(data.error || "상태를 수정하지 못했어요.");
    setBooks((prev) => prev.map((item) => item.id === book.id ? data.item : item));
    setDetailBook((current) => current?.id === book.id ? data.item : current);
    return data.item;
  }
  async function findBooks(e: FormEvent) {
    e.preventDefault();
    if (!search.trim()) return;
    setSearching(true);
    setMessage("");
    try {
      const params = new URLSearchParams({ q: search.trim() });
      if (advancedSearchOpen && searchAuthor.trim()) params.set("author", searchAuthor.trim());
      if (advancedSearchOpen && searchPlatform) params.set("platform", searchPlatform);
      const r = await fetch(`/api/search?${params.toString()}`);
      const data = await r.json() as { books?: SearchBook[] };
      setResults(data.books || []);
      if (!data.books?.length)
        setMessage(advancedSearchOpen ? "제목·작가·플랫폼이 일치하는 결과가 없어요." : "검색 결과가 없어요. 상세검색이나 직접 입력을 이용해보세요.");
    } catch {
      setMessage("검색에 실패했어요.");
    } finally {
      setSearching(false);
    }
  }
  function choose(book: SearchBook) {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const unit = book.countUnit || "권";
    setForm({
      ...empty,
      title: book.title,
      author: book.author,
      total_count: book.totalCount || 1,
      count_unit: unit,
      purchase_items: [],
      category: book.category,
      platform: book.platform,
      cover_url: book.cover,
      source_url: book.url,
      reading_dates: [todayKey],
    });
    setPurchaseDraft({ label: `1${unit}`, purchase_date: null, list_price: 0, paid_price: 0, methods: [] });
    setEditingPurchaseIndex(null);
    setStep("book");
  }
  const wizardSteps = ["book", "reading", "purchase", "notes"] as const;
  function moveWizard(next: typeof wizardSteps[number]) {
    setMessage("");
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setStep(next);
    requestAnimationFrame(() => { if (drawerRef.current) drawerRef.current.scrollTop = 0; });
  }
  function nextWizardStep() {
    const index = wizardSteps.indexOf(step as typeof wizardSteps[number]);
    if (step === "book" && !form.title.trim()) {
      setMessage("책 제목을 입력해주세요.");
      if (drawerRef.current) drawerRef.current.scrollTop = 0;
      return;
    }
    if (index >= 0 && index < wizardSteps.length - 1) moveWizard(wizardSteps[index + 1]);
  }
  function previousWizardStep() {
    const index = wizardSteps.indexOf(step as typeof wizardSteps[number]);
    if (index > 0) moveWizard(wizardSteps[index - 1]);
    else if (!editingId) setStep("search");
  }
  const field = <K extends keyof BookRecord>(key: K, value: BookRecord[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  function setPurchaseItems(items: VolumePurchase[]) {
    const sortedItems = purchaseItemsByDate(items);
    const listPrice = sortedItems.reduce((sum, item) => sum + (Number(item.list_price) || 0), 0);
    const paidPrice = sortedItems.reduce((sum, item) => sum + (Number(item.paid_price) || 0), 0);
    const methods = [...new Set(sortedItems.flatMap((item) => item.methods || []))];
    const purchaseDate = sortedItems.map((item) => item.purchase_date || "").filter(Boolean).sort()[0] || null;
    setForm((prev) => ({ ...prev, purchase_items: sortedItems, purchase_date: purchaseDate, list_price: listPrice, paid_price: paidPrice, purchase_method: methods.join(" + ") }));
  }
  function resetPurchaseDraft(items = form.purchase_items || []) {
    setPurchaseDraft({ label: `${items.length + 1}${form.count_unit || "권"}`, purchase_date: null, list_price: 0, paid_price: 0, methods: [] });
    setEditingPurchaseIndex(null);
  }
  function commitPurchaseDraft() {
    const clean: VolumePurchase = {
      label: purchaseDraft.label.trim() || `${(form.purchase_items?.length || 0) + 1}${form.count_unit || "권"}`,
      purchase_date: purchaseDraft.purchase_date || null,
      list_price: Number(purchaseDraft.list_price) || 0,
      paid_price: Number(purchaseDraft.paid_price) || 0,
      methods: purchaseDraft.methods || [],
    };
    const items = [...(form.purchase_items || [])];
    if (editingPurchaseIndex === null) items.push(clean);
    else items[editingPurchaseIndex] = clean;
    setPurchaseItems(items);
    resetPurchaseDraft(items);
  }
  function editPurchaseItem(index: number) {
    const item = form.purchase_items?.[index];
    if (!item) return;
    setPurchaseDraft({ ...item, methods: item.methods || [] });
    setEditingPurchaseIndex(index);
  }
  function changeCountUnit(unit: "권" | "화") {
    setForm((prev) => ({
      ...prev,
      count_unit: unit,
      purchase_items: (prev.purchase_items || []).map((item, index) => ({
        ...item,
        label: /^\d+[권화]$/.test(item.label) ? `${index + 1}${unit}` : item.label,
      })),
    }));
    setPurchaseDraft((prev) => ({ ...prev, label: /^\d+[권화]$/.test(prev.label) ? `${(form.purchase_items?.length || 0) + 1}${unit}` : prev.label }));
  }
  async function changeCover(file?: File) {
    if (!file) return;
    setCoverProcessing(true);
    setMessage("");
    try {
      field("cover_url", await prepareCoverImage(file));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "표지를 변경하지 못했어요.");
    } finally {
      setCoverProcessing(false);
      requestAnimationFrame(() => {
        if (drawerRef.current) drawerRef.current.scrollTop = coverScrollRef.current;
      });
    }
  }
  async function addOption(kind: "platforms" | "purchase_methods", value: string) {
    const response = await fetch("/api/options", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, value }) });
    const data = await response.json() as { error?: string };
    if (!response.ok) { setMessage(data.error || "선택지를 저장하지 못했어요."); throw new Error(data.error); }
    if (kind === "platforms") setPlatformOptions((prev) => [...new Set([...prev, value])]);
    else setPurchaseMethodOptions((prev) => [...new Set([...prev, value])]);
  }
  async function replacePurchaseMethodOptions(values: string[]) {
    const response = await fetch("/api/options", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "purchase_methods", action: "replace", values }) });
    const data = await response.json() as { error?: string };
    if (!response.ok) { setMessage(data.error || "구매방법 목록을 저장하지 못했어요."); throw new Error(data.error); }
    setPurchaseMethodOptions(values);
  }
  async function changeProfileImage(file?: File) {
    if (!file) return;
    try {
      const image = await prepareProfileImage(file);
      setProfileImage(image);
      window.localStorage.setItem("readiary-profile-image", image);
      const response = await fetch("/api/options", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "profile_image", value: image }) });
      if (response.ok) setNotice("프로필 사진을 변경했어요");
      else setNotice("이 기기에 프로필 사진을 저장했어요");
      setTimeout(() => setNotice(""), 2200);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "프로필 사진을 변경하지 못했어요.");
      setTimeout(() => setNotice(""), 2200);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const payload = {
        ...form,
        liked_notes: form.liked_notes.map((note) => note.trim()).filter(Boolean),
        disliked_notes: form.disliked_notes.map((note) => note.trim()).filter(Boolean),
      };
      const r = await fetch("/api/books", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { ...payload, id: editingId } : payload),
      });
      const data = await r.json() as { error?: string; item: Book };
      if (!r.ok) throw new Error(data.error);
      setBooks((prev) => editingId
        ? prev.map((book) => book.id === editingId ? data.item : book)
        : [data.item, ...prev]);
      if (purchaseOnlyEdit) setDetailBook(data.item);
      setAdding(false);
      setEditingId(null);
      setPurchaseOnlyEdit(false);
      window.localStorage.removeItem("readiary-record-draft");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }
  const discount = form.list_price
    ? Math.max(0, Math.round((1 - form.paid_price / form.list_price) * 100))
    : 0;
  const currentSection = view === "calendar" || view === "records" ? "record" : view;
  useLayoutEffect(() => {
    const target = scrollRestoreTargetRef.current;
    if (!target || target !== currentSection) return;
    window.scrollTo(0, sectionScrollRef.current[target]);
    scrollRestoreTargetRef.current = null;
  }, [currentSection]);
  function selectRecordView(next: "calendar" | "records") {
    setRecordView(next);
    setView(next);
  }
  function navigateSection(section: "grid" | "feed" | "record" | "stats") {
    sectionScrollRef.current[currentSection as "grid" | "feed" | "record" | "stats"] = window.scrollY;
    if (section === "grid") showGrid();
    else if (section === "record") setView(recordView);
    else {
      if (section === "feed") {
        setPending(null);
      }
      setView(section);
    }
    if (section !== "grid") restoreSectionScroll(section);
    setSearchOpen(false);
    setFilterOpen(false);
    setTopMenuOpen(false);
    setCollectionQuickFilter(null);
  }
  function beginSwipe(event: TouchEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (adding || detailBook || target.closest("button, input, textarea, select, a, .ratingControl, [role='dialog']")) return;
    const touch = event.touches[0];
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  }
  function finishSwipe(event: TouchEvent<HTMLElement>) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
    const sections: Array<"grid" | "feed" | "record" | "stats"> = ["grid", "feed", "record", "stats"];
    const index = sections.indexOf(currentSection as "grid" | "feed" | "record" | "stats");
    const next = dx < 0 ? index + 1 : index - 1;
    if (sections[next]) navigateSection(sections[next]);
  }
  return (
    <main className={`feedPage dockLayout ${fontMode === "summer" ? "fontSummer" : ""}`} onTouchStart={beginSwipe} onTouchEnd={finishSwipe}>
      <header className={`compactTopBar ${topMenuOpen ? "menuOpen" : ""}`}>
        <button
          className={`searchToggle ${searchOpen ? "on" : ""}`}
          onClick={() => {
            setSearchOpen((v) => !v);
            setFilterOpen(false);
            setTopMenuOpen(false);
          }}
          aria-label="내 기록 검색"
        >
          <Search size={15} />
        </button>
        <button
          ref={topMenuToggleRef}
          className={`topMenuToggle ${topMenuOpen || filterOpen ? "on" : ""}`}
          onClick={() => {
            setTopMenuOpen((open) => !open);
            setSearchOpen(false);
          }}
          aria-label="보기 메뉴"
        >
          <Ellipsis size={18} />
          {(statusFilters.length > 0 || categoryFilters.length > 0) && <i aria-hidden="true" />}
        </button>
        {topMenuOpen && <div ref={topMenuRef} className="topToolMenu">
          <button onClick={() => { setTopMenuOpen(false); setFilterOpen(true); }}><SlidersHorizontal size={14} /><span>필터</span>{(statusFilters.length + categoryFilters.length) > 0 && <small>{statusFilters.length + categoryFilters.length}</small>}</button>
          <button className={sortMode === "created" ? "selected" : ""} onClick={() => selectSort("created")}><ArrowDownUp size={14} /><span>생성일순</span>{sortMode === "created" && <small>{sortDirection === "desc" ? "최신순" : "오래된순"}</small>}</button>
          <button className={sortMode === "purchase" ? "selected" : ""} onClick={() => selectSort("purchase")}><ArrowDownUp size={14} /><span>구매일순</span>{sortMode === "purchase" && <small>{sortDirection === "desc" ? "최신순" : "오래된순"}</small>}</button>
          <button onClick={toggleFontMode}><Type size={14} /><span>글꼴</span><small>{fontMode === "summer" ? "여름소리" : "기본"}</small></button>
          <div className="fontSizeControl">
            <Type size={14} />
            <span>글자 크기</span>
            <span className="fontSizeStepper">
              <button type="button" onClick={() => adjustFontScale(-1)} disabled={fontScale <= 80} aria-label="글자 크기 줄이기">−</button>
              <b>{fontScale}</b>
              <button type="button" onClick={() => adjustFontScale(1)} disabled={fontScale >= 150} aria-label="글자 크기 키우기">+</button>
            </span>
          </div>
          <button className={loading ? "loading" : ""} onClick={() => { setTopMenuOpen(false); void load(true); }} disabled={loading}><RefreshCw size={14} /><span>새로고침</span></button>
        </div>}
      </header>
      {topMenuOpen && <button className="topMenuBackdrop" aria-label="보기 메뉴 닫기" onClick={() => setTopMenuOpen(false)} />}
      {notice && <div className="refreshNotice">{notice}</div>}
      {searchOpen && (
        <div className="searchBar">
          <Search size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="책 제목 또는 저자 검색" autoFocus />
          {query && <button onClick={() => setQuery("")}><X size={13} /></button>}
        </div>
      )}
      {filterOpen && (
        <>
          <button className="filterBackdrop" onClick={() => setFilterOpen(false)} aria-label="필터 닫기" />
          <aside className="filterPanel" role="dialog" aria-label="독서 기록 필터">
            <header className="filterHead">
              <div><b>FILTER</b><small>기록 골라보기</small></div>
              <span>
                {(statusFilters.length > 0 || categoryFilters.length > 0) && <button onClick={() => { setStatusFilters([]); setCategoryFilters([]); }}>초기화</button>}
                <button className="filterClose" onClick={() => setFilterOpen(false)} aria-label="필터 닫기"><X size={14} /></button>
              </span>
            </header>
            <div className="filterGroup">
              <b>상태</b>
              <div className="filterOptions">
                {["", "책바구니", "읽기 전", "읽는 중", "완독", "하차"].map(value => <button className={value ? statusFilters.includes(value) ? "on" : "" : statusFilters.length === 0 ? "on" : ""} key={value || "all"} onClick={() => value ? setStatusFilters(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]) : setStatusFilters([])}><i />{value || "전체"}</button>)}
              </div>
            </div>
            <div className="filterGroup">
              <b>장르</b>
              <div className="filterOptions">
                {["", "BL", "로맨스", "로맨스판타지", "문학", "기타"].map(value => <button className={value ? categoryFilters.includes(value) ? "on" : "" : categoryFilters.length === 0 ? "on" : ""} key={value || "all"} onClick={() => value ? setCategoryFilters(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]) : setCategoryFilters([])}><i />{value || "전체"}</button>)}
              </div>
            </div>
          </aside>
        </>
      )}
      {view !== "stats" && view !== "grid" && (statusFilters.length > 0 || categoryFilters.length > 0) && (
        <div className="activeFilters" aria-label="적용 중인 필터">
          {statusFilters.map(value => <button key={value} onClick={() => setStatusFilters(current => current.filter(item => item !== value))}>{value}<X size={10} /></button>)}
          {categoryFilters.map(value => <button key={value} onClick={() => setCategoryFilters(current => current.filter(item => item !== value))}>{value}<X size={10} /></button>)}
        </div>
      )}
      {(view === "calendar" || view === "records") && (
        <nav className="recordModeSwitch" aria-label="독서 기록 보기 방식">
          <button className={view === "calendar" ? "on" : ""} onClick={() => selectRecordView("calendar")} aria-label="달력 보기">CALENDAR</button>
          <button className={view === "records" ? "on" : ""} onClick={() => selectRecordView("records")} aria-label="기록 목록 보기">ARCHIVE</button>
        </nav>
      )}
      {view === "stats" && (
        <nav className="recordModeSwitch profileModeSwitch" aria-label="프로필 보기 방식">
          <button className={profileView === "stats" ? "on" : ""} onClick={() => setProfileView("stats")}>MY STATS</button>
          <button className={profileView === "hall" ? "on" : ""} onClick={() => setProfileView("hall")}>HALL OF FAME</button>
        </nav>
      )}
      {view === "records" && <ModalRecordArchive books={visible} onEdit={openEdit} onAddPurchase={(book) => openEdit(book, "purchase")} onEditNotes={(book) => openEdit(book, "notes")} onStatusChange={changeBookStatus} onDelete={deleteBook} summerFont={fontMode === "summer"} />}
      {view === "stats" && profileView === "stats" && <StatsView books={books} profileImage={profileImage} onProfileImage={(file) => void changeProfileImage(file)} />}
      {view === "stats" && profileView === "hall" && <HallOfFame books={books} onEdit={openEdit} onAddPurchase={(book) => openEdit(book, "purchase")} onEditNotes={(book) => openEdit(book, "notes")} onStatusChange={changeBookStatus} onDelete={deleteBook} summerFont={fontMode === "summer"} />}
      {loading && books.length === 0 ? (
        <div className="state">피드를 불러오는 중...</div>
      ) : view === "records" || view === "stats" ? null
      : view === "calendar" ? (
        <CalendarView books={visible} onOpen={(book) => openPost(book, visible.indexOf(book))} />
      ) : (
        <>
        <div className={`collectionResult ${collectionQuickFilter ? "open" : ""}`} hidden={view !== "grid"}>
          <span className="collectionFilterSummary">
            <button type="button" onClick={() => setCollectionQuickFilter(current => current === "genre" ? null : "genre")}>{categoryFilters.length ? categoryFilters.map(value => value === "문학" ? "일반문학" : value).join(" · ") : "전체"}</button>
            <i>·</i>
            <button type="button" onClick={() => setCollectionQuickFilter(current => current === "status" ? null : "status")}>{statusFilters.length ? statusFilters.join(" · ") : "전체"}</button>
          </span>
          <b>{visible.length}</b> 작품
          {collectionQuickFilter && <>
            <button type="button" className="collectionQuickBackdrop" aria-label="빠른 필터 닫기" onClick={() => setCollectionQuickFilter(null)} />
            <nav className={`collectionQuickPicker ${collectionQuickFilter}`} aria-label={collectionQuickFilter === "genre" ? "장르 빠른 선택" : "상태 빠른 선택"}>
              {(collectionQuickFilter === "genre"
                ? [["", "전체"], ["BL", "BL"], ["로맨스", "로맨스"], ["로맨스판타지", "로맨스판타지"], ["문학", "일반문학"], ["기타", "기타"]]
                : [["", "전체"], ["책바구니", "책바구니"], ["읽기 전", "읽기 전"], ["읽는 중", "읽는 중"], ["완독", "완독"], ["하차", "하차"]]
              ).map(([value, label]) => {
                const selected = collectionQuickFilter === "genre" ? (value ? categoryFilters.includes(value) : categoryFilters.length === 0) : (value ? statusFilters.includes(value) : statusFilters.length === 0);
                return <button type="button" className={selected ? "on" : ""} key={value || "all"} onClick={() => {
                  if (collectionQuickFilter === "genre") setCategoryFilters(value ? [value] : []);
                  else setStatusFilters(value ? [value] : []);
                  setCollectionQuickFilter(null);
                }}><i />{label}</button>;
              })}
            </nav>
          </>}
        </div>
        <section className="bookGrid collectionGrid" hidden={view !== "grid"}>
          {visible.map((book, index) => {
            return (
              <button
                className={`gridItem collectionBook ${book.status === "완독" ? "done" : book.status === "하차" ? "paused" : book.status === "읽는 중" ? "reading" : book.status === "읽기 전" ? "before" : "basket"}`}
                key={book.id}
                onClick={() => openPost(book, index)}
              >
                <span className="collectionBookStatus">{book.status === "완독" ? "FINISHED" : book.status === "하차" ? "DROPPED" : book.status === "읽는 중" ? "READING" : book.status === "읽기 전" ? "TO READ" : "BASKET"}</span>
                <span className="gridCover">
                  <Cover book={book} />
                </span>
                <span className="collectionBookInfo"><b>{book.title}</b><small>{book.author || "저자 미상"}</small></span>
                <span className="collectionBookRating">
                  <Rating rating={book.rating} />
                </span>
              </button>
            );
          })}
        </section>
        <section className="feedList" hidden={view !== "feed"}>
          {visible.map((book, index) => (
            <article
              id={`post-${book.id || index}`}
              className="post"
              data-export-book-id={book.id}
              data-export-filename={`readiary-${book.title}-feed`}
              key={book.id}
            >
              <header className="postHead">
                <span className="identity">
                  <button type="button" className="profileCover" disabled={!book.cover_url} onClick={() => setFeedCoverBook(book)} aria-label={book.cover_url ? `${book.title} 표지 전체보기` : undefined}>
                    {book.cover_url ? (
                      <img src={book.cover_url} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <span>📖</span>
                    )}
                  </button>
                  <b>{book.title}</b>
                  <small>{book.author || "저자 미상"}</small>
                </span>
                <span className="postHeadTools"><ImageShareButton key={book.id} compact filename={`readiary-${book.title}-feed`} targetId={`post-${book.id || index}`} bookId={book.id} /><span className="postNumber">{String(index + 1).padStart(2, "0")}</span></span>
              </header>
              <button className="feedCover" onClick={() => setDetailBook(book)} aria-label={`${book.title} 상세 기록 열기`}>
                <FeedArtwork book={book} />
              </button>
              <div className="postBody">
                <div className="summary">
                  <div className="metaActions">
                    <span
                      className={`genreText ${book.category === "BL" ? "bl" : book.category === "로맨스" ? "romance" : book.category === "로맨스판타지" ? "rofan" : "books"}`}
                    >
                      #{book.category}
                    </span>
                    <span
                      className={`statusText ${book.status === "완독" ? "done" : book.status === "읽는 중" ? "reading" : book.status === "하차" ? "paused" : book.status === "읽기 전" ? "before" : "basket"}`}
                    >
                      #{book.status}
                    </span>
                  </div>
                  <ClassicRating rating={book.rating} />
                </div>
                <div className="caption">
                  <BookNotes book={book} hideBasket />
                </div>
              </div>
            </article>
          ))}
        </section>
        </>
      )}
      {detailBook && <ModalRecordArchive books={visible} openBook={detailBook} onClose={() => setDetailBook(null)} onEdit={openEdit} onAddPurchase={(book) => openEdit(book, "purchase")} onEditNotes={(book) => openEdit(book, "notes")} onStatusChange={changeBookStatus} onDelete={deleteBook} hideList summerFont={fontMode === "summer"} />}
      {feedCoverBook?.cover_url && <CoverLightbox src={feedCoverBook.cover_url} title={feedCoverBook.title} onClose={() => setFeedCoverBook(null)} />}
      <nav className="bottomDock" aria-label="주요 화면">
        <button className={currentSection === "grid" ? "active" : ""} onClick={() => navigateSection("grid")} aria-label="모아보기"><LayoutGrid size={18} strokeWidth={1.4} /></button>
        <button className={currentSection === "feed" ? "active" : ""} onClick={() => navigateSection("feed")} aria-label="피드"><Hash size={17} strokeWidth={1.55} /></button>
        <button className="dockAdd" onClick={openAdd} aria-label="책 추가"><Plus size={23} strokeWidth={2.25} /></button>
        <button className={currentSection === "record" ? "active" : ""} onClick={() => navigateSection("record")} aria-label="기록"><span className="curledHeartIcon" aria-hidden="true" /></button>
        <button className={`dockProfile ${currentSection === "stats" ? "active" : ""}`} onClick={() => navigateSection("stats")} aria-label="프로필과 독서 통계"><span className="dockProfileRing">{profileImage ? <img src={profileImage} alt="" /> : <i>R</i>}</span></button>
      </nav>
      {resumeDraft && (
        <div className="draftResumeShade" role="presentation">
          <section className="draftResumeDialog" role="dialog" aria-modal="true" aria-label="작성 중인 기록 이어쓰기">
            <small>SAVED DRAFT</small>
            <h2>작성 중인 기록이 있어요</h2>
            <p>‘{resumeDraft.form.title}’ 기록을 {resumeDraft.step.toUpperCase()} 단계부터 이어서 작성할까요?</p>
            <div>
              <button type="button" onClick={discardDraft}>새로 작성</button>
              <button type="button" className="primary" onClick={continueDraft}>이어서 작성</button>
            </div>
          </section>
        </div>
      )}
      {adding && (
        <div className="drawerShade" onMouseDown={() => setAdding(false)}>
          <aside ref={drawerRef} className="addDrawer" onMouseDown={(e) => e.stopPropagation()}>
            <header>
              <button
                onClick={() => editingId && step === "book" ? setAdding(false) : step === "search" ? setAdding(false) : previousWizardStep()}
              >
                {step === "search" || (editingId && step === "book") ? "×" : "←"}
              </button>
              <b>{editingId ? "기록 수정" : step === "search" ? "책 추가" : "독서 기록"}</b>
              <span />
            </header>
            {step === "search" ? (
              <div className="drawerBody">
                <form className="addSearch" onSubmit={findBooks}>
                  <Search size={15} />
                  <input
                    ref={addSearchInputRef}
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="책 제목 검색"
                  />
                  <button>{searching ? "…" : "검색"}</button>
                </form>
                <div className="searchSecondaryActions">
                  <button type="button" className={`advancedSearchToggle ${advancedSearchOpen ? "open" : ""}`} aria-expanded={advancedSearchOpen} onClick={() => setAdvancedSearchOpen((open) => !open)}>
                    <span>상세검색</span>
                  </button>
                  <button type="button" className="manual" onClick={() => {
                    setForm((current) => ({ ...current, total_count: 0, category: "" }));
                    setStep("book");
                  }}>
                    검색 없이 직접 입력
                  </button>
                </div>
                {advancedSearchOpen && (
                  <div className="advancedSearchFields">
                    <input aria-label="작가명" value={searchAuthor} onChange={(event) => setSearchAuthor(event.target.value)} placeholder="작가명 입력" />
                    <select aria-label="검색 플랫폼" value={searchPlatform} onChange={(event) => setSearchPlatform(event.target.value)}>
                      <option value="">전체 플랫폼</option>
                      <option value="리디북스">리디북스</option>
                      <option value="카카오페이지">카카오페이지</option>
                      <option value="네이버시리즈">네이버시리즈</option>
                    </select>
                  </div>
                )}
                {message && <p className="formMessage">{message}</p>}
                <div className="results">
                  {results.map((book, i) => (
                    <button
                      key={`${book.url}-${i}`}
                      onClick={() => choose(book)}
                    >
                      {book.cover ? (
                        <img src={book.cover} alt="" />
                      ) : (
                        <span className="miniNoCover">BOOK</span>
                      )}
                      <span>
                        <b>{book.title}</b>
                        <small>
                          {book.author || "저자 미상"} · {book.platform}
                        </small>
                      </span>
                      <Plus size={14} />
                    </button>
                  ))}
                </div>
                {!search && !results.length && (
                  <div className="emptySearch">
                    <Search size={22} />
                    <b>책을 검색해 바로 기록해보세요</b>
                    <p>리디북스 · 카카오페이지 · 네이버 시리즈</p>
                  </div>
                )}
              </div>
            ) : (
              <form className="recordForm wizardForm" onSubmit={(e) => {
                if (step === "notes" || (step === "purchase" && purchaseOnlyEdit)) void save(e);
                else { e.preventDefault(); nextWizardStep(); }
              }}>
                <div className="wizardProgress" aria-label="기록 작성 단계">
                  {wizardSteps.map((item, index) => (
                    <button type="button" aria-current={item === step ? "step" : undefined} onClick={() => moveWizard(item)} className={`${item === step ? "active" : ""} ${wizardSteps.indexOf(step as typeof wizardSteps[number]) > index ? "done" : ""}`} key={item}>
                      <i>{index + 1}</i><b>{item.toUpperCase()}</b>
                    </button>
                  ))}
                </div>
                {step === "book" && <div className="wizardPage wizardBookPage">
                <h3 className="formTopTitle">BOOK</h3>
                <div className="selectedBook">
                  <div className="selectedBookCover">
                    <label className="coverPicker" aria-label={form.cover_url ? "커버 이미지 변경" : "커버 이미지 추가"}>
                      {form.cover_url ? <img src={form.cover_url} alt="" /> : <span className="miniNoCover">BOOK</span>}
                      {form.cover_url && <span className="coverPickerHint"><ImagePlus size={13} />{coverProcessing ? "처리 중" : "표지 변경"}</span>}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={coverProcessing}
                        onPointerDown={() => { coverScrollRef.current = drawerRef.current?.scrollTop || 0; }}
                        onFocus={() => requestAnimationFrame(() => { if (drawerRef.current) drawerRef.current.scrollTop = coverScrollRef.current; })}
                        onChange={(e) => { void changeCover(e.target.files?.[0]); e.currentTarget.value = ""; }}
                      />
                    </label>
                    {form.cover_url && <button type="button" onClick={() => field("cover_url", "")}>표지 제거</button>}
                  </div>
                  <div>
                    <label>
                      제목
                      <input
                        required
                        placeholder="비어 있음"
                        value={form.title}
                        onChange={(e) => field("title", e.target.value)}
                      />
                    </label>
                    <label>
                      저자
                      <input
                        placeholder="비어 있음"
                        value={form.author}
                        onChange={(e) => field("author", e.target.value)}
                      />
                    </label>
                  </div>
                </div>
                <div className="fields">
                  <div className="bookMetaFields full">
                    <label className="countField">
                      <span className="propertyLabel">{form.count_unit === "화" ? "총 화수" : "총 권수"}</span>
                      <span className={`countValue ${form.total_count ? `hasCount digits${Math.min(3, String(form.total_count).length)}` : "isEmpty"}`}><span className="countNumber"><span aria-hidden="true">{form.total_count || 0}</span><input aria-label="총 수량" type="text" inputMode="numeric" value={form.total_count || ""} onChange={(e) => field("total_count", Number(e.target.value.replace(/\D/g, "")))} /></span><span className="countUnit"><span aria-hidden="true">{form.count_unit || "권"}</span><select aria-label="수량 단위" value={form.count_unit || "권"} onChange={(e) => changeCountUnit(e.target.value as "권" | "화")}><option>권</option><option>화</option></select></span></span>
                    </label>
                    <label className={`categoryProperty ${form.category ? "" : "emptySelectProperty"}`}>
                      <span className="propertyLabel">카테고리</span>
                      <select value={form.category} onChange={(e) => field("category", e.target.value)}>
                        <option value="">비어 있음</option>
                        <option>BL</option><option>로맨스</option><option>로맨스판타지</option><option>문학</option><option>기타</option>
                      </select>
                    </label>
                    <EditableSelect label="플랫폼" value={form.platform} options={platformOptions} onChange={(value) => field("platform", value)} onAdd={(value) => addOption("platforms", value)} />
                  </div>
                </div>
                </div>}
                {step === "reading" && <div className="fields wizardPage wizardReadingPage">
                  <h3 className="formSectionTitle readingTitle">READING</h3>
                  <label className="statusProperty">
                    <span className="propertyLabel">상태</span>
                    <select
                      value={form.status}
                      onChange={(e) => field("status", e.target.value)}
                    >
                      <option>책바구니</option>
                      <option>읽기 전</option>
                      <option>읽는 중</option>
                      <option>완독</option>
                      <option>하차</option>
                    </select>
                  </label>
                  <div className={`notionDateProperty ${form.finished_date ? "" : "isEmpty"}`}>
                    <span className="propertyLabel">{form.status === "완독" ? "완독일" : form.status === "하차" ? "하차일" : "종료일"}</span>
                    <span className={`datePropertyValue ${form.finished_date ? "hasValue" : ""}`}>
                      <FlexibleDatePicker
                        ariaLabel={form.status === "완독" ? "완독일" : form.status === "하차" ? "하차일" : "종료일"}
                        value={form.finished_date || ""}
                        onChange={(date) => {
                          field("finished_date", date || null);
                          if (date && !form.reading_dates?.includes(date)) {
                            field("reading_dates", [...(form.reading_dates || []), date].sort());
                          }
                        }}
                      />
                      {form.finished_date && <button type="button" className="dateClear" aria-label="완독 또는 하차일 지우기" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.preventDefault(); e.stopPropagation(); field("finished_date", null); }}><X size={13} /></button>}
                    </span>
                  </div>
                  <div className={`full readingDatesField ${(form.reading_dates || []).length ? "hasDates" : "dateIsEmpty"}`}>
                    <span className="propertyLabel">읽은 날</span>
                    <span className="readingDatesValue">
                      {(form.reading_dates || []).length === 0 ? (
                        <span className="dateAdder">
                          <FlexibleDatePicker value={readingDate} ariaLabel="읽은 날 추가" onChange={(date) => {
                            if (!date) return;
                            if (!form.reading_dates?.includes(date)) field("reading_dates", [...(form.reading_dates || []), date].sort());
                            setReadingDate("");
                          }} />
                        </span>
                      ) : (
                        <>
                          <span className="dateChips">
                            {(form.reading_dates || []).map(date => (
                              <button type="button" key={date} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.preventDefault(); e.stopPropagation(); field("reading_dates", (form.reading_dates || []).filter(item => item !== date)); }}>
                                {date.replaceAll("-", ".")} <X size={10} />
                              </button>
                            ))}
                          </span>
                          <span className="readingDateAdd" aria-label="읽은 날 더 추가">
                            <FlexibleDatePicker compact value={readingDate} ariaLabel="읽은 날 더 추가" onChange={(date) => {
                              if (!date) return;
                              if (!form.reading_dates?.includes(date)) field("reading_dates", [...(form.reading_dates || []), date].sort());
                              setReadingDate("");
                            }} />
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                  <label>
                    평점
                    <InteractiveRating
                      value={form.rating ?? 0}
                      onChange={(value) => field("rating", value)}
                    />
                  </label>
                  <label>
                    독서량
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="비어 있음"
                      value={form.read_count || ""}
                      onChange={(e) => field("read_count", Number(e.target.value.replace(/\D/g, "")))}
                    />
                  </label>
                </div>}
                {step === "purchase" && <div className="fields wizardPage wizardPurchasePage">
                  <h3 className="formSectionTitle purchaseTitle">PURCHASE</h3>
                  <div className="volumePurchases full">
                    <div className="purchaseEntryComposer">
                      <label><span>{form.count_unit || "권"} 정보</span><input value={purchaseDraft.label} onChange={(event) => setPurchaseDraft((prev) => ({ ...prev, label: event.target.value }))} placeholder={`예: 1${form.count_unit || "권"}`} /></label>
                      <div className={`purchaseItemDate ${purchaseDraft.purchase_date ? "" : "isEmpty"}`}>
                        <span>구매일</span>
                        <span className={`datePropertyValue ${purchaseDraft.purchase_date ? "hasValue" : ""}`}>
                          <FlexibleDatePicker ariaLabel={`${purchaseDraft.label || form.count_unit || "권"} 구매일`} value={purchaseDraft.purchase_date || ""} onChange={(date) => setPurchaseDraft((prev) => ({ ...prev, purchase_date: date || null }))} />
                          {purchaseDraft.purchase_date && <button type="button" className="dateClear" aria-label="구매일 지우기" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setPurchaseDraft((prev) => ({ ...prev, purchase_date: null })); }}><X size={13} /></button>}
                        </span>
                      </div>
                      <label><span>판매가</span><input type="text" inputMode="numeric" value={purchaseDraft.list_price || ""} onChange={(event) => setPurchaseDraft((prev) => ({ ...prev, list_price: Number(event.target.value.replace(/\D/g, "")) }))} placeholder="비어 있음" /></label>
                      <label><span>실구매가</span><input type="text" inputMode="numeric" value={purchaseDraft.paid_price || ""} onChange={(event) => setPurchaseDraft((prev) => ({ ...prev, paid_price: Number(event.target.value.replace(/\D/g, "")) }))} placeholder="비어 있음" /></label>
                      <div className="purchaseMethodProperty"><span>구매방법</span><MultiEditableSelect values={purchaseDraft.methods || []} options={purchaseMethodOptions} onChange={(values) => setPurchaseDraft((prev) => ({ ...prev, methods: values }))} onAdd={(value) => addOption("purchase_methods", value)} onOptionsChange={replacePurchaseMethodOptions} /></div>
                      <div className="purchaseEntryActions">
                        {editingPurchaseIndex !== null && <button type="button" onClick={() => resetPurchaseDraft()}>취소</button>}
                        <button type="button" className="primary" onClick={commitPurchaseDraft}>{editingPurchaseIndex === null ? `${form.count_unit || "권"} 기록` : "수정 완료"}</button>
                      </div>
                    </div>
                    {!!form.purchase_items?.length && <div className={`savedPurchaseList ${form.purchase_items.some((item) => item.label.trim().length >= 9) ? "hasLongLabels" : ""}`}>
                    <div className="savedPurchaseHead" aria-hidden="true"><span>{form.count_unit || "권"} 정보</span><span>구매일</span><span>판매가</span><span>실구매가</span><span>구매방법</span><span /></div>
                    {(form.purchase_items || []).map((item, index) => (
                      <div className={`savedPurchaseItem ${item.label.trim().length >= 9 ? "longLabel" : ""}`} key={`${item.label}-${index}`}>
                        <b className="savedPurchaseVolume">{item.label}</b>
                        <span className="savedPurchaseDate">{item.purchase_date ? item.purchase_date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_, year, month, day) => `${year}. ${Number(month)}. ${Number(day)}.`) : "–"}</span>
                        <small className="savedPurchaseListPrice">{item.list_price.toLocaleString()}원</small>
                        <strong className="savedPurchasePaidPrice">{item.paid_price.toLocaleString()}원</strong>
                        <span className="savedPurchaseMethods">{item.methods?.length ? item.methods.join(" · ") : "–"}</span>
                        <span className="savedPurchaseActions"><button type="button" aria-label={`${item.label} 수정`} onClick={() => editPurchaseItem(index)}><Pencil size={11} /></button><button type="button" aria-label={`${item.label} 삭제`} onClick={() => { const next = (form.purchase_items || []).filter((_, itemIndex) => itemIndex !== index); setPurchaseItems(next); resetPurchaseDraft(next); }}><X size={12} /></button></span>
                      </div>
                    ))}
                    </div>}
                    <div className="purchaseTotals">
                      <span><small>총 판매가</small><b>{form.list_price.toLocaleString()}원</b></span>
                      <span><small>총 실구매가</small><b>{form.paid_price.toLocaleString()}원</b></span>
                      <span><small>할인율</small><b>{discount}%</b></span>
                    </div>
                  </div>
                </div>}
                {step === "notes" && <div className="fields wizardPage wizardNotesPage">
                  <BookAboutEditor book={form} onChange={patch => setForm(prev => ({ ...prev, ...patch }))} />
                  <h3 className="formSectionTitle notesTitle">{form.status === "책바구니" ? "BASKET NOTES" : "NOTES"}</h3>
                  {form.status === "책바구니" ? (
                    <>
                      <BasketNoteEditor reason={form.basket_reason || ""} images={form.basket_images || []} onReasonChange={(value) => field("basket_reason", value)} onImagesChange={(images) => field("basket_images", images)} />
                    </>
                  ) : (
                    <>
                      <NoteEditor label="좋았던 점" notes={form.liked_notes} kind="liked" onChange={(notes) => field("liked_notes", notes)} />
                      <NoteEditor label="싫었던 점" notes={form.disliked_notes} kind="disliked" onChange={(notes) => field("disliked_notes", notes)} />
                    </>
                  )}
                </div>}
                {message && <p className="formMessage">{message}</p>}
                <div className="wizardActions">
                  <button type="button" className="wizardPrevious" onClick={previousWizardStep}>{step === "book" && !editingId ? "검색으로" : "이전"}</button>
                  {step === "notes" || (step === "purchase" && purchaseOnlyEdit) ? (
                    <button className="save" disabled={saving}>{saving ? "저장 중…" : purchaseOnlyEdit ? "구매 기록 저장" : editingId ? "수정 저장" : "기록 저장"}</button>
                  ) : (
                    <button className="wizardNext">다음</button>
                  )}
                </div>
              </form>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
