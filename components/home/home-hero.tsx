import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HeroCarousel, type HeroSlide } from "./hero-carousel";
import type { HomeSection, SiteProfile } from "@/lib/data/public";
import { schoolSearchName, schoolSearchShortName } from "@/lib/content/school-search";

export function HomeHero({
  slides,
  hero,
  site,
}: {
  slides: HeroSlide[];
  hero?: HomeSection;
  site: Pick<SiteProfile, "schoolName" | "description" | "location">;
}) {
  return (
    <HeroCarousel slides={slides}>
      <div className="home-hero-copy max-w-3xl">
        <p className="anim-fade-up flex items-center gap-3 text-[11px] font-extrabold tracking-[.26em] text-[#f0bd3a] uppercase">
          <span aria-hidden="true" className="h-px w-9 bg-[#f0bd3a]" />
          {hero?.eyebrow ?? site.location}
        </p>
        <h1
          className="anim-fade-up mt-6 text-[2.6rem] leading-[1.02] font-extrabold tracking-[-.045em] sm:text-6xl lg:text-[4.4rem]"
          style={{ animationDelay: "120ms" }}
        >
          {hero?.heading ?? site.schoolName}
        </h1>
        <p
          className="anim-fade-up mt-5 text-base font-semibold text-sky-200 sm:text-lg"
          style={{ animationDelay: "180ms" }}
        >
          {schoolSearchName} ({schoolSearchShortName}) · Garuda, Rautahat, Nepal
        </p>
        <p
          className="anim-fade-up mt-7 max-w-2xl text-base leading-8 text-slate-200 sm:text-lg"
          style={{ animationDelay: "240ms" }}
        >
          {hero?.body ?? site.description}
        </p>
        {hero?.ctaLabel && hero.ctaHref && (
          <div className="anim-fade-up mt-9 flex flex-wrap gap-3" style={{ animationDelay: "340ms" }}>
            <Link
              prefetch={false}
              href={hero.ctaHref}
              className="group inline-flex max-w-full items-center gap-2 rounded-xl bg-[#2e3192] px-6 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-black/20 transition hover:bg-[#3a3fa5]"
            >
              {hero.ctaLabel}
              <ArrowRight
                size={17}
                className="shrink-0 transition-transform duration-300 group-hover:translate-x-1"
              />
            </Link>
          </div>
        )}
      </div>
    </HeroCarousel>
  );
}
