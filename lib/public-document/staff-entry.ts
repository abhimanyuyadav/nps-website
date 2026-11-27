// Clerk owns the sign-in form, the session, and every verification step.
type StaffClerk = {
  isSignedIn: boolean;
  load(options: object): Promise<void>;
  mountSignIn(node: HTMLElement, options: object): void;
};
async function mountStaffSignIn() {
  const browser = window as unknown as { Clerk?: StaffClerk; __internal_ClerkUICtor?: unknown };
  const target = document.getElementById("staff-clerk");
  if (!target) return;
  try {
    if (!browser.Clerk || !browser.__internal_ClerkUICtor) throw new Error("Clerk is unavailable");
    await browser.Clerk.load({
      ui: { ClerkUI: browser.__internal_ClerkUICtor },
      signInUrl: "/sign-in",
      signInFallbackRedirectUrl: "/admin",
    });
    if (browser.Clerk.isSignedIn) {
      window.location.replace("/admin");
      return;
    }
    browser.Clerk.mountSignIn(target, { routing: "path", path: "/sign-in", forceRedirectUrl: "/admin" });
  } catch {
    // Fall back to the existing Next integration, preserving callback and verification parameters.
    const fallback = new URL(window.location.href);
    fallback.searchParams.set("staff-ui", "next");
    window.location.replace(fallback.href);
  }
}
void mountStaffSignIn();
