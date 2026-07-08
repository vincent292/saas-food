"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { ArrowRight, Star } from "lucide-react";
import gsap from "gsap";

export function HomeHeroVisual({ imageSrc, restaurantName }: { imageSrc: string; restaurantName: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const ctx = gsap.context(() => {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const floaters = gsap.utils.toArray<HTMLElement>(".hero-floater");
      const dots = gsap.utils.toArray<HTMLElement>(".hero-dot");

      if (prefersReducedMotion) {
        gsap.set([imageRef.current, ...floaters, ...dots], { opacity: 1 });
        return;
      }

      gsap.fromTo(imageRef.current, { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: 0.9, ease: "power3.out" });
      gsap.fromTo(floaters, { opacity: 0, y: 18, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.75, stagger: 0.1, ease: "power3.out", delay: 0.15 });
      gsap.fromTo(dots, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.45, stagger: 0.05, ease: "power2.out", delay: 0.25 });
      gsap.to(imageRef.current, { scale: 1.04, duration: 5.5, repeat: -1, yoyo: true, ease: "sine.inOut" });
      gsap.to(floaters, { y: -7, duration: 2.6, repeat: -1, yoyo: true, stagger: 0.16, ease: "sine.inOut" });
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={rootRef}
      className="relative mt-6 min-h-[320px] overflow-hidden rounded-[1.75rem] bg-[var(--primary)] shadow-[0_28px_70px_rgb(8_36_65_/_0.26)] lg:mt-0 lg:min-h-[430px]"
    >
      <div ref={imageRef} className="absolute inset-0">
        <Image alt="Comida destacada" className="object-cover" fill priority sizes="(min-width:1024px) 430px, 100vw" src={imageSrc} />
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(8_36_65_/_0.92)_0%,rgb(8_36_65_/_0.64)_42%,rgb(8_36_65_/_0.08)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#082441] to-transparent" />

      <div className="hero-floater absolute left-5 top-5 z-10 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-3 py-2 text-xs font-black text-[var(--primary)] shadow-[var(--shadow-glow)]">
        <Star className="h-3.5 w-3.5 fill-current" />
        Destacado
      </div>

      <div className="hero-floater absolute right-5 top-5 z-20 grid h-12 w-12 place-items-center rounded-full bg-white text-[var(--primary)] shadow-xl">
        <ArrowRight className="h-5 w-5 rotate-45" />
      </div>

      <div className="absolute bottom-6 left-5 right-5 z-10 max-w-sm text-white">
        <h2 className="max-w-xs text-4xl font-black leading-none sm:text-5xl">Listo para ordenar</h2>
        <p className="mt-3 max-w-xs text-sm font-semibold leading-6 text-white/82">{restaurantName} y mas opciones listas para delivery o recojo.</p>
        <div className="mt-5 flex items-center gap-2">
          {[0, 1, 2, 3].map((item) => (
            <span className={item === 0 ? "hero-dot h-3 w-3 rounded-full bg-[var(--accent)]" : "hero-dot h-3 w-3 rounded-full bg-white/45"} key={item} />
          ))}
        </div>
      </div>

      <div className="hero-floater absolute bottom-5 right-5 hidden rounded-2xl bg-white/94 px-4 py-3 shadow-[var(--shadow-card)] ring-1 ring-white/70 backdrop-blur sm:block">
        <p className="text-xs font-black text-[var(--primary)]">Entrega rapida</p>
        <p className="text-xs font-semibold text-[var(--color-secondary-text)]">Pedido directo</p>
      </div>
    </div>
  );
}
