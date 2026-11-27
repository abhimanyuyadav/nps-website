import { build } from "esbuild";
import tailwind from "@tailwindcss/postcss";
import postcss from "postcss";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(process.cwd(), process.env.NODE_ENV === "development");
const root = process.cwd();
const assetsDir = path.resolve("public/school-home-assets");
const generatedDir = path.resolve("lib/home-document/generated");
await Promise.all([mkdir(assetsDir, { recursive: true }), mkdir(generatedDir, { recursive: true })]);
const adapters = Object.fromEntries(
  Object.entries({
    link: "native-link.tsx",
    image: "native-image.tsx",
    navigation: "navigation.ts",
    dynamic: "dynamic.tsx",
    script: "script.tsx",
  }).map(([name, file]) => ["next/" + name, path.resolve("lib/home-document", file)]),
);
const imageConfig = {
  ...require("next/dist/shared/lib/image-config").imageConfigDefault,
  qualities: [65, 75],
};
const common = {
  bundle: true,
  minify: true,
  jsx: "automatic",
  jsxImportSource: "preact",
  metafile: true,
  alias: { ...adapters, react: "preact/compat", "react-dom": "preact/compat" },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env.__NEXT_IMAGE_OPTS": JSON.stringify(imageConfig),
    "process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY": JSON.stringify(
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "",
    ),
  },
};
const cssFile = path.resolve("app/globals.css");
const fontImport = '@import "@fontsource-variable/manrope";';
const input = (await readFile(cssFile, "utf8")).replace(fontImport, "");
const compiled = await postcss([tailwind({ base: root })]).process(input, { from: cssFile });
const cssBuild = await build({
  stdin: {
    contents: fontImport + "\n" + compiled.css,
    loader: "css",
    resolveDir: root,
    sourcefile: "school-home.css",
  },
  bundle: true,
  minify: true,
  metafile: true,
  outdir: assetsDir,
  entryNames: "styles-[hash]",
  assetNames: "[name]-[hash]",
  loader: { ".woff2": "file", ".woff": "file" },
});
const pageControls = JSON.parse(await readFile("lib/public-document/controls.json", "utf8"));
const pageRoutes = JSON.parse(await readFile("lib/public-document/routes.json", "utf8"));
const publicEntries = {
  name: "public-document-entries",
  setup(api) {
    api.onResolve({ filter: /^school-page-modules$/ }, () => ({ path: "pages", namespace: "school-pages" }));
    api.onLoad({ filter: /.*/, namespace: "school-pages" }, () => ({
      loader: "js",
      resolveDir: root,
      contents:
        pageRoutes
          .map(
            (route, i) =>
              "import * as page" + i + " from " + JSON.stringify("./app/(site)" + route + "/page.tsx") + ";",
          )
          .join("\n") +
        "export const pages={" +
        pageRoutes.map((route, i) => JSON.stringify(route) + ":page" + i).join(",") +
        "};",
    }));
    api.onResolve({ filter: /^control-entry:/ }, (args) => ({
      path: args.path.slice(14),
      namespace: "page-control-entry",
    }));
    api.onLoad({ filter: /.*/, namespace: "page-control-entry" }, (args) => ({
      loader: "js",
      resolveDir: root,
      contents:
        "import {activatePageControl} from './lib/public-document/activate';import {" +
        args.path +
        " as Control} from " +
        JSON.stringify("./" + pageControls[args.path]) +
        ";activatePageControl(" +
        JSON.stringify(args.path) +
        ",Control);",
    }));
  },
};
const browserBuild = await build({
  ...common,
  entryPoints: {
    home: "lib/home-document/client.ts",
    ...Object.fromEntries(Object.keys(pageControls).map((name) => [name, "control-entry:" + name])),
  },
  plugins: [publicEntries],
  format: "esm",
  platform: "browser",
  splitting: true,
  target: "es2020",
  outdir: assetsDir,
  entryNames: "[name]-[hash]",
  chunkNames: "chunk-[hash]",
});
function assetUrl(buildResult, predicate) {
  const match = Object.keys(buildResult.metafile.outputs).find(predicate);
  if (!match) throw new Error("Missing homepage asset");
  return "/school-home-assets/" + path.basename(match);
}
const pageAssets = Object.fromEntries(
  Object.keys(pageControls).map((name) => [
    name,
    assetUrl(
      browserBuild,
      (file) => browserBuild.metafile.outputs[file].entryPoint === "page-control-entry:" + name,
    ),
  ]),
);
const staffBrowserBuild = await build({
  entryPoints: ["lib/public-document/staff-entry.ts"],
  bundle: true,
  minify: true,
  metafile: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  outdir: assetsDir,
  entryNames: "staff-[hash]",
});
const assets = {
  css: assetUrl(cssBuild, (file) => file.endsWith(".css")),
  font: assetUrl(cssBuild, (file) => file.includes("manrope-latin-wght-normal-") && file.endsWith(".woff2")),
  script: assetUrl(
    browserBuild,
    (file) => browserBuild.metafile.outputs[file].entryPoint === "lib/home-document/client.ts",
  ),
};

// Only these boundaries hydrate. Editorial text, links and photos stay ordinary HTML.
const islands = new Map(
  Object.entries({
    ...Object.fromEntries(Object.entries(pageControls).map(([name, file]) => [file, name])),
    "components/site/site-header": "SiteHeader",
    "components/home/home-hero": "HomeHero",
    "components/home/management-carousel": "ManagementCarousel",
    "components/home/alumni-carousel": "AlumniCarousel",
    "components/forms/newsletter-form": "NewsletterForm",
    "components/assistant/assistant-launcher": "AssistantLauncher",
  }).map(([file, name]) => [path.resolve(file), name]),
);
const boundaries = {
  name: "school-home-controls",
  setup(api) {
    api.onResolve({ filter: /^(?:@\/|\.\.?\/)/ }, (args) => {
      if (args.namespace !== "file") return;
      const file = args.path.startsWith("@/")
        ? path.resolve(args.path.slice(2))
        : path.resolve(args.resolveDir, args.path);
      if (islands.has(file)) return { path: file, namespace: "school-control" };
    });
    api.onLoad({ filter: /.*/, namespace: "school-control" }, (args) => {
      const name = islands.get(args.path);
      return {
        loader: "js",
        resolveDir: root,
        contents:
          "import {island} from " +
          JSON.stringify(path.resolve("lib/home-document/island.ts")) +
          "; import {" +
          name +
          " as Control} from " +
          JSON.stringify(args.path + ".tsx") +
          "; export const " +
          name +
          "=island(" +
          JSON.stringify(name) +
          ",Control);",
      };
    });
  },
};
await build({
  ...common,
  entryPoints: ["lib/home-document/document.tsx"],
  format: "esm",
  platform: "node",
  target: "node22",
  outfile: path.join(generatedDir, "render.mjs"),
  plugins: [boundaries],
  define: { ...common.define, HOME_ASSETS: JSON.stringify(assets), PAGE_ASSETS: JSON.stringify(pageAssets) },
});

// Keep data access in the Next.js server runtime. The browser build only imports interactive UI modules.
const serverImports = {
  name: "next-server-imports",
  setup(api) {
    api.onResolve({ filter: /^next\/navigation$/ }, (args) =>
      args.importer.endsWith("server-navigation.ts")
        ? { path: args.path, external: true }
        : { path: path.resolve("lib/public-document/server-navigation.ts") },
    );
    api.onResolve(
      { filter: /^(?:@\/lib\/(?:data\/public|server\/.*)|@\/convex\/.*|convex\/nextjs)$/ },
      (args) => ({ path: args.path, external: true }),
    );
  },
};
await build({
  ...common,
  entryPoints: ["lib/public-document/render-page.tsx"],
  format: "esm",
  platform: "node",
  target: "node22",
  outfile: path.join(generatedDir, "public.mjs"),
  plugins: [serverImports, publicEntries, boundaries],
  define: { ...common.define, HOME_ASSETS: JSON.stringify(assets), PAGE_ASSETS: JSON.stringify(pageAssets) },
});

const staffCssFile = path.resolve("lib/public-document/staff.css");
const staffCss = await postcss([tailwind({ base: root })]).process(await readFile(staffCssFile, "utf8"), {
  from: staffCssFile,
});
const staffStyles = await build({
  stdin: { contents: staffCss.css, loader: "css" },
  write: false,
  minify: true,
});

await build({
  ...common,
  entryPoints: ["lib/public-document/staff.tsx"],
  format: "esm",
  platform: "node",
  target: "node22",
  outfile: path.join(generatedDir, "staff.mjs"),
  define: {
    ...common.define,
    STAFF_CSS: JSON.stringify(staffStyles.outputFiles[0].text.replace("__STAFF_FONT_URL__", assets.font)),
    STAFF_SCRIPT: JSON.stringify(assetUrl(staffBrowserBuild, (file) => file.endsWith(".js"))),
  },
});
