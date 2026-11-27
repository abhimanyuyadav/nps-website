"use client";
import Image from "next/image";
import { useEffect, useState } from "react";

type Cover = { image: string; alt: string; version: string };
type Mode = "student" | "admin";
const endpoint = (mode: Mode, id: string) =>
  (mode === "student" ? "/api/student/articles/" : "/admin/articles/") + encodeURIComponent(id) + "/cover";

export function useArticleCover(mode: Mode, id?: string) {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [pending, setPending] = useState<Cover | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoaded(null);
    setError("");
    fetch(endpoint(mode, id), { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw Error();
        const cover: Cover | null = await r.json();
        if (!controller.signal.aborted) {
          setPending(cover);
          setLoaded(id);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("The proposed cover could not be loaded.");
      });
    return () => controller.abort();
  }, [mode, id, retry]);
  function choose(value: File | null) {
    setFile(null);
    setError("");
    if (
      value &&
      (!["image/jpeg", "image/png", "image/webp"].includes(value.type) || value.size > 4_000_000)
    ) {
      setError("Choose a JPG, PNG or WebP image up to 4 MB.");
      return;
    }
    setFile(value);
  }
  async function save(articleId: string) {
    if (!file && mode === "student") return;
    if (!file && mode === "admin" && loaded !== articleId)
      throw Error("Wait for the proposed cover to load, or use Retry.");
    if (!file && !pending) return;
    const data = new FormData();
    if (file) {
      if (!alt.trim()) throw Error("Describe the cover image before saving.");
      data.set("image", file);
      data.set("alt", alt.trim());
    }
    const response = await fetch(
      endpoint(mode, articleId),
      file
        ? { method: "POST", body: data }
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ version: pending!.version }),
          },
    );
    if (!response.ok)
      throw Error(
        (await response.json().catch(() => null))?.error ?? "Could not save the article cover. Please retry.",
      );
    const result = (await response.json()) as Cover | null;
    setPending(result);
    setLoaded(articleId);
    setFile(null);
    setAlt("");
    setError("");
  }
  return {
    file,
    choose,
    alt,
    setAlt,
    pending,
    preview,
    error,
    loaded,
    save,
    reload: () => setRetry((n) => n + 1),
  };
}
export function ArticleCoverField({
  cover,
  current,
  disabled = false,
}: {
  cover: ReturnType<typeof useArticleCover>;
  current?: { url: string; alt?: string };
  disabled?: boolean;
}) {
  const image =
    cover.preview || (cover.pending ? "data:image/webp;base64," + cover.pending.image : current?.url);
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-bold text-slate-800">Article cover</h3>
      {image && (
        <Image
          unoptimized
          width={640}
          height={360}
          src={image}
          alt={cover.file ? cover.alt : cover.pending?.alt || current?.alt || ""}
          className="aspect-video w-full rounded-lg object-cover"
        />
      )}
      {cover.pending && !cover.file && (
        <p className="text-xs text-slate-600">Student-proposed cover · {cover.pending.alt}</p>
      )}
      {!disabled && (
        <>
          <label className="block text-sm font-semibold">
            {image ? "Replace cover image" : "Add a cover image (optional)"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="mt-2 block w-full text-sm"
              onChange={(e) => {
                cover.choose(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>
          <p className="text-xs text-slate-600">
            JPG, PNG or WebP, up to 4 MB. A landscape photo fits both the article card and header.
          </p>
          {cover.file && (
            <label className="block text-sm font-semibold">
              Image description
              <input
                value={cover.alt}
                onChange={(e) => cover.setAlt(e.target.value)}
                maxLength={300}
                className="mt-1 block w-full rounded-lg border p-2"
              />
            </label>
          )}
        </>
      )}
      {cover.error && (
        <div role="alert" className="text-sm text-red-700">
          {cover.error}{" "}
          <button type="button" className="underline" onClick={cover.reload}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
