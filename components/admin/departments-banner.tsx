"use client";
import { useRecordPages } from "./use-record-access";

import Link from "next/link";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { departmentsDefaultImage } from "@/lib/content/departments-banner";
import { AdminFeatureGate } from "./admin-gate";
import { MediaEditorControl } from "./content-manager";
import { adminApi } from "./convex-api";
import { Feedback, inputClass, primaryButtonClass } from "./ui";
import { useMediaUpload } from "./use-media-upload";

const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];

export function DepartmentsBanner({ section = "departments" }: { section?: "departments" | "campus-life" }) {
  return (
    <AdminFeatureGate requiredRoles={["admin", "publisher"]}>
      <BannerEditor section={section} />
    </AdminFeatureGate>
  );
}

function BannerEditor({ section }: { section: "departments" | "campus-life" }) {
  const schoolLife = section === "campus-life";
  const pageName = schoolLife ? "School life" : "Departments";
  const defaultPhoto = schoolLife ? "" : departmentsDefaultImage;
  const { results, status, loadMore } = useRecordPages(
    adminApi.listContent,
    { type: "pages" },
    { initialNumItems: 50 },
  );
  const page = results.find((item) => item.slug === section);
  useEffect(() => {
    if (!page && status === "CanLoadMore") loadMore(50);
  }, [page, status, loadMore]);

  const save = useMutation(adminApi.upsertContent);
  const upload = useMediaUpload();
  const [selection, setSelection] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const currentId = String(page?.heroImageId ?? "");
  const value = selection ?? currentId;
  const fallbackUrl =
    selection === null && typeof page?.heroImageUrl === "string" ? page.heroImageUrl : defaultPhoto;

  async function selectFile(file: File) {
    setMessage(null);
    if (!imageTypes.includes(file.type) || !file.size || file.size > 20 * 1024 * 1024) {
      setMessage({ kind: "error", text: "Choose a JPG, PNG, WebP, AVIF, or GIF image up to 20 MB." });
      return;
    }
    setBusy(true);
    try {
      setSelection(await upload(file, "", section));
      setMessage({
        kind: "success",
        text: "Photo uploaded. Check the preview, then select Publish photo to show it on the website.",
      });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "We couldn’t upload the photo. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (selection === null) return;
    setBusy(true);
    setMessage(null);
    try {
      const data: Record<string, unknown> = {
        slug: section,
        title: page?.title ?? (schoolLife ? "School life" : "Academic departments"),
        body:
          page?.body ??
          (schoolLife
            ? "Explore school life at NPS Garuda."
            : "Explore the school's academic departments and their teachers."),
        status: "published",
      };
      for (const key of ["summary", "template", "seo", "featured", "order", "publishAt", "expireAt"]) {
        if (page?.[key] !== undefined) data[key] = page[key];
      }
      if (selection) data.heroImageId = selection;
      await save({ payload: { type: "pages", ...(page ? { id: page._id } : {}), data } });
      setSelection(null);
      setMessage({
        kind: "success",
        text: `Photo settings saved. It may take a minute to appear on the ${pageName} page.`,
      });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "We couldn’t publish the photo. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-black">
        {schoolLife ? "School life photo" : "Photo at the top of the Departments page"}
      </h2>
      <p className="text-sm text-slate-600">
        Upload a school-approved photo or choose one you already uploaded for the{" "}
        <Link className="font-bold text-sky-800 underline" href={`/${section}`}>
          {pageName} page
        </Link>
        .{" "}
        {schoolLife &&
          "The same photo appears at the top and beside Beyond lessons. Leave it empty to show text only."}
      </p>
      {schoolLife && page && page.status !== "published" ? (
        <p>Publish the School life page in the page editor before changing its public photo.</p>
      ) : page || status === "Exhausted" ? (
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          <label className="block text-sm font-bold">
            Upload a photo
            <input
              className={inputClass}
              type="file"
              accept={imageTypes.join(",")}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void selectFile(file);
              }}
            />
          </label>
          <MediaEditorControl
            simplePhotoLabels
            field={{
              key: "heroImageId",
              label: "Choose an uploaded photo",
              type: "media",
              mediaKind: "image",
            }}
            value={value}
            fallbackUrl={fallbackUrl}
            fallbackAlt={`Preview of the ${pageName} photo`}
            onSelect={(asset) => {
              setSelection(String(asset?.storageId ?? ""));
              setMessage(null);
            }}
          />
          <div className="flex flex-wrap items-center gap-4">
            <button className={primaryButtonClass} disabled={selection === null || busy} onClick={publish}>
              Publish photo
            </button>
            {(value || fallbackUrl !== defaultPhoto) && (
              <button
                className="text-sm font-bold text-sky-800"
                type="button"
                onClick={() => {
                  setSelection("");
                  setMessage(null);
                }}
              >
                {schoolLife ? "Remove photo" : "Use the default photo"}
              </button>
            )}
          </div>
        </fieldset>
      ) : (
        <p role="status">Loading photo settings…</p>
      )}
      {busy && <p role="status">Saving…</p>}
      {message && <Feedback kind={message.kind}>{message.text}</Feedback>}
    </section>
  );
}
