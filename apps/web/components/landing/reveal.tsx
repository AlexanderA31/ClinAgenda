'use client';

import { useEffect } from 'react';
import s from './landing.module.css';

/**
 * Para los navegadores que todavía no animan con el scroll (CSS `animation-timeline: view()`):
 * hace aparecer cada bloque `[data-reveal]` cuando entra en pantalla. Lo que ya se ve al cargar no se toca.
 */
export function Reveal() {
  useEffect(() => {
    if (CSS.supports('animation-timeline: view()') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add(s.shown);
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    for (const el of document.querySelectorAll<HTMLElement>('[data-reveal]')) {
      if (el.getBoundingClientRect().top < innerHeight) continue;
      el.classList.add(s.revealJs);
      io.observe(el);
    }
    return () => io.disconnect();
  }, []);
  return null;
}
