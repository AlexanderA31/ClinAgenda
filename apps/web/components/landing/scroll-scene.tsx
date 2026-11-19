'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * Todo lo que se mueve en la página pública, atado a la posición del scroll (no a un temporizador):
 * si la persona sube, la animación retrocede; si se detiene, se detiene. El HTML viene del servidor y
 * marca qué hace cada cosa con atributos:
 *   data-hero-line      renglón del titular que sube al cargar
 *   data-hero-fade      aparece al cargar, después del titular
 *   data-parallax="n"   se desplaza a otra velocidad que la página (n: cuánto, en % de su alto)
 *   data-parallax-inner el dibujo se desliza dentro de su cuadro
 *   data-rise           sube y aparece mientras entra en pantalla
 *   data-words          cada palabra se enciende al pasar
 *   data-zoom           la frase crece hasta salir de la pantalla (sección fija mientras tanto)
 *   data-avenue-*       la avenida de norte a sur se dibuja y enciende cada clínica
 *   data-hscroll        "Su cita" se recorre de lado (solo en pantallas anchas)
 *   data-giant          el nombre del pie entra deslizándose
 * Con "reducir movimiento" no se anima nada y el scroll es el normal del navegador.
 */
export function ScrollScene() {
  useEffect(() => {
    const mm = gsap.matchMedia();
    let lenis: Lenis | null = null;

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      // Scroll suave: Lenis mueve la página y avisa a ScrollTrigger en cada cuadro.
      lenis = new Lenis({ lerp: 0.09, anchors: { offset: -72 } });
      lenis.on('scroll', ScrollTrigger.update);
      const tick = (time: number) => lenis?.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);

      // Al cargar: el titular sube renglón por renglón y después aparece el resto de la portada.
      gsap
        .timeline({ defaults: { ease: 'power4.out' } })
        .from('[data-hero-line]', { yPercent: 110, duration: 1.3, stagger: 0.12 })
        .from('[data-hero-fade]', { y: 30, opacity: 0, duration: 1, stagger: 0.08 }, '-=0.8');

      gsap.utils.toArray<HTMLElement>('[data-parallax]').forEach((el) => {
        const amount = Number(el.dataset.parallax) || 10;
        gsap.fromTo(el, { yPercent: amount }, { yPercent: -amount, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
      });

      gsap.utils.toArray<HTMLElement>('[data-parallax-inner]').forEach((el) => {
        gsap.fromTo(el, { yPercent: -9 }, { yPercent: 9, ease: 'none', scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
      });

      gsap.utils.toArray<HTMLElement>('[data-rise]').forEach((el) => {
        gsap.fromTo(el, { y: 70, opacity: 0 }, { y: 0, opacity: 1, ease: 'none', scrollTrigger: { trigger: el, start: 'top 95%', end: 'top 62%', scrub: true } });
      });

      gsap.utils.toArray<HTMLElement>('[data-words]').forEach((el) => {
        gsap.fromTo(el.querySelectorAll('span'), { opacity: 0.14 }, { opacity: 1, stagger: 0.08, ease: 'none', scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 45%', scrub: true } });
      });

      // La frase de las tres clínicas: la sección queda fija y el texto crece hasta atravesar la pantalla.
      gsap.utils.toArray<HTMLElement>('[data-zoom]').forEach((el) => {
        gsap
          .timeline({ scrollTrigger: { trigger: el.parentElement, start: 'top top', end: '+=140%', scrub: true, pin: true } })
          .fromTo(el, { scale: 0.85 }, { scale: 1, ease: 'none', duration: 0.3 })
          .to(el, { scale: 9, opacity: 0, ease: 'power2.in', duration: 0.7 });
      });

      // La avenida: se dibuja con el recorrido de las clínicas y cada parada se enciende al llegar a su capítulo.
      const draw = document.querySelector<SVGPathElement>('[data-avenue-draw]');
      const chapters = document.querySelector<HTMLElement>('[data-avenue-chapters]');
      if (draw && chapters) {
        const length = draw.getTotalLength();
        gsap.set(draw, { strokeDasharray: length, strokeDashoffset: length });
        gsap.to(draw, { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: chapters, start: 'top 55%', end: 'bottom 70%', scrub: true } });
        chapters.querySelectorAll<HTMLElement>('[data-chapter]').forEach((chapter) => {
          const marks = document.querySelectorAll(`[data-avenue-stop="${chapter.dataset.chapter}"]`);
          // Activa desde que el capítulo llega a la mitad de la pantalla hasta el final de la página.
          ScrollTrigger.create({ trigger: chapter, start: 'top 60%', end: 'max', onToggle: (self) => marks.forEach((m) => m.toggleAttribute('data-on', self.isActive)) });
        });
      }

      gsap.utils.toArray<HTMLElement>('[data-giant]').forEach((el) => {
        gsap.fromTo(el, { xPercent: 18 }, { xPercent: 0, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom bottom', scrub: true } });
      });

      return () => {
        gsap.ticker.remove(tick);
        lenis?.destroy();
        lenis = null;
      };
    });

    // De lado solo donde hay ancho: en el celular los pasos se leen hacia abajo.
    mm.add('(prefers-reduced-motion: no-preference) and (min-width: 1024px)', () => {
      gsap.utils.toArray<HTMLElement>('[data-hscroll]').forEach((section) => {
        const track = section.querySelector<HTMLElement>('[data-htrack]');
        if (!track) return;
        const distance = () => Math.max(0, track.scrollWidth - section.clientWidth);
        gsap.to(track, { x: () => -distance(), ease: 'none', scrollTrigger: { trigger: section, start: 'top top', end: () => `+=${distance()}`, scrub: true, pin: true, invalidateOnRefresh: true } });
      });
    });

    // Las fuentes cambian el alto de los textos: se recalculan las posiciones cuando terminan de cargar.
    void document.fonts?.ready.then(() => ScrollTrigger.refresh());
    return () => mm.revert();
  }, []);

  return null;
}
