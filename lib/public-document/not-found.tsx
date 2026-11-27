/* eslint-disable @next/next/no-head-element -- The error response is a complete HTML document. */
import { renderToString } from "preact-render-to-string";
import NotFoundPage from "@/app/not-found";

declare const HOME_ASSETS: { css: string };
export class PublicPageNotFound extends Error {}
export function notFound(): never {
  throw new PublicPageNotFound();
}
export function renderMissingPage() {
  return (
    "<!doctype html>" +
    renderToString(
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <meta name="robots" content="noindex, nofollow" />
          <title>Page not found | NPS Garuda</title>
          <link rel="stylesheet" href={HOME_ASSETS.css} />
        </head>
        <body>
          <NotFoundPage />
        </body>
      </html>,
    )
  );
}
