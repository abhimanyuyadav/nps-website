import Link from "next/link";
import { listOpenForms } from "@/lib/server/school-forms";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "School forms",
  description: "Complete forms published by Nepal Police School, Garuda.",
  alternates: { canonical: "/forms" },
};
export default async function Page() {
  const forms = await listOpenForms().catch(() => null);
  return (
    <section className="mx-auto min-h-[55vh] max-w-4xl px-5 py-14">
      <h1 className="text-4xl font-extrabold text-indigo-950">School forms</h1>
      {forms?.length ? (
        <ul className="mt-6 divide-y rounded-xl border border-slate-200 bg-white px-6">
          {forms.map((f) => (
            <li key={f.id} className="py-5">
              <Link className="text-xl font-bold text-indigo-800 underline" href={"/forms/" + f.id}>
                {f.title}
              </Link>
              {f.description && <p className="mt-2 text-slate-700">{f.description}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5">
          {forms
            ? "There are no open school forms right now."
            : "Forms could not be loaded. Please try again shortly."}
        </p>
      )}
    </section>
  );
}
