import { createElement as h, type ComponentType } from "preact";
import { DocumentPath, useDocumentPath } from "./path";
import { renderToString } from "preact-render-to-string";

// Serialize only the public props of controls that actually appear in this document.
export function island<P extends object>(name: string, Control: ComponentType<P>) {
  return (props: P) =>
    h("div", {
      class: "contents",
      "data-school-control": name,
      "data-props": JSON.stringify(props),
      dangerouslySetInnerHTML: {
        __html: renderToString(h(DocumentPath.Provider, { value: useDocumentPath() }, h(Control, props))),
      },
    });
}
