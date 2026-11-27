"use client";
import type { Doc } from "@/convex/_generated/dataModel";
import { fieldClass, FormMessage, HoneypotField, TurnstileField, usePublicForm } from "./use-public-form";
export function SchoolResponseForm({ form }: { form: Doc<"schoolForms"> }) {
  const { submit, status, captcha } = usePublicForm("/api/forms/school", "The school received your answers.");
  if (status.state === "success")
    return (
      <div className="my-8 rounded-xl bg-emerald-50 p-6">
        <FormMessage {...status} />
      </div>
    );
  return (
    <form
      className="mt-8 space-y-5 rounded-2xl border bg-white p-5 sm:p-8"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        await submit({
          id: form._id,
          revision: form.revision,
          email: data.get("email"),
          website: data.get("website"),
          consent: data.get("consent") === "on",
          answers: form.fields.map((_, i) => String(data.get("field" + i) ?? "")),
        });
      }}
    >
      <HoneypotField />
      <label className="block font-semibold">
        Your email address for a receipt (required)
        <input
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          className={fieldClass}
        />
      </label>
      {form.fields.map((f, i) => (
        <label key={i} className="block font-semibold">
          {f.label}
          {f.required ? " (required)" : " (optional)"}
          {f.kind === "choice" ? (
            <select className={fieldClass} name={"field" + i} required={f.required} defaultValue="">
              <option value="">Choose an option</option>
              {f.options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : f.kind === "paragraph" ? (
            <textarea
              className={fieldClass}
              rows={4}
              maxLength={3000}
              name={"field" + i}
              required={f.required}
            />
          ) : (
            <input
              className={fieldClass}
              type={f.kind === "date" ? "date" : "text"}
              maxLength={300}
              name={"field" + i}
              required={f.required}
            />
          )}
        </label>
      ))}
      <label className="flex items-start gap-3">
        <input type="checkbox" name="consent" required className="mt-1" />I agree to share my answers with the
        school for this form.
      </label>
      <TurnstileField key={captcha.key} action="school-form" onTokenChange={captcha.setToken} />
      <FormMessage {...status} />
      <button
        disabled={status.state === "submitting"}
        className="rounded-xl bg-indigo-900 px-5 py-3 font-bold text-white"
      >
        {status.state === "submitting" ? "Sending…" : "Send answers"}
      </button>
    </form>
  );
}
