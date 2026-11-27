import "../home-document/safe-urls";
import { createElement, hydrate, type ComponentType } from "preact";

export function activatePageControl(name: string, control: ComponentType<object>) {
  for (const root of document.querySelectorAll<HTMLElement>("[data-school-control][data-props]")) {
    if (root.dataset.schoolControl !== name) continue;
    const props = JSON.parse(root.dataset.props ?? "{}");
    root.removeAttribute("data-props");
    hydrate(createElement(control, props), root);
  }
}
