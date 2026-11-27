import Link from "next/link";
import { listOpenForms } from "@/lib/server/school-forms";
export async function OpenSchoolForms() {
  const forms = await listOpenForms().catch(() => []);
  if (!forms.length) return null;
  const first = forms[0];
  return (
    <aside aria-label="Open school forms" className="border-b border-indigo-100 bg-indigo-50">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4">
        <span className="font-bold text-indigo-950">Open school forms</span>
        <Link href={"/forms/" + first.id} className="underline">
          {first.title}
        </Link>
        <Link href="/forms" className="ml-auto text-sm font-bold text-indigo-800">
          View all forms
        </Link>
      </div>
    </aside>
  );
}
