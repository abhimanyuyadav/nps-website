import { options } from "preact";

// Preserve React's URL-scheme protection when rendering native elements with Preact.
const previous = options.vnode;
options.vnode = (node) => {
  previous?.(node);
  if (typeof node.type !== "string") return;
  const props = node.props as Record<string, unknown>;
  for (const key of ["href", "src", "action", "formAction", "xlinkHref"]) {
    const value = props[key];
    if (typeof value === "string" && /^javascript:/i.test(value.replace(/[\t\n\r]/g, "").trimStart())) {
      delete props[key];
    }
  }
};
