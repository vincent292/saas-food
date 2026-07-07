"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { ArrowRight, Star } from "lucide-react";
import gsap from "gsap";

export function HomeHeroVisual({ imageSrc, restaurantName }: { imageSrc: string; restaurantName: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const plateRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const ctx = gsap.context(() => {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const floaters = gsap.utils.toArray<HTMLElement>(".hero-floater");
      const dots = gsap.utils.toArray<HTMLElement>(".hero-dot");

      if (prefersReducedMotion) {
        gsap.set([plateRef.current, ...floaters, ...dots], { opacity: 1 });
        return;
      }

      gsap.fromTo(plateRef.current, { opacity: 0, scale: 0.86, y: 22 }, { opacity: 1, scale: 1, y: 0, duration: 0.9, ease: "back.out(1.6)" });
      gsap.fromTo(floaters, { opacity: 0, y: 18, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.75, stagger: 0.1, ease: "power3.out", delay: 0.15 });
      gsap.fromTo(dots, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.45, stagger: 0.025, ease: "power2.out", delay: 0.25 });

      gsap.to(plateRef.current, { y: -10, rotate: 1.4, duration: 3.4, repeat: -1, yoyo: true, ease: "sine.inOut" });
      gsap.to(".hero-lime-orbit", { rotate: 360, duration: 16, repeat: -1, ease: "none", transformOrigin: "50% 50%" });
      gsap.to(floaters, { y: -8, duration: 2.4, repeat: -1, yoyo: true, stagger: 0.18, ease: "sine.inOut" });
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={rootRef}
      className="relative mt-6 min-h-[300px] overflow-hidden rounded-[1.75rem] bg-[radial-gradient(circle_at_22%_18%,rgba(199,240,0,0.22),transparent_28%),linear-gradient(145deg,#12355B_0%,#082441_100%)] lg:mt-0 lg:min-h-[380px] lg:bg-[radial-gradient(circle_at_28%_24%,rgba(199,240,0,0.26),transparent_22%),linear-gradient(145deg,#FFFFFF_0%,#F8FAFC_100%)]"
    >
      <div className="absolute left-5 top-5 z-10 grid grid-cols-4 gap-1.5 opacity-80">
        {Array.from({ length: 16 }).map((_, index) => (
          <span className="hero-dot h-1.5 w-1.5 rounded-full bg-[var(--accent)]" key={index} />
        ))}
      </div>

      <div className="hero-lime-orbit pointer-events-none absolute right-9 top-8 z-10 h-16 w-16">
        <span className="absolute left-1/2 top-0 h-5 w-10 -translate-x-1/2 rounded-[100%_0] bg-[var(--accent)]" />
        <span className="absolute bottom-0 left-1/2 h-5 w-10 -translate-x-1/2 rotate-180 rounded-[100%_0] bg-[var(--accent)]" />
      </div>

      <div ref={plateRef} className="absolute left-1/2 top-[46%] h-64 w-64 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full bg-[var(--surface)] shadow-[0_30px_80px_rgb(8_36_65_/_0.34)] ring-[18px] ring-white/12 lg:h-80 lg:w-80 lg:ring-[22px] lg:ring-[var(--surface)]">
        <Image alt="Comida destacada" className="h-full w-full scale-110 object-cover" fill priority sizes="(min-width:1024px) 320px, 256px" src={imageSrc} />
      </div>

      <div className="hero-floater absolute bottom-20 left-6 hidden rounded-2xl bg-white/92 px-4 py-3 shadow-[var(--shadow-card)] ring-1 ring-[var(--border)] backdrop-blur sm:block">
        <p className="text-xs font-black text-[var(--primary)]">Entrega rápida</p>
        <p className="text-xs font-semibold text-[var(--color-secondary-text)]">Pedido directo</p>
      </div>

      <div className="hero-floater absolute right-5 top-5 z-20 grid h-12 w-12 place-items-center rounded-full bg-[var(--accent)] text-[var(--primary)] shadow-[var(--shadow-glow)]">
        <ArrowRight className="h-5 w-5 rotate-45" />
      </div>

      <div className="hero-floater absolute bottom-4 left-4 right-4 rounded-[1.25rem] bg-white/94 p-4 shadow-[var(--shadow-card)] ring-1 ring-white/70 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-black text-[var(--primary)]">Listo para ordenar</p>
            <p className="mt-1 line-clamp-1 text-xs font-semibold text-[var(--color-secondary-text)]">{restaurantName} en un solo directorio.</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--accent)] px-2.5 py-1 text-xs font-black text-[var(--primary)]">
            <Star className="h-3.5 w-3.5 fill-current" />
            Top
          </span>
        </div>
      </div>
    </div>
  );
}
