"use client";
import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { articleAdminApi, type AdminStudentArticle } from "./convex-api";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "./ui";

export function ArticleTextEditor({
  article,
  onClose,
  onSaved,
}: {
  article: AdminStudentArticle;
  onClose: () => void;
  onSaved: () => void;
}) {
  const edit = useMutation(articleAdminApi.editContent);
  const [original] = useState(article);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    setBusy(true);
    setError("");
    try {
      await edit({
        id: original._id,
        expectedUpdatedAt: original.updatedAt,
        content: {
          title: value("title"),
          excerpt: value("excerpt"),
          body: value("body"),
          category: value("category"),
          tags: value("tags")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The article could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="space-y-4">
      <fieldset disabled={busy} className="space-y-4">
        <legend className="font-bold">Edit article</legend>
        <label className="block">
          Title
          <input
            className={inputClass}
            name="title"
            defaultValue={original.title}
            minLength={5}
            maxLength={160}
            required
          />
        </label>
        <label className="block">
          Summary
          <textarea
            className={inputClass}
            name="excerpt"
            defaultValue={original.excerpt}
            minLength={30}
            maxLength={500}
            required
          />
        </label>
        <label className="block">
          Article text
          <textarea
            className={inputClass}
            name="body"
            rows={12}
            defaultValue={original.body}
            minLength={100}
            maxLength={20000}
            required
          />
        </label>
        <label className="block">
          Category
          <input
            className={inputClass}
            name="category"
            defaultValue={original.category}
            minLength={2}
            maxLength={80}
            required
          />
        </label>
        <label className="block">
          Tags (put a comma between each tag)
          <input className={inputClass} name="tags" defaultValue={original.tags.join(", ")} />
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" className={primaryButtonClass}>
            {busy ? "Saving…" : "Save article"}
          </button>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Cancel editing
          </button>
        </div>
      </fieldset>
    </form>
  );
}
