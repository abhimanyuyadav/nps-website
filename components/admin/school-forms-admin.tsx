"use client";
import { useRecordPages } from "./use-record-access";
import { makeFunctionReference, type PaginationOptions, type PaginationResult } from "convex/server";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { SchoolField } from "@/convex/lib/schoolFormFields";
import { AdminFeatureGate } from "./admin-gate";
import { PageHeading } from "./page-heading";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "./ui";

const panel = "space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7";
const blank = (): SchoolField => ({ label: "", kind: "text", required: true, options: [] });
function message(e: unknown) {
  return e instanceof ConvexError && typeof e.data?.message === "string"
    ? e.data.message
    : "Could not save. Check your connection and try again.";
}
function Editor({ form, done }: { form?: Doc<"schoolForms">; done: (id: Id<"schoolForms">) => void }) {
  const save = useMutation(api.schoolForms.saveDraft);
  const [fields, setFields] = useState<SchoolField[]>(form?.fields ?? [blank()]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const edit = (i: number, patch: Partial<SchoolField>) =>
    setFields((list) => list.map((f, j) => (i === j ? { ...f, ...patch } : f)));
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      done(
        await save({
          id: form?._id,
          revision: form?.revision,
          title: String(data.get("title")),
          description: String(data.get("description")),
          fields,
        }),
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={panel} onSubmit={submit}>
      <h2 className="text-xl font-bold">{form ? "Edit draft" : "Create a form"}</h2>
      <label className="block font-semibold">
        Form title
        <input name="title" defaultValue={form?.title} className={inputClass} maxLength={120} required />
      </label>
      <label className="block font-semibold">
        Instructions
        <textarea
          name="description"
          defaultValue={form?.description}
          className={inputClass}
          maxLength={1500}
          rows={2}
        />
      </label>
      {fields.map((f, i) => (
        <fieldset key={i} className="space-y-3 rounded-xl border p-4">
          <legend className="px-2 font-bold">Question {i + 1}</legend>
          <label className="block">
            Question text
            <input
              required
              className={inputClass}
              value={f.label}
              maxLength={150}
              onChange={(e) => edit(i, { label: e.target.value })}
            />
          </label>
          <label className="block">
            Answer type
            <select
              className={inputClass}
              value={f.kind}
              onChange={(e) => edit(i, { kind: e.target.value as SchoolField["kind"] })}
            >
              <option value="text">Short answer</option>
              <option value="paragraph">Long answer</option>
              <option value="choice">Multiple choice (one answer)</option>
              <option value="date">Date</option>
            </select>
          </label>
          {f.kind === "choice" && (
            <label className="block">
              Choices, one per line
              <textarea
                required
                className={inputClass}
                rows={3}
                value={f.options.join("\n")}
                onChange={(e) => edit(i, { options: e.target.value.split("\n") })}
              />
            </label>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label>
              <input
                type="checkbox"
                checked={f.required}
                onChange={(e) => edit(i, { required: e.target.checked })}
              />{" "}
              This question must be answered
            </label>
            {fields.length > 1 && (
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => setFields(fields.filter((_, j) => j !== i))}
              >
                Remove question
              </button>
            )}
          </div>
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={fields.length >= 20}
          onClick={() => setFields([...fields, blank()])}
        >
          Add question
        </button>
        <button className={primaryButtonClass} disabled={busy}>
          Save draft
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

const formResponseList = makeFunctionReference<"query", { id: Id<"schoolForms">; paginationOpts: PaginationOptions }, PaginationResult<Doc<"schoolResponses">>>("schoolForms:responses");
function Responses({ form }: { form: Doc<"schoolForms"> }) {
  const { results, status, loadMore } = useRecordPages(
    formResponseList,
    { id: form._id },
    { initialNumItems: 20 },
  );
  return (
    <section className={panel}>
      <h3 className="text-lg font-bold">Responses</h3>
      {results.map((r) => (
        <details key={r._id} className="rounded-lg border p-3">
          <summary className="cursor-pointer font-semibold">
            {r.reference} · {r.email}
          </summary>
          <p className="mt-2 text-sm">{new Date(r._creationTime).toLocaleString()}</p>
          <dl>
            {r.answers.map((a, i) => (
              <div className="my-3" key={i}>
                <dt className="font-bold">{form.fields[i]?.label}</dt>
                <dd className="break-words whitespace-pre-wrap">{a || "No answer"}</dd>
              </div>
            ))}
          </dl>
        </details>
      ))}
      {!results.length && (
        <p>{status === "LoadingFirstPage" ? "Loading responses..." : "No responses yet."}</p>
      )}
      {status === "CanLoadMore" && (
        <button className={secondaryButtonClass} onClick={() => loadMore(20)}>
          Load more responses
        </button>
      )}
    </section>
  );
}

function MailSettings() {
  const data = useQuery(api.schoolForms.mailSettings, {}),
    save = useMutation(api.schoolForms.saveMail);
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      values = new FormData(form);
    setBusy(true);
    setStatus("");
    try {
      const key = String(values.get("key") || "").trim();
      let sealedKey: string | undefined;
      if (key) {
        const result = await fetch("/admin/forms/mail-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key }),
        });
        if (!result.ok)
          throw new Error(
            "The email key could not be saved securely. Check the key and make sure you are signed in.",
          );
        sealedKey = (await result.json()).sealedKey;
      }
      await save({ sender: String(values.get("sender")), staff: String(values.get("staff")), sealedKey });
      const input = form.elements.namedItem("key") as HTMLInputElement;
      input.value = "";
      setStatus("Email settings saved.");
    } catch (e) {
      setStatus(e instanceof Error && !(e instanceof ConvexError) ? e.message : message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className={panel}>
      <summary className="cursor-pointer text-lg font-bold">School email settings</summary>
      {data && (
        <form onSubmit={submit} className="space-y-4">
          <p>
            {data.hasKey
              ? "An email key is saved. Check Background jobs to see whether emails were sent."
              : "To start sending email, save the approved sender address, the staff email address, and the Resend key."}
          </p>
          <label className="block">
            Sender email address (on the domain verified in Resend)
            <input type="email" name="sender" required className={inputClass} defaultValue={data.sender} />
          </label>
          <label className="block">
            Staff email address for alerts
            <input type="email" name="staff" required className={inputClass} defaultValue={data.staff} />
          </label>
          <label className="block">
            {data.hasKey
              ? "New Resend key (leave blank to keep the current key)"
              : "Resend sending key (can be added later)"}
            <input type="password" autoComplete="new-password" name="key" className={inputClass} />
          </label>
          <button disabled={busy} className={primaryButtonClass}>
            Save email settings
          </button>
          <p role="status">{status}</p>
        </form>
      )}
    </details>
  );
}

function Workspace() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.schoolForms.staffList,
    {},
    { initialNumItems: 30 },
  );
  const change = useMutation(api.schoolForms.setStatus);
  const [selection, select] = useState<string>(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const current = results.find((f) => f._id === selection);
  async function update(f: Doc<"schoolForms">) {
    setBusy(true);
    setNotice("");
    try {
      await change({ id: f._id, revision: f.revision, status: f.status === "open" ? "closed" : "open" });
      setNotice(f.status === "open" ? "Form closed." : "Form published.");
    } catch (e) {
      setNotice(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <PageHeading
        eyebrow="School office"
        title="School forms"
        description="Publish forms for families and review their responses."
      />
      <MailSettings />
      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Your forms</h2>
          <button
            className={primaryButtonClass}
            onClick={() => {
              select("new");
              setNotice("");
            }}
          >
            Create form
          </button>
        </div>
        {!results.length && <p>{status === "LoadingFirstPage" ? "Loading forms..." : "No forms yet."}</p>}
        {results.map((f) => (
          <button
            key={f._id}
            className="flex w-full items-center justify-between gap-3 border-t py-3 text-left"
            onClick={() => {
              select(f._id);
              setNotice("");
            }}
          >
            <strong>{f.title}</strong>
            <span className="capitalize">{f.status}</span>
          </button>
        ))}
        {status === "CanLoadMore" && (
          <button onClick={() => loadMore(30)} className={secondaryButtonClass}>
            Load more forms
          </button>
        )}
      </section>
      {(selection === "new" || current?.status === "draft") && (
        <Editor
          key={current?._id ?? "new"}
          form={current}
          done={(id) => {
            select(id);
            setNotice("Draft saved. Publish it when it is ready for families.");
          }}
        />
      )}
      {current && (
        <section className={panel}>
          <h2 className="text-xl font-bold">{current.title}</h2>
          <p>
            {current.status === "draft"
              ? "Publish this form so families can find it on the forms page and the homepage."
              : current.status === "open"
                ? "This form is accepting responses."
                : "This form is closed. Staff can still read its responses."}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <button className={primaryButtonClass} disabled={busy} onClick={() => update(current)}>
              {current.status === "draft"
                ? "Publish form"
                : current.status === "open"
                  ? "Close form"
                  : "Reopen form"}
            </button>
            {current.status === "open" && (
              <Link href={"/forms/" + current._id} className="underline">
                View public form
              </Link>
            )}
          </div>
        </section>
      )}
      {notice && <p role="status">{notice}</p>}
      {current && current.status !== "draft" && <Responses form={current} />}
    </div>
  );
}
export function SchoolFormsAdmin() {
  return (
    <AdminFeatureGate requiredRoles={["admin"]}>
      <Workspace />
    </AdminFeatureGate>
  );
}
