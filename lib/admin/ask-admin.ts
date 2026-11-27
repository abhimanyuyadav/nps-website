import { hasAdminAccess, type AdminRole } from "./authorization";

export type MenuPage = { href: string; label: string; roles: readonly AdminRole[] };
export type Destination = { key: string; label: string; href: string };
export type NavigationIntent = {
  keys?: string[];
  directory?: boolean;
  applicationId?: string;
  archive?: boolean;
};

const historyPages = new Set(["admissions", "contacts", "registrations", "newsletter", "ai", "jobs"]);

export function destinations(
  menu: readonly MenuPage[],
  roles: readonly string[],
  eligible: boolean,
  intent: NavigationIntent,
): Destination[] {
  const allowed = menu
    .filter((page) => hasAdminAccess(roles, page.roles))
    .map(({ href, label }) => ({
      href,
      label,
      key: href === "/admin" ? "dashboard" : href.slice("/admin/".length),
    }));
  if (eligible) allowed.push({ key: "bootstrap", label: "Set up the first admin", href: "/admin/bootstrap" });
  if (allowed.some((page) => page.key === "pages"))
    allowed.push({
      key: "admissions-page",
      label: "Admissions information on the website",
      href: "/admin/pages?section=admissions",
    });
  if (intent.directory) return allowed;
  if (!Array.isArray(intent.keys)) return [];
  return allowed
    .filter((page) => intent.keys?.includes(page.key))
    .flatMap((page) => {
      if (intent.archive && !historyPages.has(page.key)) return [];
      let href = page.href;
      if (intent.applicationId !== undefined) {
        if (page.key !== "admissions" || !/^[a-z0-9]{20,64}$/.test(intent.applicationId)) return [];
        href += "/" + intent.applicationId;
      }
      return [{ ...page, href: href + (intent.archive ? "?archive=1" : "") }];
    });
}
