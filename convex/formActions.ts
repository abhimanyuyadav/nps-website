"use node";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { schoolContentClient } from "./lib/schoolContent";
import { api, internal } from "./_generated/api";
import { isConfiguredSecret } from "./lib/secrets";
import { guardianValidator, publicRequestFields, studentValidator } from "./lib/validators";

const SIGNATURE_TTL_MS = 120_000;

type ContactSubmissionResult = { ok: boolean; ticketNumber: string };
type AdmissionSubmissionResult = { ok: boolean; applicationNumber: string };
type NewsletterSubscriptionResult = { ok: boolean; status: "pending" | "active" };
type EventRegistrationResult = {
  ok: boolean;
  registrationNumber: string;
  status: "registered" | "waitlisted";
};

function authorize(signature: string, requestTimestamp: number, canonical: string): void {
  const secret = process.env.FORM_SERVICE_SECRET;
  if (!isConfiguredSecret(secret)) {
    throw new ConvexError({
      code: "SERVICE_UNAVAILABLE",
      message: "Form submissions are temporarily unavailable.",
    });
  }
  if (!Number.isSafeInteger(requestTimestamp) || Math.abs(Date.now() - requestTimestamp) > SIGNATURE_TTL_MS) {
    throw new ConvexError({ code: "REQUEST_EXPIRED", message: "This form request has expired." });
  }
  const supplied = signature.trim();
  if (!/^[a-f0-9]{64}$/.test(supplied)) {
    throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid form request." });
  }
  const expected = createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
  const valid = timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"));
  if (!valid) {
    throw new ConvexError({ code: "UNAUTHORIZED", message: "Invalid form request." });
  }
}

export const authorizeVoice = action({
  args: { requestTimestamp: v.number(), networkKey: v.string(), signature: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { requestTimestamp, networkKey, signature }): Promise<boolean> => {
    authorize(signature, requestTimestamp, JSON.stringify({ requestTimestamp, form: "voice-quota", networkKey }));
    return ctx.runMutation(internal.forms.reserveVoiceCapacity, { networkKey });
  },
});

export const articleCover = action({
  args: {
    signature: v.string(),
    requestTimestamp: v.number(),
    articleId: v.string(),
    op: v.union(v.literal("read"), v.literal("readPrimary"), v.literal("writeLocal"), v.literal("clear"), v.literal("clearLocal"), v.literal("clearOwn")),
    version: v.string(),
    image: v.string(),
    alt: v.string(),
  },
  handler: async (ctx, args): Promise<{ image: string; alt: string; version: string } | "legacy" | null> => {
    const { articleId, op, version, image, alt } = args;
    authorize(
      args.signature,
      args.requestTimestamp,
      JSON.stringify({
        requestTimestamp: args.requestTimestamp,
        form: "article-cover",
        articleId,
        op,
        version,
        image,
        alt,
      }),
    );
    if (op === "read" || op === "readPrimary")
      return ctx.runQuery(internal.articleCoverDrafts.read, { articleId, checkPrimary: op === "readPrimary" });
    if (op === "writeLocal")
      await ctx.runMutation(internal.articleCoverDrafts.write, { articleId, version, image, alt });
    else
      await ctx.runMutation(internal.articleCoverDrafts.clear, {
        articleId, version, primary: op !== "clear", authorOnly: op === "clearOwn",
      });
    return null;
  },
});

export const submitSchoolForm = action({
  args: {
    signature: v.string(),
    requestTimestamp: v.number(),
    id: v.string(),
    revision: v.number(),
    submissionId: v.string(),
    networkKey: v.optional(v.string()),
    consentVersion: v.optional(v.literal("share-answers-v1")),
    fingerprint: v.string(),
    email: v.string(),
    answers: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    const { id, revision, submissionId, fingerprint, email, answers } = args;
    const input = { id, revision, submissionId, fingerprint, email, answers, networkKey: args.networkKey, consentVersion: args.consentVersion };
    authorize(
      args.signature,
      args.requestTimestamp,
      JSON.stringify({ requestTimestamp: args.requestTimestamp, form: "school-form", ...input }),
    );
    return ctx.runMutation(internal.schoolForms.record, input);
  },
});

export const submitContact = action({
  args: {
    signature: v.string(),
    requestTimestamp: v.number(),
    ...publicRequestFields,
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    subject: v.string(),
    message: v.string(),
    consentToContact: v.boolean(),
    source: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean(), ticketNumber: v.string() }),
  handler: async (ctx, args): Promise<ContactSubmissionResult> => {
    const canonical = JSON.stringify({
      requestTimestamp: args.requestTimestamp,
      form: "contact",
      fingerprint: args.fingerprint,
      networkKey: args.networkKey,
      honeypot: args.honeypot ?? null,
      idempotencyKey: args.idempotencyKey,
      name: args.name,
      email: args.email,
      phone: args.phone ?? null,
      subject: args.subject,
      message: args.message,
      consentToContact: args.consentToContact,
      source: args.source ?? null,
    });
    authorize(args.signature, args.requestTimestamp, canonical);
    const { signature: _signature, requestTimestamp: _requestTimestamp, ...input } = args;
    const result: ContactSubmissionResult = await ctx.runMutation(internal.forms.submitContact, input);
    return result;
  },
});

export const submitAdmission = action({
  args: {
    signature: v.string(),
    requestTimestamp: v.number(),
    ...publicRequestFields,
    academicYear: v.string(),
    desiredGrade: v.string(),
    student: studentValidator,
    guardian: guardianValidator,
    priorSchool: v.optional(v.string()),
    notes: v.optional(v.string()),
    consent: v.boolean(),
  },
  returns: v.object({ ok: v.boolean(), applicationNumber: v.string() }),
  handler: async (ctx, args): Promise<AdmissionSubmissionResult> => {
    const canonical = JSON.stringify({
      requestTimestamp: args.requestTimestamp,
      form: "admission",
      fingerprint: args.fingerprint,
      networkKey: args.networkKey,
      honeypot: args.honeypot ?? null,
      idempotencyKey: args.idempotencyKey,
      academicYear: args.academicYear,
      desiredGrade: args.desiredGrade,
      student: {
        firstName: args.student.firstName,
        middleName: args.student.middleName ?? null,
        lastName: args.student.lastName,
        dateOfBirth: args.student.dateOfBirth,
        gender: args.student.gender ?? null,
        citizenship: args.student.citizenship ?? null,
      },
      guardian: {
        name: args.guardian.name,
        relationship: args.guardian.relationship,
        email: args.guardian.email,
        phone: args.guardian.phone,
        address: args.guardian.address,
      },
      priorSchool: args.priorSchool ?? null,
      notes: args.notes ?? null,
      consent: args.consent,
    });
    authorize(args.signature, args.requestTimestamp, canonical);
    const { signature: _signature, requestTimestamp: _requestTimestamp, ...input } = args;
    const client = schoolContentClient();
    if (client) {
      const settings = await client.query(api.content.getSiteSettings, {});
      if (!settings?.admissionsOpen)
        throw new ConvexError({ code: "ADMISSIONS_CLOSED", message: "Admissions are currently closed." });
      input.academicYear = settings.academicYear;
    }
    const result: AdmissionSubmissionResult = await ctx.runMutation(internal.forms.submitAdmission, input);
    return result;
  },
});

export const subscribeNewsletter = action({
  args: {
    signature: v.string(),
    requestTimestamp: v.number(),
    ...publicRequestFields,
    email: v.string(),
    name: v.optional(v.string()),
    source: v.optional(v.string()),
    consent: v.boolean(),
  },
  returns: v.object({
    ok: v.boolean(),
    status: v.union(v.literal("pending"), v.literal("active")),
  }),
  handler: async (ctx, args): Promise<NewsletterSubscriptionResult> => {
    const canonical = JSON.stringify({
      requestTimestamp: args.requestTimestamp,
      form: "newsletter",
      fingerprint: args.fingerprint,
      networkKey: args.networkKey,
      honeypot: args.honeypot ?? null,
      idempotencyKey: args.idempotencyKey,
      email: args.email,
      name: args.name ?? null,
      source: args.source ?? null,
      consent: args.consent,
    });
    authorize(args.signature, args.requestTimestamp, canonical);
    const { signature: _signature, requestTimestamp: _requestTimestamp, ...input } = args;
    const result: NewsletterSubscriptionResult = await ctx.runMutation(internal.forms.subscribeNewsletter, {
      ...input,
      confirmationToken:
        (process.env.SCHOOL_CONTENT_URL ? "nps2_" : "") + randomBytes(32).toString("base64url"),
      unsubscribeToken:
        (process.env.SCHOOL_CONTENT_URL ? "nps2_" : "") + randomBytes(32).toString("base64url"),
    });
    return result;
  },
});

export const registerEvent = action({
  args: {
    signature: v.string(),
    requestTimestamp: v.number(),
    ...publicRequestFields,
    eventId: v.string(),
    eventSlug: v.optional(v.string()),
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    attendees: v.number(),
    notes: v.optional(v.string()),
    consent: v.boolean(),
  },
  returns: v.object({
    ok: v.boolean(),
    registrationNumber: v.string(),
    status: v.union(v.literal("registered"), v.literal("waitlisted")),
  }),
  handler: async (ctx, args): Promise<EventRegistrationResult> => {
    const canonical = JSON.stringify({
      requestTimestamp: args.requestTimestamp,
      form: "event",
      fingerprint: args.fingerprint,
      networkKey: args.networkKey,
      honeypot: args.honeypot ?? null,
      idempotencyKey: args.idempotencyKey,
      eventId: args.eventId,
      name: args.name,
      email: args.email,
      phone: args.phone ?? null,
      attendees: args.attendees,
      notes: args.notes ?? null,
      consent: args.consent,
    });
    authorize(args.signature, args.requestTimestamp, canonical);
    const { signature: _signature, requestTimestamp: _requestTimestamp, ...input } = args;
    const client = schoolContentClient();
    let eventId = input.eventId as Id<"events">;
    if (client) {
      let event = args.eventSlug
        ? await client.query(api.content.getEvent, { slug: args.eventSlug })
        : (
            await client.query(api.content.listEvents, { now: Date.now(), scope: "upcoming", limit: 200 })
          ).find((row) => row._id === args.eventId);
      if (event && event._id === args.eventId && event.capacity !== undefined && event.registeredAttendeeCount === undefined) {
        event = await client.query(api.content.getEvent, { slug: event.slug, resolveCapacity: true });
      }
      if (!event || event._id !== args.eventId || !event.registrationEnabled || event.endAt <= Date.now())
        throw new ConvexError({ code: "EVENT_CLOSED", message: "Event registration is closed." });
      eventId = await ctx.runMutation(internal.workflowEvents.refresh, {
        slug: event.slug,
        title: event.title,
        description: event.description,
        startAt: event.startAt,
        endAt: event.endAt,
        timezone: event.timezone,
        isOnline: event.isOnline,
        venue: event.venue,
        capacity: event.capacity,
        previousAttendees: event.registeredAttendeeCount,
        registrationEnabled: event.registrationEnabled,
      });
    }
    const { eventSlug: _slug, ...registration } = input;
    const result: EventRegistrationResult = await ctx.runMutation(internal.forms.registerEvent, {
      ...registration,
      eventId,
      cancellationToken:
        (process.env.SCHOOL_CONTENT_URL ? "nps2_" : "") + randomBytes(32).toString("base64url"),
    });
    return result;
  },
});
