"use client";

import { type ElementType, type ReactNode } from "react";

type RevealVariant = "up" | "left" | "right" | "scale" | "none";

let observer: IntersectionObserver | undefined;

export function observeReveal(node: HTMLElement | null) {
  if (!node) return;
  if (!("IntersectionObserver" in window)) {
    node.dataset.revealed = "true";
    return;
  }
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.target instanceof HTMLElement) {
          entry.target.dataset.revealed = "true";
          observer?.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
  );
  observer.observe(node);
  return () => observer?.unobserve(node);
}

/**
 * Reveals its children once they scroll into view. The server-rendered markup
 * already contains the content, so search engines and no-script visitors keep
 * the full page; only the transition is progressive enhancement.
 */
export function Reveal({
  as = "div",
  variant = "up",
  delay = 0,
  className = "",
  children,
  ...rest
}: {
  as?: ElementType;
  variant?: RevealVariant;
  /** Stagger in milliseconds, applied as a transition delay. */
  delay?: number;
  className?: string;
  children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "children" | "className">) {
  const Tag = as as ElementType;
  return (
    <Tag
      ref={observeReveal}
      data-reveal={variant}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as React.CSSProperties) : undefined}
      className={`reveal ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
