import type { BrowserClerk, ClerkOptions, LoadedClerk } from "@clerk/shared/types";

function loadScript(src: string, publishableKey?: string) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.crossOrigin = "anonymous";
    if (publishableKey) script.dataset.clerkPublishableKey = publishableKey;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load staff sign-in"));
    document.head.append(script);
  });
}

async function loadStaffIdentity(form: HTMLFormElement) {
  const origin = "https://" + form.dataset.domain;
  await Promise.all([
    loadScript(origin + "/npm/@clerk/ui@1/dist/ui.browser.js"),
    loadScript(origin + "/npm/@clerk/clerk-js@6/dist/clerk.browser.js", form.dataset.key),
  ]);
  const sdk = window as unknown as {
    Clerk: BrowserClerk & LoadedClerk;
    __internal_ClerkUICtor: NonNullable<ClerkOptions["ui"]>["ClerkUI"];
  };
  await sdk.Clerk.load({
    ui: { ClerkUI: sdk.__internal_ClerkUICtor },
    signInUrl: "/sign-in",
    signInFallbackRedirectUrl: "/admin",
  });
  return sdk.Clerk;
}

export function bindStaffEmailForm(
  form: HTMLFormElement,
  loadIdentity = loadStaffIdentity,
  navigate = (path: string) => location.assign(path),
) {
  const address = form.querySelector<HTMLInputElement>("#staff-address")!;
  const code = form.querySelector<HTMLInputElement>("#staff-code")!;
  const step = form.querySelector<HTMLElement>("#staff-code-step")!;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const status = form.querySelector<HTMLElement>('[role="status"]')!;
  let identity: ReturnType<typeof loadIdentity> | undefined;
  function showCode() {
    address.readOnly = true;
    step.hidden = false;
    code.disabled = false;
    code.required = true;
    button.textContent = "Verify and sign in";
    status.textContent = "If this address can receive a sign-in code, check your inbox.";
    code.focus();
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (button.disabled || !form.reportValidity()) return;
    button.disabled = true;
    form.setAttribute("aria-busy", "true");
    status.textContent = "Contacting secure sign-in…";
    try {
      identity ??= loadIdentity(form).catch((error: unknown) => {
        identity = undefined;
        throw error;
      });
      const clerk = await identity;
      if (clerk.isSignedIn) {
        navigate("/admin");
        return;
      }
      if (step.hidden) {
        const attempt = await clerk.client.signIn.create({ identifier: address.value.trim() });
        const factor = attempt.supportedFirstFactors?.find((f) => f.strategy === "email_code");
        if (attempt.status !== "needs_first_factor" || !factor) {
          navigate("/sign-in?staff-method=provider");
          return;
        }
        await attempt.prepareFirstFactor({ strategy: "email_code", emailAddressId: factor.emailAddressId });
        showCode();
      } else {
        const attempt = await clerk.client.signIn.attemptFirstFactor({
          strategy: "email_code",
          code: code.value.trim(),
        });
        if (attempt.status === "complete" && attempt.createdSessionId) {
          await clerk.setActive({ session: attempt.createdSessionId, redirectUrl: "/admin" });
        } else if (attempt.status === "needs_second_factor" || attempt.status === "needs_client_trust") {
          navigate("/sign-in/factor-two");
        } else {
          navigate("/sign-in?staff-method=provider");
        }
      }
    } catch (error) {
      const reason = (error as { errors?: { code: string }[] } | null)?.errors?.[0]?.code;
      if (step.hidden && reason === "form_identifier_not_found") showCode();
      else
        status.textContent = step.hidden
          ? "Could not start email sign-in. Try again or use another method below."
          : "Could not verify this code. Check it and try again, or use another method below.";
    } finally {
      button.disabled = false;
      form.removeAttribute("aria-busy");
    }
  });
  button.disabled = false;
}
