import type { Metadata } from "next";
import Link from "next/link";
import { Clock3, ShieldCheck } from "lucide-react";
import { AdmissionsForm } from "@/components/forms/admissions-form";
import { FormUnavailable } from "@/components/forms/form-unavailable";
import { hasPublicFormConfiguration } from "@/lib/server/form-configuration";
import { PageHero } from "@/components/site/page-hero";
import { getSiteProfile } from "@/lib/data/public";

export const metadata: Metadata = {
  title: "Admission enquiry",
  description: "Send a secure preliminary admission enquiry to Nepal Police School, Garuda.",
  alternates: { canonical: "/admissions/apply" },
};

export default async function ApplyPage() {
  const site = await getSiteProfile();
  return (
    <>
      <PageHero
        eyebrow="Admissions"
        title="Ask about admissions"
        description="Tell us about the student and what you want to know. The school can then answer your question."
        image="/media/nps-hero-gate.png"
        crumbs={[{ label: "Admissions", href: "/admissions" }, { label: "Admission enquiry" }]}
      />
      <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[.65fr_1.35fr]">
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <ShieldCheck size={28} className="text-[#2e3192]" />
            <h2 className="mt-5 text-2xl font-extrabold text-[#1e1f5c]">Before you submit</h2>
            <ul className="mt-5 space-y-4 text-sm leading-6 text-slate-600">
              <li>Check the latest admissions notice for dates and what you need to apply.</li>
              <li>Check the student’s details and the parent or guardian’s contact information.</li>
              <li>Do not include identity documents, passwords, card details, or one-time codes.</li>
              <li>Sending this form asks the school for information. It does not reserve a place.</li>
            </ul>
            <p className="mt-6 rounded-xl bg-sky-50 p-4 text-xs leading-5 text-[#262873]">
              The school uses your details to answer your question and handles them as described in the
              website privacy notice.
            </p>
          </aside>
          {site.admissionsOpen ? (
            hasPublicFormConfiguration() ? (
              <AdmissionsForm academicYear={site.academicYear} />
            ) : (
              <FormUnavailable
                title="Contact the school about admissions"
                description="The online form is unavailable right now. Contact the school office to ask when and how to apply."
                phone={site.phone}
                email={site.email}
              />
            )
          ) : (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-7 text-amber-950 sm:p-10">
              <Clock3 size={28} />
              <h2 className="mt-5 text-2xl font-extrabold">
                Online admission enquiries are currently closed
              </h2>
              <p className="mt-3 text-sm leading-7">
                Check the latest admissions notice for dates and requirements. This form will open when the
                school starts taking questions.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/notices"
                  className="rounded-xl bg-amber-900 px-4 py-2.5 text-sm font-bold text-white"
                >
                  View notices
                </Link>
                <Link
                  href="/contact"
                  className="rounded-xl border border-amber-300 px-4 py-2.5 text-sm font-bold"
                >
                  Contact the school
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
