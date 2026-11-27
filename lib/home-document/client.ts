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

for (const element of document.querySelectorAll<HTMLElement>(".reveal")) observeReveal(element);
document.documentElement.classList.add("reveal-enabled");
