'use client';
import { ChevronRight, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { BookRecord } from '@/lib/books';
import { characterRoles, introductionLink, keywordList, type BookCharacter } from '@/lib/book-about';
import './book-about.css';

function Keywords({ value }: { value?: string }) {
  return <div className="aboutKeywords">{keywordList(value).map(word => <span key={word}>#{word}</span>)}</div>;
}
export function BookAbout({ book, onEdit }: { book: BookRecord; onEdit?: () => void }) {
  const roles = characterRoles(book.category);
  const characters = (book.about_characters || []).filter(person => roles.includes(person.role) && (person.name.trim() || person.keywords.trim() || person.description.trim()));
  const link = introductionLink(book.about_url);
  const hasContent = Boolean(keywordList(book.about_keywords).length || book.about_summary?.trim() || characters.length);
  const hasDetails = Boolean(characters.length || book.about_summary?.trim());
  const hasAbout = hasContent || link;
  if (!hasAbout) return null;
  return <section className="recordGroup bookAbout">
    {!!hasAbout && <><div className="aboutSectionHeading"><div className="aboutHeadingLinks">{hasContent && <h3>ABOUT</h3>}{link && !hasContent && <a href={link} target="_blank" rel="noopener noreferrer">작품 소개 원문 ↗</a>}</div>{onEdit && <div className="notesEmptyHead imageExportExclude"><button type="button" aria-label="작품 소개 수정" title="작품 소개 수정" onClick={onEdit}><Plus size={9} /></button></div>}</div><Keywords value={book.about_keywords} />
      {book.about_summary?.trim() && <p className="aboutPreview">{book.about_summary}</p>}
      {hasDetails && <details><summary className="aboutDisclosureRow"><span className="aboutDisclosureLabel">인물·소개 펼치기</span>{link && <a href={link} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()}>작품 소개 원문 ↗</a>}</summary>
        {book.about_summary?.trim() && <p>{book.about_summary}</p>}
        {characters.map((person, index) => <div className="aboutPerson" key={index}><b><span className={`aboutRolePill ${person.role === '공' || person.role === '남주' ? 'blue' : 'pink'}`}>{person.role}</span>{person.name.trim() && <span>{person.name}</span>}</b><Keywords value={person.keywords} />{person.description.trim() && <p>{person.description}</p>}</div>)}
      </details>}
      {hasContent && !hasDetails && link && <div className="aboutSourceRow"><a href={link} target="_blank" rel="noopener noreferrer">작품 소개 원문 ↗</a></div>}
    </>}
  </section>;
}
export function BookAboutEditor({ book, onChange }: { book: BookRecord; onChange: (patch: Partial<BookRecord>) => void }) {
  const roles = characterRoles(book.category);
  const characters = book.about_characters || [];
  const updatePerson = (index: number, patch: Partial<BookCharacter>) => onChange({ about_characters: characters.map((person, i) => i === index ? { ...person, ...patch } : person) });
  return <section className="aboutEditor full">
    <div className="aboutEditorFields">
    <label>작품 키워드<input value={book.about_keywords || ''} placeholder="#현대물 #재회물 또는 쉼표로 구분" onChange={event => onChange({ about_keywords: event.target.value })} /></label>
    <label>짧은 작품 소개<textarea rows={3} value={book.about_summary || ''} placeholder="어떤 이야기인지 두세 줄로 남겨주세요." onChange={event => onChange({ about_summary: event.target.value })} /></label>
    {roles.length > 0 && <div className="aboutPeopleEditor">{characters.map((person, index) => roles.includes(person.role) && <fieldset key={index}><legend>인물 {characters.slice(0, index + 1).filter(item => roles.includes(item.role)).length}</legend>
      <div className="aboutPersonHead"><label>역할<select value={person.role} onChange={event => updatePerson(index, { role: event.target.value as BookCharacter['role'] })}>{roles.map(role => <option key={role}>{role}</option>)}</select></label><label>이름<input value={person.name} placeholder="이름 (선택)" onChange={event => updatePerson(index, { name: event.target.value })} /></label><button type="button" aria-label={`${person.role} ${person.name || '인물'} 삭제`} onClick={() => onChange({ about_characters: characters.filter((_, i) => i !== index) })}>삭제</button></div>
      <label>{person.role} 키워드<input value={person.keywords} placeholder={person.role === '공' ? '#미남공 #다정공' : person.role === '수' ? '#미인수 #강수' : '인물의 특징을 입력해주세요'} onChange={event => updatePerson(index, { keywords: event.target.value })} /></label>
      <label>인물 소개<textarea rows={2} value={person.description} placeholder="기억할 만한 특징 한두 줄 (선택)" onChange={event => updatePerson(index, { description: event.target.value })} /></label>
    </fieldset>)}<div className="aboutAddButtons">{roles.map(role => <button type="button" key={role} onClick={() => onChange({ about_characters: [...characters, { role, name: '', keywords: '', description: '' }] })}>+ {role} 추가</button>)}</div></div>}
    <label>작품 소개 링크<input type="url" value={book.about_url || ''} placeholder="https://… (선택)" onChange={event => onChange({ about_url: event.target.value })} /></label>
      </div>
  </section>;
}

export function BookAboutField({ book, onChange, autoOpen = false, onOpened, onSave, onClose }: { book: BookRecord; onChange: (patch: Partial<BookRecord>) => void; autoOpen?: boolean; onOpened?: () => void; onSave?: () => Promise<void>; onClose?: () => void }) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const finish = async () => {
    if (!onSave) { dialog.current?.close(); return; }
    if (saving) return;
    if (!dialog.current?.querySelector<HTMLInputElement>('input[type="url"]')?.checkValidity()) {
      (dialog.current?.querySelector('input[type="url"]') as HTMLInputElement)?.reportValidity();
      return;
    }
    setSaving(true);
    setSaveError('');
    try { await onSave(); dialog.current?.close(); }
    catch (error) { setSaveError(error instanceof Error ? error.message : '저장하지 못했습니다.'); }
    finally { setSaving(false); }
  };
  const heading = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const openDialog = () => {
    dialog.current?.showModal();
    // Start on static content without highlighting Close or opening the keyboard.
    heading.current?.focus({ preventScroll: true });
    if (body.current) body.current.scrollTop = 0;
  };
  useEffect(() => {
    if (autoOpen) {
      openDialog();
      onOpened?.();
    }
  }, [autoOpen, onOpened]);
  const backdropPress = useRef(false);
  const isOutside = (event: { target: EventTarget; clientX: number; clientY: number }) => {
    const element = dialog.current;
    if (!element || event.target !== element) return false;
    const rect = element.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };
  const roles = characterRoles(book.category);
  const filled = Boolean(book.about_summary?.trim() || keywordList(book.about_keywords).length || book.about_url?.trim() || book.about_characters?.some(person => roles.includes(person.role) && (person.name.trim() || person.keywords.trim() || person.description.trim())));
  return <div className="bookAboutProperty">
    <span className="propertyLabel">작품소개</span>
    <button type="button" className={`aboutPropertyButton${filled ? ' isFilled' : ''}`} aria-label={`작품소개 ${filled ? '작성됨' : '비어 있음'}`} aria-haspopup="dialog" onClick={openDialog}>{filled ? '작성됨' : '비어 있음'}<ChevronRight size={12} aria-hidden="true" /></button>
    <dialog onClose={onClose} className="aboutEntryDialog" ref={dialog} aria-label="작품 소개" onInvalid={() => { if (!dialog.current?.open) dialog.current?.showModal(); }} onPointerDown={event => { event.stopPropagation(); backdropPress.current = isOutside(event); }} onPointerUp={event => { event.stopPropagation(); if (backdropPress.current && isOutside(event)) dialog.current?.close(); backdropPress.current = false; }} onPointerCancel={() => { backdropPress.current = false; }} onClick={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); dialog.current?.close(); } if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault(); }} onCancel={event => event.stopPropagation()}>
      <header><h2 ref={heading} tabIndex={-1}>작품 소개</h2><button type="button" aria-label="작품 소개 닫기" onClick={() => dialog.current?.close()}><X size={18} /></button></header>
      <div className="aboutEntryBody" ref={body}><BookAboutEditor book={book} onChange={onChange} /></div>
      <footer><span role={saveError ? "alert" : undefined}>{saveError || (onSave ? "작품소개만 저장됩니다." : "기록 저장 시 함께 저장됩니다.")}</span><button type="button" disabled={saving} onClick={() => void finish()}>{saving ? "저장 중…" : onSave ? "저장" : "완료"}</button></footer>
    </dialog>
  </div>;
}
