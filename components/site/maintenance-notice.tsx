import type { SiteProfile } from "@/lib/data/public";

export function MaintenanceNotice({ site }: { site: SiteProfile }) {
  return (
    <main
      id="main-content"
      className="grid min-h-screen min-w-0 place-items-center bg-[#12123a] px-4 py-12 [overflow-wrap:anywhere] text-white sm:px-5 sm:py-16"
    >
      <section className="w-full max-w-2xl rounded-3xl border border-white/15 bg-white/5 p-6 text-center shadow-2xl backdrop-blur sm:p-12">
        <p className="text-xs font-extrabold tracking-[.2em] text-sky-300 uppercase">Scheduled maintenance</p>
        <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">
          The school website will be back shortly.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-slate-200">
          {site.schoolName} is completing a website update. Please use the verified contact details below for
          time-sensitive school matters.
        </p>
        <div className="mt-8 space-y-2 text-sm text-slate-200">
          <p>{site.location}</p>
          {site.phone && (
            <p>
              <a className="font-bold text-white underline" href={`tel:${site.phone.replace(/\s/g, "")}`}>
                {site.phone}
              </a>
            </p>
          )}
          {site.email && (
            <p>
              <a className="font-bold text-white underline" href={`mailto:${site.email}`}>
                {site.email}
              </a>
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
