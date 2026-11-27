import { expect, it, vi } from "vitest";
import { renderStaffSignIn } from "@/lib/home-document/generated/staff.mjs";
import { bindStaffEmailForm } from "@/lib/public-document/staff-email";

function setup(status: "complete" | "needs_second_factor") {
  const html = renderStaffSignIn("email", "identity.example", "test-key", "Staff", "/icon");
  document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
  const prepareFirstFactor = vi.fn().mockResolvedValue(undefined);
  const create = vi
    .fn()
    .mockResolvedValue({
      status: "needs_first_factor",
      supportedFirstFactors: [{ strategy: "email_code", emailAddressId: "test-email" }],
      prepareFirstFactor,
    });
  const setActive = vi.fn();
  const attemptFirstFactor = vi
    .fn()
    .mockResolvedValue({ status, createdSessionId: status === "complete" ? "test-session" : null });
  const sdk = { client: { signIn: { create, attemptFirstFactor } }, setActive };
  const form = document.querySelector<HTMLFormElement>("#staff-email")!;
  const navigate = vi.fn();
  bindStaffEmailForm(form, vi.fn().mockResolvedValue(sdk), navigate);
  const submit = () => form.dispatchEvent(new Event("submit", { cancelable: true }));
  const address = form.querySelector<HTMLInputElement>("#staff-address")!;
  const code = form.querySelector<HTMLInputElement>("#staff-code")!;
  address.value = "teacher@example.invalid";
  return { form, submit, code, create, prepareFirstFactor, setActive, navigate, attemptFirstFactor };
}

it.each(["complete", "needs_second_factor"] as const)(
  "honors the provider's %s verification state",
  async (status) => {
    const f = setup(status);
    f.submit();
    f.submit();
    await vi.waitFor(() => expect(f.code.disabled).toBe(false));
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.prepareFirstFactor).toHaveBeenCalledWith({
      strategy: "email_code",
      emailAddressId: "test-email",
    });
    f.code.value = "123456";
    f.submit();
    await vi.waitFor(() =>
      expect(f.attemptFirstFactor).toHaveBeenCalledWith({ strategy: "email_code", code: "123456" }),
    );
    if (status === "complete")
      expect(f.setActive).toHaveBeenCalledWith({ session: "test-session", redirectUrl: "/admin" });
    else {
      expect(f.setActive).not.toHaveBeenCalled();
      expect(f.navigate).toHaveBeenCalledWith("/sign-in/factor-two");
    }
  },
);

it("keeps access closed when the provider rejects a code", async () => {
  const f = setup("complete");
  f.submit();
  await vi.waitFor(() => expect(f.code.disabled).toBe(false));
  f.attemptFirstFactor.mockRejectedValue(new Error("invalid code"));
  f.code.value = "000000";
  f.submit();
  await vi.waitFor(() => expect(f.form.textContent).toContain("Could not verify"));
  expect(f.setActive).not.toHaveBeenCalled();
  expect(f.navigate).not.toHaveBeenCalled();
});
