"use client";

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ImagePlus, Trash2, X } from 'lucide-react';
import './excerpts.css';

type Excerpt = { id: string; image: string; created_at: string };

async function prepareImage(file: File) {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name}: 이미지 파일을 선택해주세요.`);
  if (file.size > 15 * 1024 * 1024) throw new Error(`${file.name}: 장당 15MB까지 추가할 수 있어요.`);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1800 / image.width, 2600 / image.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('이미지를 처리하지 못했어요.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [.92, .84, .76, .68]) {
      const result = canvas.toDataURL('image/jpeg', quality);
      if (result.length <= 700_000) return result;
    }
    throw new Error(`${file.name}: 이미지를 조금 작게 잘라 다시 추가해주세요.`);
  } finally { URL.revokeObjectURL(url); }
}

export default function BookExcerpts({ bookId, title }: { bookId: string; title: string }) {
  const [items, setItems] = useState<Excerpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reload, setReload] = useState(0);
  const busy = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  function slide(direction: number) {
    const element = strip.current;
    if (!element) return;
    const start = element.getBoundingClientRect().left;
    const positions = Array.from(element.children).map(child => child.getBoundingClientRect().left - start + element.scrollLeft);
    const target = direction > 0
      ? positions.find(position => position > element.scrollLeft + 2) ?? element.scrollWidth
      : positions.findLast(position => position < element.scrollLeft - 2) ?? 0;
    element.scrollTo({ left: target, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  const touchStart = useRef<number | null>(null);
  const index = items.findIndex(item => item.id === active);
  const current = items[index];
  const close = () => { setActive(null); setConfirmDelete(false); };
  const move = (offset: number) => {
    setActive(items[(index + offset + items.length) % items.length]?.id || null);
    setConfirmDelete(false);
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(`/api/books/excerpts?bookId=${encodeURIComponent(bookId)}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json() as { items: Excerpt[]; item: Excerpt; error?: string };
        if (!response.ok) throw new Error(data.error);
        setItems(data.items);
      }).catch(error => { if (!controller.signal.aborted) setError(error.message || '발췌를 불러오지 못했어요.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [bookId, reload]);

  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (['Escape', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.key)) event.stopImmediatePropagation();
      if (event.key === 'Escape') { event.preventDefault(); setActive(null); setConfirmDelete(false); }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        setActive(id => {
          const position = items.findIndex(item => item.id === id);
          return items[(position + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length]?.id || null;
        });
        setConfirmDelete(false);
      }
      if (event.key === 'Tab') {
        const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
        if (!buttons.length) return;
        const position = buttons.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault();
        buttons[(position + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => { window.removeEventListener('keydown', handleKey, true); previous?.focus(); };
  }, [active, items]);

  async function add(files: FileList | null) {
    if (!files?.length || busy.current) return;
    busy.current = true;
    setError('');
    const failures: string[] = [];
    try {
      for (const [position, file] of Array.from(files).entries()) {
        setProgress(`${position + 1}/${files.length} 저장 중`);
        try {
          const image = await prepareImage(file);
          const response = await fetch('/api/books/excerpts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookId, id: crypto.randomUUID(), image }) });
          const data = await response.json() as { items: Excerpt[]; item: Excerpt; error?: string };
          if (!response.ok) throw new Error(data.error);
          setItems(previous => [...previous, data.item]);
        } catch (error) { failures.push(error instanceof Error ? error.message : `${file.name}: 저장하지 못했어요.`); }
      }
      setError(failures.join(' '));
    } finally { busy.current = false; setProgress(''); }
  }

  async function remove() {
    if (!current || busy.current) return;
    busy.current = true;
    setProgress('삭제 중');
    setError('');
    try {
      const response = await fetch('/api/books/excerpts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookId, id: current.id }) });
      const data = await response.json() as { items: Excerpt[]; item: Excerpt; error?: string };
      if (!response.ok) throw new Error(data.error);
      const remaining = items.filter(item => item.id !== current.id);
      setItems(remaining);
      setActive(remaining[Math.min(index, remaining.length - 1)]?.id || null);
      setConfirmDelete(false);
    } catch (error) { setError(error instanceof Error ? error.message : '삭제하지 못했어요.'); }
    finally { busy.current = false; setProgress(''); }
  }

  return <section className="bookExcerpts imageExportExclude" aria-label="발췌 이미지">
    <header><h3>발췌 <span>{items.length || ''}</span></h3><label className="excerptAdd"><ImagePlus size={15} />{progress || '이미지 추가'}<input type="file" accept="image/*" multiple disabled={loading || !!progress} onChange={event => { void add(event.target.files); event.target.value = ''; }} /></label></header>
    {loading ? <p role="status">발췌를 불러오는 중…</p> : items.length ? <div className="excerptCarousel"><div className="excerptGrid" ref={strip} role="region" aria-label="발췌 이미지 슬라이드" tabIndex={0} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); slide(event.key === 'ArrowRight' ? 1 : -1); } }}>{items.map((item, position) => <button type="button" key={item.id} onClick={() => { setActive(item.id); setConfirmDelete(false); }} aria-label={`발췌 ${position + 1} 크게 보기`}><img src={item.image} alt={`${title} 발췌 ${position + 1}`} loading="lazy" /></button>)}</div>{items.length > 1 && <div className="excerptNavigation"><button type="button" onClick={() => slide(-1)} aria-label="발췌 왼쪽으로 넘기기"><ChevronLeft size={15} /></button><button type="button" onClick={() => slide(1)} aria-label="발췌 오른쪽으로 넘기기"><ChevronRight size={15} /></button></div>}</div> : !error && <p>간직하고 싶은 문장을 이미지로 모아두세요.</p>}
    {!!progress && <p role="status">{progress}</p>}
    {error && <p role="alert" className="excerptError">{error} <button type="button" disabled={!!progress} onClick={() => setReload(value => value + 1)}>다시 불러오기</button></p>}
    {current && createPortal(<div className="excerptLightbox" ref={dialog} role="dialog" aria-modal="true" aria-label={`${title} 발췌 크게 보기`} tabIndex={-1} onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <header><span>{index + 1} / {items.length}</span><button type="button" onClick={close} aria-label="발췌 닫기"><X /></button></header>
      <div className="excerptFullImage" onTouchStart={event => { touchStart.current = event.touches.length === 1 ? event.touches[0].clientX : null; }} onTouchEnd={event => { if (touchStart.current !== null) { const distance = event.changedTouches[0].clientX - touchStart.current; if (Math.abs(distance) > 70) move(distance > 0 ? -1 : 1); } touchStart.current = null; }}><img src={current.image} alt={`${title} 발췌 ${index + 1}`} /></div>
      <footer><button type="button" disabled={items.length < 2} onClick={() => move(-1)} aria-label="이전 발췌"><ChevronLeft /></button><button type="button" disabled={!!progress} onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> 삭제</button><button type="button" disabled={items.length < 2} onClick={() => move(1)} aria-label="다음 발췌"><ChevronRight /></button></footer>
      {confirmDelete && <div className="excerptDelete" role="alert"><span>이 발췌를 삭제할까요?</span><button type="button" disabled={!!progress} onClick={() => setConfirmDelete(false)}>취소</button><button type="button" disabled={!!progress} onClick={() => void remove()}>{progress || '삭제'}</button></div>}
      {error && <p role="alert" className="excerptError">{error}</p>}
    </div>, document.body)}
  </section>;
}
