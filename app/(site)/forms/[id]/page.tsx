import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { notFound } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { schoolFormsUrl } from "@/lib/server/school-forms";
import { SchoolResponseForm } from "@/components/forms/school-response-form";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form =
    schoolFormsUrl && (await fetchQuery(api.schoolForms.publicForm, { id }, { url: schoolFormsUrl }));
  if (!form) notFound();
  return (
    <section className="mx-auto max-w-3xl px-5 py-12">
      <Link href="/forms" className="text-sm font-bold text-indigo-800 underline">
        All school forms
      </Link>
      <h1 className="mt-5 text-3xl font-extrabold text-indigo-950">{form.title}</h1>
      <p className="mt-3 whitespace-pre-line text-slate-700">{form.description}</p>
      <SchoolResponseForm form={form} />
    </section>
  );
}
