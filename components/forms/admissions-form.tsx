"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { normalizeAcademicYear } from "@/lib/content/academic-year";
import {
  fieldClass,
  FormMessage,
  HoneypotField,
  TurnstileField,
  usePublicForm,
} from "@/components/forms/use-public-form";

export function AdmissionsForm({ academicYear }: { academicYear?: string }) {
  const confirmedYear = normalizeAcademicYear(academicYear);
  const { status, submit, captcha } = usePublicForm(
    "/api/forms/admissions",
    "The school received your admissions question. Keep your reference number.",
  );
  const [consent, setConsent] = useState(false);
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const sent = await submit({ ...values, consent });
    if (sent) {
      form.reset();
      setConsent(false);
    }
  }
  return (
    <form
      onSubmit={handleSubmit}
      className="relative rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,47,78,.08)] sm:p-8"
    >
      <HoneypotField />
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-bold text-slate-700">
          Student&apos;s full name <span className="text-red-600">*</span>
          <input name="studentName" required maxLength={120} autoComplete="name" className={fieldClass} />
        </label>
        <label className="text-sm font-bold text-slate-700">
          Student’s date of birth <span className="text-red-600">*</span>
          <input name="dateOfBirth" required type="date" className={fieldClass} />
        </label>
        <label className="text-sm font-bold text-slate-700">
          Parent or guardian’s full name <span className="text-red-600">*</span>
          <input name="guardianName" required maxLength={120} className={fieldClass} />
        </label>
        <label className="text-sm font-bold text-slate-700">
          Parent or guardian’s email <span className="text-red-600">*</span>
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
          Parent or guardian’s phone number <span className="text-red-600">*</span>
          <input name="phone" required type="tel" maxLength={30} autoComplete="tel" className={fieldClass} />
        </label>
        <label className="text-sm font-bold text-slate-700">
          Which school level are you asking about? <span className="text-red-600">*</span>
          <select name="intendedLevel" required defaultValue="" className={fieldClass}>
            <option value="" disabled>
              Choose a school level
            </option>
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
            <option value="plus-2">+2</option>
            <option value="unsure">Not sure yet</option>
          </select>
        </label>
        <label className="text-sm font-bold text-slate-700">
          Current or previous school (optional)
          <input name="previousSchool" maxLength={160} className={fieldClass} />
        </label>
        <label className="text-sm font-bold text-slate-700">
          School year
          <input
            name="academicYear"
            maxLength={40}
            value={confirmedYear ?? "Current intake"}
            readOnly
            aria-readonly="true"
            className={`${fieldClass} cursor-not-allowed bg-slate-50 text-slate-600`}
          />
          {!confirmedYear && (
            <span className="mt-2 block text-xs leading-5 font-normal text-slate-500">
              Check the latest admissions notice or ask the school which school year this covers.
            </span>
          )}
        </label>
      </div>
      <label className="mt-5 block text-sm font-bold text-slate-700">
        Your question or other details (optional)
        <textarea
          name="message"
          maxLength={1500}
          rows={5}
          className={fieldClass}
          placeholder="Tell us what you would like to know. Please leave out ID numbers and copies of ID documents."
        />
      </label>
      <label className="mt-5 flex items-start gap-3 text-sm leading-6 text-slate-600">
        <input
          type="checkbox"
          required
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-[#2e3192]"
        />
        <span>
          The details I gave are correct. I agree that the school can use them to answer my question. I
          understand that sending this form does not give the student a place.{" "}
          <span className="text-red-600">*</span>
        </span>
      </label>
      <div className="mt-6 space-y-4">
        <TurnstileField key={captcha.key} action="admission-enquiry" onTokenChange={captcha.setToken} />
        <FormMessage {...status} />
        <button
          type="submit"
          disabled={status.state === "submitting"}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2e3192] px-5 py-3 text-sm font-bold text-white hover:bg-[#262873] disabled:cursor-wait disabled:opacity-60 sm:w-auto"
        >
          <Send size={17} className="shrink-0" />
          {status.state === "submitting" ? "Sending…" : "Send admissions question"}
        </button>
      </div>
    </form>
  );
}
