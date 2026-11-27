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
  const method = form.dataset.method;
  const currentPassword = form.querySelector<HTMLInputElement>("#staff-password");
  const newPassword = form.querySelector<HTMLInputElement>("#staff-new-password");
  let identity: ReturnType<typeof loadIdentity> | undefined;
  function showCode() {
    address.readOnly = true;
    step.hidden = false;
    code.disabled = false;
    code.required = true;
    if (newPassword) newPassword.disabled = false;
    button.textContent = method === "recover" ? "Reset password" : "Verify and sign in";
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
      const signIn = clerk.client.signIn;
      const identifier = address.value.trim();
      if (step.hidden && !currentPassword) {
        if (method === "recover") {
          await signIn.create({ strategy: "reset_password_email_code", identifier });
        } else {
          const attempt = await signIn.create({ identifier });
          const factor = attempt.supportedFirstFactors?.find((f) => f.strategy === "email_code");
          if (attempt.status !== "needs_first_factor" || !factor) {
            navigate("/sign-in?staff-ui=next");
            return;
          }
          await attempt.prepareFirstFactor({ strategy: "email_code", emailAddressId: factor.emailAddressId });
        }
        showCode();
        return;
      }
      const attempt = currentPassword
        ? await signIn.create({ identifier, password: currentPassword.value })
        : await signIn.attemptFirstFactor(
            newPassword
              ? {
                  strategy: "reset_password_email_code",
                  code: code.value.trim(),
                  password: newPassword.value,
                }
              : { strategy: "email_code", code: code.value.trim() },
          );
      if (attempt.status === "complete" && attempt.createdSessionId) {
        await clerk.setActive({ session: attempt.createdSessionId, redirectUrl: "/admin" });
      } else if (attempt.status === "needs_second_factor" || attempt.status === "needs_client_trust") {
        navigate("/sign-in/factor-two");
      } else {
        navigate("/sign-in?staff-ui=next");
      }
    } catch (error) {
      const reason = (error as { errors?: { code: string }[] } | null)?.errors?.[0]?.code;
      if (currentPassword)
        status.textContent = "Could not sign in. Check your email and password, or try another method.";
      else if (newPassword && reason === "form_password_pwned")
        status.textContent = "Choose a different password. This one has appeared in a data breach.";
      else if (step.hidden && reason === "form_identifier_not_found") showCode();
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
