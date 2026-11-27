import "./safe-urls";
import { createElement as h, hydrate, type ComponentType } from "preact";
import { observeReveal } from "@/components/site/reveal";
import { controls } from "./controls";

for (const root of document.querySelectorAll<HTMLElement>("[data-school-control]")) {
  const name = root.dataset.schoolControl as keyof typeof controls;
  if (!Object.hasOwn(controls, name)) continue;
  const Control = controls[name] as ComponentType<object>;
  hydrate(h(Control, JSON.parse(root.dataset.props ?? "{}")), root);
  root.removeAttribute("data-props");
}

// Observe section boundaries first so distant gallery and news items can retain content-visibility.
if ("IntersectionObserver" in window) {
  const sections = new IntersectionObserver(
    (entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const element of entry.target.querySelectorAll<HTMLElement>(".reveal")) observeReveal(element);
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "480px 0px" },
  );
  for (const section of document.querySelectorAll(".home-deferred-section, footer")) sections.observe(section);
  document.documentElement.classList.add("reveal-enabled");
}
