import "./safe-urls";
import { createElement as h, hydrate, type ComponentType } from "preact";
import { observeReveal } from "@/components/site/reveal";
import { controls } from "./controls";

const pendingControl = "[data-school-control][data-props]";
function activate(root: HTMLElement) {
  const name = root.dataset.schoolControl as keyof typeof controls;
  if (root.dataset.props === undefined || !Object.hasOwn(controls, name)) return;
  const props = JSON.parse(root.dataset.props);
  root.removeAttribute("data-props");
  hydrate(h(controls[name] as ComponentType<object>, props), root);
}

const sectionBoundary = ".home-deferred-section, footer";
const canObserve = "IntersectionObserver" in window;
for (const root of document.querySelectorAll<HTMLElement>(pendingControl)) {
  if (!canObserve || !root.closest(sectionBoundary)) activate(root);
}

if (canObserve) {
  // Activate editorial controls before they scroll into view. Their links and text are already HTML.
  const sections = new IntersectionObserver(
    (entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const root of entry.target.querySelectorAll<HTMLElement>(pendingControl)) activate(root);
        for (const element of entry.target.querySelectorAll<HTMLElement>(".reveal")) observeReveal(element);
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "480px 0px" },
  );
  if (document.documentElement.classList.contains("school-inner-document")) {
    for (const element of document.querySelectorAll<HTMLElement>("main .reveal")) observeReveal(element);
  }
  for (const section of document.querySelectorAll(sectionBoundary)) sections.observe(section);
  // Keyboard users or a direct jump can reach a control before its intersection callback runs.
  const onInteraction = (event: Event) => {
    const root = event.target instanceof Element ? event.target.closest<HTMLElement>(pendingControl) : null;
    if (root) activate(root);
  };
  for (const event of ["focusin", "pointerdown", "click", "submit"]) {
    document.addEventListener(event, onInteraction, { capture: true, passive: true });
  }
  document.documentElement.classList.add("reveal-enabled");
}
