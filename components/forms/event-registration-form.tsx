"use client";

import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import {
  fieldClass,
  FormMessage,
  HoneypotField,
  TurnstileField,
  usePublicForm,
} from "@/components/forms/use-public-form";

export function EventRegistrationForm({ eventSlug, eventTitle }: { eventSlug: string; eventTitle: string }) {
  const { status, submit, captcha } = usePublicForm(
    "/api/forms/events",
    "The school received your request to attend. Look out for a separate message about your place.",
  );
  const [consent, setConsent] = useState(false);
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const sent = await submit({ ...values, eventSlug, eventTitle, consent });
    if (sent) {
      form.reset();
      setConsent(false);
    }
  }
  return (
    <form
      onSubmit={handleSubmit}
      className="relative mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8"
    >
      <HoneypotField />
      <h2 className="text-xl font-extrabold text-[#1e1f5c]">Ask to attend this event</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Places are limited. Your place is confirmed when you hear back from the school.
      </p>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-bold text-slate-700">
          Full name <span className="text-red-600">*</span>
          <input name="name" required maxLength={100} autoComplete="name" className={fieldClass} />
        </label>
        <label className="text-sm font-bold text-slate-700">
          Email <span className="text-red-600">*</span>
          <input
            name="email"
            required
            type="email"
            maxLength={160}
            autoComplete="email"
            className={fieldClass}
          />
        </label>
        <label className="text-sm font-bold text-slate-700">
          Phone number (optional)
          <input name="phone" type="tel" maxLength={30} autoComplete="tel" className={fieldClass} />
        </label>
        <label className="text-sm font-bold text-slate-700">
          How many people want to attend? <span className="text-red-600">*</span>
          <input
            name="attendeeCount"
            required
            type="number"
            min={1}
            max={10}
            defaultValue={1}
            className={fieldClass}
          />
        </label>
      </div>
      <label className="mt-5 flex items-start gap-3 text-sm leading-6 text-slate-600">
        <input
          type="checkbox"
          required
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-[#2e3192]"
        />
        <span>
          I agree that the school can use these details to manage my event sign-up.{" "}
          <span className="text-red-600">*</span>
        </span>
      </label>
      <div className="mt-6 space-y-4">
        <TurnstileField key={captcha.key} action="event-registration" onTokenChange={captcha.setToken} />
        <FormMessage {...status} />
        <button
          type="submit"
          disabled={status.state === "submitting"}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2e3192] px-5 py-3 text-sm font-bold text-white disabled:opacity-60 sm:w-auto"
        >
          <CalendarCheck size={17} className="shrink-0" />
          {status.state === "submitting" ? "Sending…" : "Send request"}
        </button>
      </div>
    </form>
  );
}
