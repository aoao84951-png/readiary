"use client";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Grid3X3,
  List,
  NotebookTabs,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import type { BookRecord } from "@/lib/books";

type Book = BookRecord & { id: string };
type SearchBook = {
  title: string;
  author: string;
  cover: string;
  url: string;
  totalCount: number;
  category: string;
  platform: string;
};
type ViewMode = "grid" | "feed" | "calendar" | "records" | "stats";
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
  liked_notes: [],
  disliked_notes: [],
  reading_dates: [],
  source_url: "",
};

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
    <section className="calendarPage">
      <header className="calendarHeader">
        <button onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="이전 달"><ChevronLeft size={17} /></button>
        <div><b>{year}</b><strong>{String(month + 1).padStart(2, "0")}</strong></div>
        <button onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="다음 달"><ChevronRight size={17} /></button>
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
  if (!notes.length) return null;
  return (
    <section className={`reviewNotes ${kind}`}>
      <span className="reviewLabel">
        {kind === "liked" ? "LOVE NOTES" : "NOPE NOTES"}{" "}
        <small>{String(notes.length).padStart(2, "0")}</small>
      </span>
      {notes.map((note, i) => (
        <div className="reviewNote" key={i}>
          <span className="noteHeart">{kind === "liked" ? "♥" : "♡"}</span>
          <p>{note}</p>
        </div>
      ))}
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
                  <dt>총 권수</dt>
                  <dd>{book.total_count}권</dd>
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
                    {book.read_count} / {book.total_count}권
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
                <Notes notes={book.liked_notes} kind="liked" />
                <Notes notes={book.disliked_notes} kind="disliked" />
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
                    {book.read_count} / {book.total_count}권
                  </b>
                  <small>독서량</small>
                </div>
                <div>
                  <b>{progress}%</b>
                  <small>진행률</small>
                </div>
              </div>
              <section className="recordGroup">
                <h3>BOOK</h3>
                <dl>
                  <Row label="저자" value={book.author || "–"} />
                  <Row label="총 권수" value={`${book.total_count}권`} />
                  <Row label="카테고리" value={book.category} />
                  <Row
                    label="커버 이미지"
                    value={book.cover_url ? "등록됨" : "–"}
                  />
                </dl>
              </section>
              <section className="recordGroup readingGroup">
                <h3>READING</h3>
                <div
                  className={`groupProgress ${book.status === "완독" ? "done" : book.status === "하차" ? "paused" : book.status === "읽는 중" ? "reading" : book.status === "읽기 전" ? "before" : "basket"}`}
                >
                  <span>
                    <b>{book.status}</b>
                    <small>{progress}%</small>
                  </span>
                  <i>
                    <b style={{ width: `${progress}%` }} />
                  </i>
                  <p>
                    <span>완독 / 하차일</span>
                    <b>{book.finished_date || "–"}</b>
                  </p>
                </div>
                <dl>
                  <Row label="평점" value={<Rating rating={book.rating} />} />
                  <Row
                    label="독서량"
                    value={`${book.read_count} / ${book.total_count}권`}
                  />
                </dl>
              </section>
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
                <h3>NOTES</h3>
                <div className="archiveNotes">
                  <Notes notes={book.liked_notes} kind="liked" />
                  <Notes notes={book.disliked_notes} kind="disliked" />
                  {!book.liked_notes.length && !book.disliked_notes.length && (
                    <p className="emptyNotes">기록된 감상이 없습니다.</p>
                  )}
                </div>
              </section>
            </div>
          </details>
        );
      })}
    </section>
  );
}

function ModalRecordArchive({ books, openBook, onClose, hideList = false }: { books: Book[]; openBook?: Book | null; onClose?: () => void; hideList?: boolean }) {
  const [selected, setSelected] = useState<{
    book: Book;
    index: number;
  } | null>(null);
  useEffect(() => {
    if (openBook) setSelected({ book: openBook, index: Math.max(0, books.findIndex((book) => book.id === openBook.id)) });
  }, [openBook, books]);
  const closeSelected = () => { setSelected(null); onClose?.(); };
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
                  <button
                    onClick={closeSelected}
                    aria-label="상세 기록 닫기"
                  >
                    <X size={17} />
                  </button>
                </header>
                <div className="recordModalBody">
                  <div className="recordHighlights">
                    <div>
                      <Rating rating={book.rating} />
                      <small>평점</small>
                    </div>
                    <div>
                      <b>
                        {book.read_count} / {book.total_count}권
                      </b>
                      <small>독서량</small>
                    </div>
                    <div>
                      <b>{progress}%</b>
                      <small>진행률</small>
                    </div>
                  </div>
                  <section className="recordGroup">
                    <h3>BOOK</h3>
                    <dl>
                      <Row label="저자" value={book.author || "–"} />
                      <Row label="총 권수" value={`${book.total_count}권`} />
                      <Row label="카테고리" value={book.category} />
                      <Row
                        label="커버 이미지"
                        value={book.cover_url ? "등록됨" : "–"}
                      />
                    </dl>
                  </section>
                  <section className="recordGroup readingGroup">
                    <h3>READING</h3>
                    <div
                      className={`groupProgress ${statusClass(book.status)}`}
                    >
                      <span>
                        <b>{book.status}</b>
                        <small>{progress}%</small>
                      </span>
                      <i>
                        <b style={{ width: `${progress}%` }} />
                      </i>
                      <p>
                        <span>완독 / 하차일</span>
                        <b>{book.finished_date || "–"}</b>
                      </p>
                    </div>
                    <dl>
                      <Row
                        label="평점"
                        value={<Rating rating={book.rating} />}
                      />
                      <Row
                        label="독서량"
                        value={`${book.read_count} / ${book.total_count}권`}
                      />
                    </dl>
                  </section>
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
                    <h3>NOTES</h3>
                    <div className="archiveNotes">
                      <Notes notes={book.liked_notes} kind="liked" />
                      <Notes notes={book.disliked_notes} kind="disliked" />
                      {!book.liked_notes.length &&
                        !book.disliked_notes.length && (
                          <p className="emptyNotes">기록된 감상이 없습니다.</p>
                        )}
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

function StatsView({ books }: { books: Book[] }) {
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
  const statuses = group("status");
  const months = Object.values(books.reduce<Record<string, { name: string; works: number; volumes: number; paid: number }>>((all, book) => {
    const name = book.purchase_date?.slice(0, 7);
    if (!name) return all;
    all[name] ||= { name, works: 0, volumes: 0, paid: 0 };
    all[name].works += 1;
    all[name].volumes += book.total_count || 0;
    all[name].paid += book.paid_price || 0;
    return all;
  }, {})).sort((a, b) => b.name.localeCompare(a.name));
  if (!books.length) return <div className="state">통계를 만들 기록이 아직 없어요.</div>;
  return (
    <section className="statsPage">
      <header className="statsIntro">
        <div className="statsCopy"><span>READING REPORT</span><h1>나의 독서 통계</h1><p>지금까지 기록한 모든 책을 바탕으로 정리했어요.</p><i>♡ &nbsp; books, notes &amp; little memories</i></div>
        <div className="statsCovers" aria-hidden="true">
          {books.filter(book => book.cover_url).slice(0, 4).map((book, index) => <img key={book.id} src={book.cover_url} alt="" style={{ right: 18 + index * 34, transform: `rotate(${(index - 1.5) * 5}deg)` }} />)}
          <b>MY<br />SHELF</b>
        </div>
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
      <StatSection title="BY GENRE" subtitle="장르별 권수와 지출" items={genres} />
      <StatSection title="BY PLATFORM" subtitle="플랫폼별 지출" items={platforms} />
      <section className="statsSection"><header><span>READING STATUS</span><small>현재 독서 상태</small></header><div className="statusStats">{statuses.map(item => <div key={item.name}><small>{item.name}</small><b>{item.works}</b><i>작품</i></div>)}</div></section>
      {months.length > 0 && <StatSection title="PURCHASE LOG" subtitle="월별 구매 지출" items={months} />}
    </section>
  );
}

export default function FeedPage() {
  const [books, setBooks] = useState<Book[]>(demo);
  const [view, setView] = useState<ViewMode>("grid");
  const [pending, setPending] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
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
  const [readingDate, setReadingDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [detailBook, setDetailBook] = useState<Book | null>(null);
  const scrollRef = useRef(0);
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
    setStep("search");
    setSearch("");
    setResults([]);
    setMessage("");
    setForm({ ...empty, reading_dates: [todayKey] });
    setReadingDate("");
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
    setForm({
      ...empty,
      title: book.title,
      author: book.author,
      total_count: book.totalCount || 1,
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
  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const r = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setBooks((prev) => [data.item, ...prev]);
      setAdding(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }
  const discount = form.list_price
    ? Math.max(0, Math.round((1 - form.paid_price / form.list_price) * 100))
    : 0;
  return (
    <main className="feedPage">
      <nav className="viewTabs" aria-label="독서 기록 보기 방식">
        <button
          className={`searchToggle ${searchOpen ? "on" : ""}`}
          onClick={() => {
            setSearchOpen((v) => !v);
            setFilterOpen(false);
          }}
          aria-label="내 기록 검색"
        >
          <Search size={15} />
        </button>
        <button
          className={`addToggle ${adding ? "on" : ""}`}
          onClick={openAdd}
          aria-label="책 추가"
        >
          <Plus size={16} />
        </button>
        <button className={view === "grid" ? "active" : ""} onClick={showGrid}>
          <Grid3X3 size={18} />
          <span>모아보기</span>
        </button>
        <button
          className={view === "feed" ? "active" : ""}
          onClick={() => {
            scrollRef.current = window.scrollY;
            setPending(null);
            setView("feed");
          }}
        >
          <List size={19} />
          <span>피드</span>
        </button>
        <button
          className={view === "calendar" ? "active" : ""}
          onClick={() => setView("calendar")}
        >
          <CalendarDays size={18} />
          <span>달력</span>
        </button>
        <button
          className={view === "records" ? "active" : ""}
          onClick={() => setView("records")}
        >
          <NotebookTabs size={18} />
          <span>기록</span>
        </button>
        <button
          className={view === "stats" ? "active" : ""}
          onClick={() => setView("stats")}
        >
          <BarChart3 size={18} />
          <span>통계</span>
        </button>
        <button
          className={`filterToggle ${filterOpen || statusFilters.length || categoryFilters.length ? "on" : ""}`}
          onClick={() => {
            setFilterOpen((v) => !v);
            setSearchOpen(false);
          }}
          aria-label="상태 및 장르 필터"
        >
          <SlidersHorizontal size={14} />
          {(statusFilters.length > 0 || categoryFilters.length > 0) && <i aria-hidden="true" />}
        </button>
        <button
          className={`refresh ${loading ? "loading" : ""}`}
          onClick={() => load(true)}
          disabled={loading}
        >
          <RefreshCw size={14} />
        </button>
      </nav>
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
      {view === "records" && <ModalRecordArchive books={visible} />}
      {view === "stats" && <StatsView books={books} />}
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
                <span className="postNumber">
                  {String(index + 1).padStart(2, "0")}
                </span>
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
                  <Notes notes={book.liked_notes} kind="liked" />
                  <Notes notes={book.disliked_notes} kind="disliked" />
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
      {detailBook && <ModalRecordArchive books={visible} openBook={detailBook} onClose={() => setDetailBook(null)} hideList />}
      {adding && (
        <div className="drawerShade" onMouseDown={() => setAdding(false)}>
          <aside className="addDrawer" onMouseDown={(e) => e.stopPropagation()}>
            <header>
              <button
                onClick={() =>
                  step === "form" ? setStep("search") : setAdding(false)
                }
              >
                {step === "form" ? "←" : "×"}
              </button>
              <b>{step === "search" ? "책 추가" : "독서 기록"}</b>
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
                        <span className="miniNoCover">▦</span>
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
                <div className="selectedBook">
                  {form.cover_url ? (
                    <img src={form.cover_url} alt="" />
                  ) : (
                    <span className="miniNoCover">▦</span>
                  )}
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
                  <label>
                    총 권수
                    <input
                      type="number"
                      min="1"
                      value={form.total_count}
                      onChange={(e) => field("total_count", +e.target.value)}
                    />
                  </label>
                  <label>
                    카테고리
                    <select
                      value={form.category}
                      onChange={(e) => field("category", e.target.value)}
                    >
                      <option>BL</option>
                      <option>로맨스</option>
                      <option>로맨스판타지</option>
                      <option>문학</option>
                      <option>기타</option>
                    </select>
                  </label>
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
                    플랫폼
                    <input
                      value={form.platform}
                      onChange={(e) => field("platform", e.target.value)}
                    />
                  </label>
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
                  <label>
                    총 판매가
                    <input
                      type="number"
                      min="0"
                      value={form.list_price}
                      onChange={(e) => field("list_price", +e.target.value)}
                    />
                  </label>
                  <label>
                    실구매가
                    <input
                      type="number"
                      min="0"
                      value={form.paid_price}
                      onChange={(e) => field("paid_price", +e.target.value)}
                    />
                  </label>
                  <label>
                    할인율<span className="calculated">{discount}%</span>
                  </label>
                  <label className="full">
                    구매방법
                    <input
                      value={form.purchase_method}
                      onChange={(e) => field("purchase_method", e.target.value)}
                    />
                  </label>
                  <label className="full">
                    커버 이미지 URL
                    <input
                      value={form.cover_url}
                      onChange={(e) => field("cover_url", e.target.value)}
                      placeholder="네이버 공식 표지 주소를 넣으면 다음 검색부터 자동 적용돼요"
                    />
                  </label>
                  <label className="full">
                    좋았던 점
                    <textarea
                      value={form.liked_notes.join("\n")}
                      onChange={(e) =>
                        field(
                          "liked_notes",
                          e.target.value.split("\n").filter(Boolean),
                        )
                      }
                      placeholder="한 줄에 하나씩"
                    />
                  </label>
                  <label className="full">
                    싫었던 점
                    <textarea
                      value={form.disliked_notes.join("\n")}
                      onChange={(e) =>
                        field(
                          "disliked_notes",
                          e.target.value.split("\n").filter(Boolean),
                        )
                      }
                      placeholder="한 줄에 하나씩"
                    />
                  </label>
                </div>
                {message && <p className="formMessage">{message}</p>}
                <button className="save" disabled={saving}>
                  {saving ? "저장 중…" : "기록 저장"}
                </button>
              </form>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
