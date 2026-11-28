const legacyPublicPaths: Record<string, string> = {
  "/about/overview": "/about",
  "/about/history": "/about#history",
  "/about/mission-vision": "/about#mission",
  "/academics/overview": "/academics",
  "/academics/primary": "/academics#primary",
  "/academics/secondary": "/academics#secondary",
  "/academics/plus-2": "/academics#plus-2",
  "/academics/curriculum": "/academics#curriculum",
  "/academics/departments": "/departments",
  "/academics/library": "/facilities#library",
  "/academics/sports": "/campus-life/activities",
  "/academics/faculty": "/departments",
  "/academics/downloads": "/downloads",
  "/teachers": "/departments",
  "/campus-life/facilities": "/facilities",
  "/campus-life/virtual-tour": "/facilities",
  "/campus-life/transport": "/facilities#transportation",
};

/** Resolve old school links while keeping filters and explicit section links. */
export function canonicalPublicHref(href: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const [, path, query, fragment] = /^([^?#]*)(\?[^#]*)?(#.*)?$/s.exec(href)!;
  const pathname = path.length > 1 ? path.replace(/\/$/, "") : path;
  const department = pathname.match(/^\/academics\/departments\/([^/]+)$/);
  const destination = department
    ? `/departments/${department[1]}`
    : (legacyPublicPaths[pathname] ?? pathname);
  const [page, section] = destination.split("#");
  return page + (query ?? "") + (fragment || (section ? "#" + section : ""));
}
