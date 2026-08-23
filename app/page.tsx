"use client";
import { FormEvent, TouchEvent, useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
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
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { BookRecord, VolumePurchase } from "@/lib/books";

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
type ViewMode = "grid" | "feed" | "calendar" | "records" | "stats";

async function saveElementAsImage(element: HTMLElement, filename: string) {
  await document.fonts.ready;
  element.classList.add("imageExporting");
  const imageRestores: Array<() => void> = [];
  let exportStage: HTMLDivElement | null = null;
  try {
    const images = Array.from(element.querySelectorAll("img"));
    for (const image of images) {
      const original = image.getAttribute("src") || "";
      if (!/^https:\/\//.test(original)) continue;
      imageRestores.push(() => image.setAttribute("src", original));
      image.setAttribute("src", `/api/image?url=${encodeURIComponent(original)}`);
    }
    const backgrounds = Array.from(element.querySelectorAll<HTMLElement>("[style*='background-image']"));
    for (const background of backgrounds) {
      const original = background.style.backgroundImage;
      const match = original.match(/url\(["']?(https:\/\/[^"')]+)["']?\)/);
      if (!match) continue;
      imageRestores.push(() => { background.style.backgroundImage = original; });
      background.style.backgroundImage = `url("/api/image?url=${encodeURIComponent(match[1])}")`;
    }
    const transparentPixel = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
    await Promise.all(images.map((image) => new Promise<void>((resolve) => {
      const finish = () => resolve();
      const fallback = () => { image.onload = finish; image.onerror = finish; image.src = transparentPixel; };
      if (image.complete) {
        if (image.naturalWidth > 0) finish(); else fallback();
      } else {
        image.onload = finish;
        image.onerror = fallback;
      }
    })));
    const exportCard = document.createElement("div");
    const exportContent = element.cloneNode(true) as HTMLElement;
    exportStage = document.createElement("div");
    exportStage.className = "imageExportStage";
    exportCard.className = "imageExportCard";
    exportContent.style.width = `${element.scrollWidth}px`;
    exportContent.style.maxWidth = "none";
    exportContent.style.maxHeight = "none";
    exportContent.style.height = "auto";
    exportContent.style.overflow = "visible";
    exportCard.appendChild(exportContent);
    exportStage.appendChild(exportCard);
    document.body.appendChild(exportStage);
    const clonedImages = Array.from(exportContent.querySelectorAll("img"));
    await Promise.all(clonedImages.map((image) => new Promise<void>((resolve) => {
      if (image.complete) resolve();
      else { image.onload = () => resolve(); image.onerror = () => resolve(); }
    })));
    const width = exportStage.scrollWidth;
    const height = exportStage.scrollHeight;
    const dataUrl = await toPng(exportStage, {
      cacheBust: true,
      backgroundColor: "#f6f4f2",
      pixelRatio: 4,
      width,
      height,
      style: {
        position: "relative",
        zIndex: "0",
        top: "0",
        left: "0",
        maxHeight: "none",
        height: `${height}px`,
        margin: "0",
        overflow: "visible",
      },
      filter: (node) => !(node instanceof HTMLElement && (node.classList.contains("imageShareButton") || node.classList.contains("imageExportExclude"))),
    });
    const link = document.createElement("a");
    link.download = `${filename.replace(/[\\/:*?"<>|]/g, "-")}.png`;
    link.href = dataUrl;
    link.click();
  } finally {
    exportStage?.remove();
    imageRestores.reverse().forEach((restore) => restore());
    element.classList.remove("imageExporting");
  }
}

function ImageShareButton({ getTarget, filename, compact = false }: { getTarget: (button: HTMLButtonElement) => HTMLElement | null; filename: string; compact?: boolean }) {
  const [savingImage, setSavingImage] = useState(false);
  const [failed, setFailed] = useState("");
  return <button type="button" className={`imageShareButton ${compact ? "compact" : ""}`} title={failed || "이미지로 멋지게 공유"} aria-label="이미지로 멋지게 공유" disabled={savingImage} onClick={async (event) => {
    event.stopPropagation();
    const target = getTarget(event.currentTarget);
    if (!target) return;
    setSavingImage(true);
    setFailed("");
    try { await saveElementAsImage(target, filename); }
    catch (error) { setFailed(error instanceof Error ? error.message : String(error || "이미지를 저장하지 못했어요")); }
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
  total_count: 1,
  count_unit: "권",
  category: "문학",
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
  purchase_items: [{ label: "1권", list_price: 0, paid_price: 0, methods: [] }],
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
    <div className="editableSelect">
      <span>{label}</span>
      {creating ? (
        <span className="newOptionField">
          <input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void commit(); } if (event.key === "Escape") setCreating(false); }} placeholder="새 선택지" />
          <button type="button" disabled={savingOption || !draft.trim()} onClick={() => void commit()}>추가</button>
          <button type="button" aria-label="선택지 추가 취소" onClick={() => { setCreating(false); setDraft(""); }}><X size={11} /></button>
        </span>
      ) : (
        <select value={value} onChange={(event) => { if (event.target.value === "__new__") setCreating(true); else onChange(event.target.value); }}>
          <option value="">선택</option>
          {all.map((option) => <option key={option}>{option}</option>)}
          <option value="__new__">＋ 새 선택지 추가</option>
        </select>
      )}
    </div>
  );
}

function MultiEditableSelect({ values, options, onChange, onAdd }: { values: string[]; options: string[]; onChange: (values: string[]) => void; onAdd: (value: string) => Promise<void> }) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [savingOption, setSavingOption] = useState(false);
  const all = [...new Set([...options, ...values])];
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
  return (
    <details className="multiEditableSelect">
      <summary><span>{values.length ? values.join(" + ") : "구매방법 선택"}</span>{values.length > 0 && <small>{values.length}개</small>}</summary>
      <div className="multiOptionMenu">
        {all.map((option) => (
          <label key={option}>
            <input type="checkbox" checked={values.includes(option)} onChange={() => onChange(values.includes(option) ? values.filter((value) => value !== option) : [...values, option])} />
            <span>{option}</span>
          </label>
        ))}
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
            <span className="starEmpty">★</span>
            <span className="starFill" style={{ width: `${fill}%` }}>
              ★
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

function InteractiveRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <span className="ratingControl">
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
  const now = new Date();
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
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
  return (
    <section className="calendarPage" ref={calendarRef}>
      <header className="calendarHeader">
        <button onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="이전 달"><ChevronLeft size={17} /></button>
        <div><b>{year}</b><strong>{String(month + 1).padStart(2, "0")}</strong></div>
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
        {kind === "liked" ? "LOVE NOTES" : "NOPE NOTES"}{" "}
        <small>{String(visibleNotes.length).padStart(2, "0")}</small>
      </span>
      {visibleNotes.map((note, i) => (
        <div className="reviewNote" key={i}>
          <span className="noteHeart"><img src={kind === "liked" ? "/note-heart-pink.gif" : "/note-heart-blue.gif"} alt="" /></span>
          <p>{note}</p>
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
  if (!book.liked_notes.length && !book.disliked_notes.length && showEmpty) return <p className="emptyNotes">기록된 감상이 없습니다.</p>;
  return <><Notes notes={book.liked_notes} kind="liked" /><Notes notes={book.disliked_notes} kind="disliked" /></>;
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

function NoteEditor({ label, notes, kind, onChange }: { label: string; notes: string[]; kind: "liked" | "disliked"; onChange: (notes: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const addNote = () => {
    const clean = draft.trim();
    if (!clean) return;
    onChange([...notes.filter((note) => note.trim()), clean]);
    setDraft("");
  };
  return (
    <section className={`noteEditor full ${kind}`}>
      <label>{label}</label>
      <div className="noteComposer">
        <AutoTextarea value={draft} onChange={setDraft} placeholder="감상을 적어주세요" />
        <button type="button" disabled={!draft.trim()} onClick={addNote}>등록</button>
      </div>
      {!!notes.some((note) => note.trim()) && (
        <div className="savedNoteList">
          {notes.map((note, index) => note.trim() && (
            <div className="savedNote" key={index}>
              <span className="noteHeart"><img src={kind === "liked" ? "/note-heart-pink.gif" : "/note-heart-blue.gif"} alt="" /></span>
              <AutoTextarea ariaLabel={`${label} ${index + 1}`} value={note} onChange={(value) => onChange(notes.map((item, itemIndex) => itemIndex === index ? value : item))} />
              <button type="button" aria-label={`${label} ${index + 1} 삭제`} onClick={() => onChange(notes.filter((_, itemIndex) => itemIndex !== index))}><X size={11} /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
function Cover({ book }: { book: Book }) {
  return book.cover_url ? (
    <img src={book.cover_url} alt={`${book.title} 표지`} />
  ) : (
    <div className="noCover">
      <span>▦</span>
      <b>NO COVER</b>
    </div>
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

function ModalRecordArchive({ books, openBook, onClose, onEdit, onDelete, hideList = false }: { books: Book[]; openBook?: Book | null; onClose?: () => void; onEdit?: (book: Book) => void; onDelete?: (book: Book) => Promise<void>; hideList?: boolean }) {
  const [selected, setSelected] = useState<{
    book: Book;
    index: number;
  } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  useEffect(() => {
    if (openBook) setSelected({ book: openBook, index: Math.max(0, books.findIndex((book) => book.id === openBook.id)) });
  }, [openBook, books]);
  const closeSelected = () => { setSelected(null); setConfirmingDelete(false); setDeleteError(""); onClose?.(); };
  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSelected();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selected]);
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
    <section className="archiveList modalArchive">
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
          return (
            <div
              className="recordModalShade"
              onMouseDown={closeSelected}
            >
              <section
                className="recordModal"
                role="dialog"
                aria-modal="true"
                aria-label={`${book.title} 상세 기록`}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <header className="recordModalHead">
                  <span className="modalBookCover">
                    {book.cover_url ? (
                      <img src={book.cover_url} alt="" />
                    ) : (
                      <span>▦</span>
                    )}
                  </span>
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
                        <ImageShareButton filename={`readiary-${book.title}-detail`} getTarget={(button) => button.closest(".recordModal") as HTMLElement | null} />
                        {onEdit && <button className="editRecordButton" onClick={() => { closeSelected(); onEdit(book); }}><Pencil size={13} /><span>기록 수정</span></button>}
                        {onDelete && <button className="deleteRecordButton" onClick={() => setConfirmingDelete(true)}><Trash2 size={13} /><span>기록 삭제</span></button>}
                      </div>
                    </details>
                    <button onClick={closeSelected} aria-label="상세 기록 닫기">
                      <X size={17} />
                    </button>
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
                    <div className={`statusHighlight ${statusClass(book.status)}`}>
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
                      <Row
                        label="구매방법"
                        value={book.purchase_method || "–"}
                      />
                    </dl>
                  </section>
                  <section className="recordGroup notesGroup">
                    <div className="archiveNotes">
                      <BookNotes book={book} showEmpty />
                    </div>
                  </section>
                </div>
              </section>
            </div>
          );
        })()}
    </section>
  );
}

function StatSection({ title, subtitle, items }: { title: string; subtitle: string; items: { name: string; works: number; volumes: number; paid: number }[] }) {
  return <section className="statsSection"><header><span>{title}</span><small>{subtitle}</small></header><div className="statCards">{items.map((item, index) => <article className="statCard" key={item.name}><span>{String(index + 1).padStart(2, "0")}</span><b>{item.name}</b><strong>{item.paid.toLocaleString()}원</strong><small>{item.volumes}권 · {item.works}작품</small></article>)}</div></section>;
}

function StatsView({ books, profileImage, onProfileImage }: { books: Book[]; profileImage: string; onProfileImage: (file?: File) => void }) {
  const [purchaseYear, setPurchaseYear] = useState("");
  const won = (value: number) => `${value.toLocaleString()}원`;
  const totalVolumes = books.reduce((sum, book) => sum + (book.total_count || 0), 0);
  const readVolumes = books.reduce((sum, book) => sum + (book.read_count || 0), 0);
  const paid = books.reduce((sum, book) => sum + (book.paid_price || 0), 0);
  const list = books.reduce((sum, book) => sum + (book.list_price || 0), 0);
  const rated = books.filter(book => typeof book.rating === "number" && book.rating > 0);
  const averageRating = rated.length ? rated.reduce((sum, book) => sum + (book.rating || 0), 0) / rated.length : 0;
  const group = (key: "category" | "platform" | "status") => Object.values(books.reduce<Record<string, { name: string; works: number; volumes: number; paid: number }>>((all, book) => {
    const name = book[key] || "미분류";
    all[name] ||= { name, works: 0, volumes: 0, paid: 0 };
    all[name].works += 1;
    all[name].volumes += book.total_count || 0;
    all[name].paid += book.paid_price || 0;
    return all;
  }, {})).sort((a, b) => b.paid - a.paid || b.volumes - a.volumes);
  const genres = group("category");
  const platforms = group("platform");
  const recordedStatuses = group("status");
  const statuses = ["책바구니", "읽기 전", "읽는 중", "완독", "하차"].map(name => recordedStatuses.find(item => item.name === name) || { name, works: 0, volumes: 0, paid: 0 });
  const months = Object.values(books.reduce<Record<string, { name: string; works: number; volumes: number; paid: number }>>((all, book) => {
    const name = book.purchase_date?.slice(0, 7);
    if (!name) return all;
    all[name] ||= { name, works: 0, volumes: 0, paid: 0 };
    all[name].works += 1;
    all[name].volumes += book.total_count || 0;
    all[name].paid += book.paid_price || 0;
    return all;
  }, {})).sort((a, b) => b.name.localeCompare(a.name));
  const purchaseYears = [...new Set(months.map(item => item.name.slice(0, 4)))];
  const activePurchaseYear = purchaseYears.includes(purchaseYear) ? purchaseYear : purchaseYears[0];
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
          <div><strong>{readVolumes}</strong><small>읽은 권수</small></div>
          <div><strong>{averageRating ? averageRating.toFixed(1) : "–"}</strong><small>평균 평점</small></div>
        </div>
        <div className="profileReadingBio"><b>나의 독서 통계</b><span>books, notes &amp; little memories</span></div>
      </header>
      <div className="statsSummary">
        <div><small>기록한 작품</small><strong>{books.length}<i>작품</i></strong></div>
        <div><small>소장 권수</small><strong>{totalVolumes}<i>권</i></strong></div>
        <div><small>총 실구매액</small><strong>{won(paid)}</strong></div>
        <div><small>절약한 금액</small><strong>{won(Math.max(0, list - paid))}</strong></div>
      </div>
      <div className="readingSnapshot">
        <div><small>읽은 권수</small><b>{readVolumes} / {totalVolumes}권</b></div>
        <div><small>평균 평점</small><b>★ {averageRating ? averageRating.toFixed(1) : "–"}</b></div>
        <div><small>평균 작품 지출</small><b>{won(books.length ? Math.round(paid / books.length) : 0)}</b></div>
      </div>
      <div className="statsSplit">
        <StatSection title="BY GENRE" subtitle="장르별 권수와 지출" items={genres} />
        <StatSection title="BY PLATFORM" subtitle="플랫폼별 지출" items={platforms} />
      </div>
      <section className="statsSection"><header><span>READING STATUS</span><small>현재 독서 상태</small></header><div className="statusStats">{statuses.map(item => <div key={item.name}><small>{item.name}</small><b>{item.works}</b><i>작품</i></div>)}</div></section>
      {months.length > 0 && <section className="statsSection purchaseLog"><header><span>PURCHASE LOG</span><div className="yearTabs">{purchaseYears.map(year => <button className={activePurchaseYear === year ? "on" : ""} key={year} onClick={() => setPurchaseYear(year)}>{year}</button>)}</div></header><div className="purchaseMonths">{Array.from({ length: 12 }, (_, index) => {
        const month = String(index + 1).padStart(2, "0");
        const item = months.find(value => value.name === `${activePurchaseYear}-${month}`);
        return <div className={item ? "hasPurchase" : ""} key={month}><span>{month}</span><strong>{item ? won(item.paid) : "–"}</strong><small>{item ? `${item.volumes}권 · ${item.works}작품` : "기록 없음"}</small></div>;
      })}</div></section>}
    </section>
  );
}

export default function FeedPage() {
  const [books, setBooks] = useState<Book[]>(demo);
  const [view, setView] = useState<ViewMode>("grid");
  const [recordView, setRecordView] = useState<"calendar" | "records">("calendar");
  const [pending, setPending] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [topMenuOpen, setTopMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [step, setStep] = useState<"search" | "form">("search");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchBook[]>([]);
  const [searching, setSearching] = useState(false);
  const [form, setForm] = useState<BookRecord>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [readingDate, setReadingDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [coverProcessing, setCoverProcessing] = useState(false);
  const [platformOptions, setPlatformOptions] = useState(defaultPlatforms);
  const [purchaseMethodOptions, setPurchaseMethodOptions] = useState(defaultPurchaseMethods);
  const [profileImage, setProfileImage] = useState("");
  const [message, setMessage] = useState("");
  const [detailBook, setDetailBook] = useState<Book | null>(null);
  const scrollRef = useRef(0);
  const drawerRef = useRef<HTMLElement | null>(null);
  const coverScrollRef = useRef(0);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  async function load(show = false) {
    setLoading(true);
    try {
      const r = await fetch("/api/books", { cache: "no-store" });
      const data = await r.json();
      if (data.items?.length) setBooks(data.items);
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
    load();
    fetch("/api/options", { cache: "no-store" }).then((response) => response.json()).then((data) => {
      setPlatformOptions([...new Set([...defaultPlatforms, ...(data.platforms || [])])]);
      setPurchaseMethodOptions([...new Set([...defaultPurchaseMethods, ...(data.purchase_methods || [])])]);
      const localProfile = window.localStorage.getItem("readiary-profile-image") || "";
      setProfileImage(data.profile_image || localProfile);
    }).catch(() => undefined);
  }, []);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return books.filter((book) => {
      const textMatch = !q || `${book.title} ${book.author}`.toLowerCase().includes(q);
      return textMatch && (!statusFilters.length || statusFilters.includes(book.status)) && (!categoryFilters.length || categoryFilters.includes(book.category));
    });
  }, [books, query, statusFilters, categoryFilters]);
  useEffect(() => {
    if (view === "feed" && pending)
      requestAnimationFrame(() =>
        document.getElementById(pending)?.scrollIntoView({ block: "start" }),
      );
  }, [view, pending]);
  function openPost(book: Book, index: number) {
    scrollRef.current = window.scrollY;
    setPending(`post-${book.id || index}`);
    setView("feed");
  }
  function showGrid() {
    setView("grid");
    requestAnimationFrame(() => window.scrollTo(0, scrollRef.current));
  }
  function openAdd() {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    setAdding(true);
    setEditingId(null);
    setStep("search");
    setSearch("");
    setResults([]);
    setMessage("");
    setForm({ ...empty, reading_dates: [todayKey] });
    setReadingDate("");
  }
  function openEdit(book: Book) {
    const { id, ...record } = book;
    const purchaseItems = record.purchase_items?.length
      ? record.purchase_items.map((item) => ({ ...item, methods: item.methods || [] }))
      : [{ label: "기존 합계", list_price: record.list_price || 0, paid_price: record.paid_price || 0, methods: record.purchase_method ? [record.purchase_method] : [] }];
    if (record.purchase_method && !purchaseItems.some((item) => item.methods.length)) purchaseItems[0].methods = [record.purchase_method];
    setEditingId(id);
    setForm({
      ...record,
      purchase_items: purchaseItems,
    });
    setReadingDate("");
    setMessage("");
    setStep("form");
    setDetailBook(null);
    setAdding(true);
  }
  async function deleteBook(book: Book) {
    const r = await fetch("/api/books", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: book.id }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "삭제하지 못했어요.");
    setBooks((prev) => prev.filter((item) => item.id !== book.id));
    setDetailBook(null);
  }
  async function findBooks(e: FormEvent) {
    e.preventDefault();
    if (!search.trim()) return;
    setSearching(true);
    setMessage("");
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(search)}`);
      const data = await r.json();
      setResults(data.books || []);
      if (!data.books?.length)
        setMessage("검색 결과가 없어요. 직접 입력할 수 있어요.");
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
      purchase_items: [{ label: `1${unit}`, list_price: 0, paid_price: 0, methods: [] }],
      category: book.category,
      platform: book.platform,
      cover_url: book.cover,
      source_url: book.url,
      reading_dates: [todayKey],
    });
    setStep("form");
  }
  const field = <K extends keyof BookRecord>(key: K, value: BookRecord[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  function setPurchaseItems(items: VolumePurchase[]) {
    const listPrice = items.reduce((sum, item) => sum + (Number(item.list_price) || 0), 0);
    const paidPrice = items.reduce((sum, item) => sum + (Number(item.paid_price) || 0), 0);
    const methods = [...new Set(items.flatMap((item) => item.methods || []))];
    setForm((prev) => ({ ...prev, purchase_items: items, list_price: listPrice, paid_price: paidPrice, purchase_method: methods.join(" + ") }));
  }
  function updatePurchaseItem<K extends keyof VolumePurchase>(index: number, key: K, value: VolumePurchase[K]) {
    const items = [...(form.purchase_items || [])];
    items[index] = { ...items[index], [key]: value };
    setPurchaseItems(items);
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
    const data = await response.json();
    if (!response.ok) { setMessage(data.error || "선택지를 저장하지 못했어요."); throw new Error(data.error); }
    if (kind === "platforms") setPlatformOptions((prev) => [...new Set([...prev, value])]);
    else setPurchaseMethodOptions((prev) => [...new Set([...prev, value])]);
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
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setBooks((prev) => editingId
        ? prev.map((book) => book.id === editingId ? data.item : book)
        : [data.item, ...prev]);
      setAdding(false);
      setEditingId(null);
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
  function selectRecordView(next: "calendar" | "records") {
    setRecordView(next);
    setView(next);
  }
  function navigateSection(section: "grid" | "feed" | "record" | "stats") {
    if (section === "grid") showGrid();
    else if (section === "record") setView(recordView);
    else {
      if (section === "feed") {
        scrollRef.current = window.scrollY;
        setPending(null);
      }
      setView(section);
    }
    setSearchOpen(false);
    setFilterOpen(false);
    setTopMenuOpen(false);
  }
  function beginSwipe(event: TouchEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (adding || detailBook || target.closest("button, input, textarea, select, a, [role='dialog']")) return;
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
    <main className="feedPage dockLayout" onTouchStart={beginSwipe} onTouchEnd={finishSwipe}>
      <header className="compactTopBar">
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
          className={`topMenuToggle ${topMenuOpen || filterOpen ? "on" : ""}`}
          onClick={() => { setTopMenuOpen((open) => !open); setSearchOpen(false); }}
          aria-label="보기 메뉴"
        >
          <Ellipsis size={18} />
          {(statusFilters.length > 0 || categoryFilters.length > 0) && <i aria-hidden="true" />}
        </button>
      </header>
      {topMenuOpen && (
        <>
          <button className="topMenuBackdrop" aria-label="보기 메뉴 닫기" onClick={() => setTopMenuOpen(false)} />
          <div className="topToolMenu">
            <button onClick={() => { setTopMenuOpen(false); setFilterOpen(true); }}><SlidersHorizontal size={14} /><span>필터</span>{(statusFilters.length + categoryFilters.length) > 0 && <small>{statusFilters.length + categoryFilters.length}</small>}</button>
            <button className={loading ? "loading" : ""} onClick={() => { setTopMenuOpen(false); void load(true); }} disabled={loading}><RefreshCw size={14} /><span>새로고침</span></button>
          </div>
        </>
      )}
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
      {view !== "stats" && (statusFilters.length > 0 || categoryFilters.length > 0) && (
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
      {view === "records" && <ModalRecordArchive books={visible} onEdit={openEdit} onDelete={deleteBook} />}
      {view === "stats" && <StatsView books={books} profileImage={profileImage} onProfileImage={(file) => void changeProfileImage(file)} />}
      {loading && books.length === 0 ? (
        <div className="state">피드를 불러오는 중...</div>
      ) : view === "records" || view === "stats" ? null
      : view === "calendar" ? (
        <CalendarView books={visible} onOpen={(book) => openPost(book, visible.indexOf(book))} />
      ) : view === "grid" ? (
        <section className="bookGrid">
          {visible.map((book, index) => {
            const last = visible.length - 1;
            const start = Math.floor(last / 3) * 3;
            const corners = [
              index === 0 ? "topLeft" : "",
              index === Math.min(2, last) ? "topRight" : "",
              index === start ? "bottomLeft" : "",
              index === last ? "bottomRight" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                className={`gridItem ${corners}`}
                key={book.id}
                onClick={() => openPost(book, index)}
              >
                <span className="gridCover">
                  <Cover book={book} />
                </span>
                <span className="gridRating">
                  <ClassicRating rating={book.rating} />
                </span>
              </button>
            );
          })}
        </section>
      ) : (
        <section className="feedList">
          {visible.map((book, index) => (
            <article
              id={`post-${book.id || index}`}
              className="post"
              key={book.id}
            >
              <header className="postHead">
                <span className="identity">
                  <span className="profileCover">
                    {book.cover_url ? (
                      <img src={book.cover_url} alt="" />
                    ) : (
                      <span>📖</span>
                    )}
                  </span>
                  <b>{book.title}</b>
                  <small>{book.author || "저자 미상"}</small>
                </span>
                <span className="postHeadTools"><ImageShareButton compact filename={`readiary-${book.title}-feed`} getTarget={(button) => button.closest(".post") as HTMLElement | null} /><span className="postNumber">{String(index + 1).padStart(2, "0")}</span></span>
              </header>
              <button className="feedCover" onClick={() => setDetailBook(book)} aria-label={`${book.title} 상세 기록 열기`}>
                {book.cover_url && (
                  <img className="coverBackdrop" src={book.cover_url} alt="" />
                )}
                <span className="coverWash" />
                <div className="coverMain">
                  {book.cover_url ? (
                    <div
                      className="frontCover"
                      style={{
                        backgroundImage: `url("${book.cover_url.replace(/"/g, "%22")}")`,
                      }}
                    />
                  ) : (
                    <Cover book={book} />
                  )}
                </div>
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
                      className={`statusText ${book.status === "완독" ? "done" : book.status === "읽는 중" ? "reading" : book.status === "하차" ? "paused" : "basket"}`}
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
      )}
      {detailBook && <ModalRecordArchive books={visible} openBook={detailBook} onClose={() => setDetailBook(null)} onEdit={openEdit} onDelete={deleteBook} hideList />}
      <nav className="bottomDock" aria-label="주요 화면">
        <button className={currentSection === "grid" ? "active" : ""} onClick={() => navigateSection("grid")} aria-label="모아보기"><LayoutGrid size={18} strokeWidth={1.4} /></button>
        <button className={currentSection === "feed" ? "active" : ""} onClick={() => navigateSection("feed")} aria-label="피드"><Hash size={17} strokeWidth={1.55} /></button>
        <button className="dockAdd" onClick={openAdd} aria-label="책 추가"><Plus size={23} strokeWidth={2.25} /></button>
        <button className={currentSection === "record" ? "active" : ""} onClick={() => navigateSection("record")} aria-label="기록"><span className="curledHeartIcon" aria-hidden="true" /></button>
        <button className={`dockProfile ${currentSection === "stats" ? "active" : ""}`} onClick={() => navigateSection("stats")} aria-label="프로필과 독서 통계"><span className="dockProfileRing">{profileImage ? <img src={profileImage} alt="" /> : <i>R</i>}</span></button>
      </nav>
      {adding && (
        <div className="drawerShade" onMouseDown={() => setAdding(false)}>
          <aside ref={drawerRef} className="addDrawer" onMouseDown={(e) => e.stopPropagation()}>
            <header>
              <button
                onClick={() => editingId ? setAdding(false) : step === "form" ? setStep("search") : setAdding(false)}
              >
                {editingId ? "×" : step === "form" ? "←" : "×"}
              </button>
              <b>{editingId ? "기록 수정" : step === "search" ? "책 추가" : "독서 기록"}</b>
              <span />
            </header>
            {step === "search" ? (
              <div className="drawerBody">
                <form className="addSearch" onSubmit={findBooks}>
                  <Search size={15} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="제목 또는 작가 검색"
                    autoFocus
                  />
                  <button>{searching ? "…" : "검색"}</button>
                </form>
                <button className="manual" onClick={() => setStep("form")}>
                  검색 없이 직접 입력
                </button>
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
              <form className="recordForm" onSubmit={save}>
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
                        value={form.title}
                        onChange={(e) => field("title", e.target.value)}
                      />
                    </label>
                    <label>
                      저자
                      <input
                        value={form.author}
                        onChange={(e) => field("author", e.target.value)}
                      />
                    </label>
                  </div>
                </div>
                <div className="fields">
                  <div className="bookMetaFields full">
                    <label className="countField">
                      {form.count_unit === "화" ? "총 화수" : "총 권수"}
                      <span><input type="number" min="1" value={form.total_count} onChange={(e) => field("total_count", +e.target.value)} /><select aria-label="수량 단위" value={form.count_unit || "권"} onChange={(e) => changeCountUnit(e.target.value as "권" | "화")}><option>권</option><option>화</option></select></span>
                    </label>
                    <label>
                      카테고리
                      <select value={form.category} onChange={(e) => field("category", e.target.value)}>
                        <option>BL</option><option>로맨스</option><option>로맨스판타지</option><option>문학</option><option>기타</option>
                      </select>
                    </label>
                    <EditableSelect label="플랫폼" value={form.platform} options={platformOptions} onChange={(value) => field("platform", value)} onAdd={(value) => addOption("platforms", value)} />
                  </div>
                  <h3 className="formSectionTitle readingTitle">READING</h3>
                  <label>
                    상태
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
                  <label>
                    완독 / 하차일
                    <input
                      type="date"
                      value={form.finished_date || ""}
                      onChange={(e) =>
                        field("finished_date", e.target.value || null)
                      }
                    />
                  </label>
                  <label className="full readingDatesField">
                    읽은 날
                    <span className="dateAdder">
                      <input type="date" value={readingDate} onChange={(e) => setReadingDate(e.target.value)} />
                      <button type="button" onClick={() => {
                        if (!readingDate || form.reading_dates?.includes(readingDate)) return;
                        field("reading_dates", [...(form.reading_dates || []), readingDate].sort());
                        setReadingDate("");
                      }}>추가</button>
                    </span>
                    <span className="dateChips">
                      {(form.reading_dates || []).map(date => (
                        <button type="button" key={date} onClick={() => field("reading_dates", (form.reading_dates || []).filter(item => item !== date))}>
                          {date.replaceAll("-", ".")} <X size={10} />
                        </button>
                      ))}
                    </span>
                  </label>
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
                      type="number"
                      min="0"
                      value={form.read_count}
                      onChange={(e) => field("read_count", +e.target.value)}
                    />
                  </label>
                  <h3 className="formSectionTitle purchaseTitle">PURCHASE</h3>
                  <label>
                    구매일
                    <input
                      type="date"
                      value={form.purchase_date || ""}
                      onChange={(e) =>
                        field("purchase_date", e.target.value || null)
                      }
                    />
                  </label>
                  <div className="volumePurchases full">
                    <div className="volumePurchaseHead"><span>{form.count_unit || "권"}별 가격</span><span>판매가</span><span>실구매가</span><span /></div>
                    {(form.purchase_items || []).map((item, index) => (
                      <div className="volumePurchaseRow" key={index}>
                        <input aria-label={`${index + 1}번째 ${form.count_unit || "권"} 이름`} value={item.label} onChange={(e) => updatePurchaseItem(index, "label", e.target.value)} />
                        <input aria-label={`${item.label} 판매가`} type="number" min="0" inputMode="numeric" value={item.list_price} onChange={(e) => updatePurchaseItem(index, "list_price", +e.target.value)} />
                        <input aria-label={`${item.label} 실구매가`} type="number" min="0" inputMode="numeric" value={item.paid_price} onChange={(e) => updatePurchaseItem(index, "paid_price", +e.target.value)} />
                        <button type="button" aria-label={`${item.label} 가격 행 삭제`} onClick={() => setPurchaseItems((form.purchase_items || []).filter((_, itemIndex) => itemIndex !== index))}><X size={12} /></button>
                        <MultiEditableSelect values={item.methods || []} options={purchaseMethodOptions} onChange={(values) => updatePurchaseItem(index, "methods", values)} onAdd={(value) => addOption("purchase_methods", value)} />
                      </div>
                    ))}
                    <button className="addVolumePrice" type="button" onClick={() => setPurchaseItems([...(form.purchase_items || []), { label: `${(form.purchase_items?.length || 0) + 1}${form.count_unit || "권"}`, list_price: 0, paid_price: 0, methods: [] }])}><Plus size={12} /> {form.count_unit || "권"} 추가</button>
                    <div className="purchaseTotals">
                      <span><small>총 판매가</small><b>{form.list_price.toLocaleString()}원</b></span>
                      <span><small>총 실구매가</small><b>{form.paid_price.toLocaleString()}원</b></span>
                      <span><small>할인율</small><b>{discount}%</b></span>
                    </div>
                  </div>
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
                </div>
                {message && <p className="formMessage">{message}</p>}
                <button className="save" disabled={saving}>
                  {saving ? "저장 중…" : editingId ? "수정 저장" : "기록 저장"}
                </button>
              </form>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
