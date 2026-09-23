"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import s from "./EdgeScroller.module.css";

// Horizontal scroll row with arrow buttons on its edges (desktop, fine
// pointers only) and edge fades that appear only when there is more to see.
export function EdgeScroller({
  children,
  className = "",
  wrapClassName = "",
  edge = "0px",
  fade = "64px",
  step,
  label,
  revealKey,
  scrollerRef,
}: {
  children: ReactNode;
  className?: string;
  wrapClassName?: string;
  /** Distance from each side of the wrap to the centre of its arrow. */
  edge?: string;
  fade?: string;
  /** Pixels per arrow click; defaults to 80% of the visible width. */
  step?: number;
  label: string;
  /** When this changes, the selected item ([aria-current] / [aria-pressed=true]) is scrolled into view. */
  revealKey?: unknown;
  scrollerRef?: RefObject<HTMLDivElement | null>;
}) {
  const ownRef = useRef<HTMLDivElement>(null);
  const ref = scrollerRef ?? ownRef;
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [ref, update, children]);

  const revealed = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const selected = el.querySelector<HTMLElement>('[aria-current="page"], [aria-pressed="true"]');
    if (!selected) return;
    const box = el.getBoundingClientRect();
    const item = selected.getBoundingClientRect();
    if (item.left < box.left || item.right > box.right) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // Jump on first paint (a slide after load looks like a glitch); glide on user clicks.
      el.scrollTo({
        left: el.scrollLeft + item.left - box.left - (box.width - item.width) / 2,
        behavior: revealed.current && !reduce ? "smooth" : "instant",
      });
    }
    revealed.current = true;
    update();
  }, [ref, revealKey, update]);

  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * (step ?? el.clientWidth * 0.8), behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div className={`${s.wrap} ${wrapClassName}`} style={{ "--edge": edge, "--fade": fade } as CSSProperties}>
      <div ref={ref} className={`${s.scroller} ${className}`} onScroll={update}>
        {children}
      </div>
      <span className={`${s.fade} ${s.fadeLeft}`} data-on={canLeft} aria-hidden="true" />
      <span className={`${s.fade} ${s.fadeRight}`} data-on={canRight} aria-hidden="true" />
      {canLeft && (
        <button type="button" className={`${s.arrow} ${s.left}`} aria-label={`Scroll ${label} left`} onClick={() => scroll(-1)}>
          <svg width="14" height="14" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6.5 1L2.5 5l4 4" />
          </svg>
        </button>
      )}
      {canRight && (
        <button type="button" className={`${s.arrow} ${s.right}`} aria-label={`Scroll ${label} right`} onClick={() => scroll(1)}>
          <svg width="14" height="14" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3.5 1L7.5 5l-4 4" />
          </svg>
        </button>
      )}
    </div>
  );
}
