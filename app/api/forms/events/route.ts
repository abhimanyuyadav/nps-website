import { readBoundedJson } from "@/lib/server/request-body";
import { fetchAction, fetchQuery } from "convex/nextjs";
import { makeFunctionReference } from "convex/server";
import { NextRequest } from "next/server";
import { z } from "zod";
import {
  formJson,
  looksLikeBot,
  preparePublicFormRequest,
  signPublicFormPayload,
  verifyTurnstile,
} from "@/lib/server/public-forms";

const schema = z.object({
  eventId: z.string().min(1).max(80).optional(),
  eventSlug: z.string().trim().min(1).max(160).optional(),
  eventTitle: z.string().trim().max(200).optional(),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  attendees: z.coerce.number().int().min(1).max(10).optional(),
  attendeeCount: z.coerce.number().int().min(1).max(10).optional(),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  consent: z.literal(true),
  website: z.string().max(200).optional(),
  honeypot: z.string().max(200).optional(),
  idempotencyKey: z.string().uuid().optional(),
  submissionId: z.string().uuid().optional(),
  captchaToken: z.string().max(2048).optional(),
});

const registerEvent = makeFunctionReference<
  "action",
  {
    signature: string;
    requestTimestamp: number;
    fingerprint: string;
    networkKey?: string;
    honeypot?: string;
    idempotencyKey: string;
    eventId: string;
    eventSlug?: string;
    name: string;
    email: string;
    phone?: string;
    attendees: number;
    notes?: string;
    consent: boolean;
  },
  { ok: boolean; registrationNumber: string; status: string }
>("formActions:registerEvent");

const getEvent = makeFunctionReference<"query", { slug: string }, { _id?: string } | null>(
  "content:getEvent",
);

const acknowledgement = { ok: true, message: "The school received your request to attend. Check your email for registration details." };

export async function POST(request: NextRequest) {
  const session = preparePublicFormRequest(request);
  if (!session)
    return formJson(
      session,
      { error: "Online event sign-up is unavailable right now. Please contact the school." },
      { status: 503 },
    );
  const parsed = schema.safeParse(await readBoundedJson(request));
  if (!parsed.success)
    return formJson(session, { error: "Please check the registration form." }, { status: 400 });
  const honeypot = parsed.data.website || parsed.data.honeypot;
  if (looksLikeBot(honeypot)) return formJson(session, acknowledgement, { status: 201 });
  if (!(await verifyTurnstile(parsed.data.captchaToken, request, "event-registration"))) {
    return formJson(session, { error: "Please complete the security check and try again." }, { status: 400 });
  }

  try {
    const eventId =
      parsed.data.eventId ??
      (parsed.data.eventSlug
        ? (
            await fetchQuery(
              getEvent,
              { slug: parsed.data.eventSlug },
              { url: process.env.NEXT_PUBLIC_CONVEX_URL },
            )
          )?._id
        : undefined);
    if (!eventId) {
      return formJson(
        session,
        { error: "Sign-up is closed or unavailable for this event." },
        { status: 404 },
      );
    }
    const args = {
      fingerprint: session.fingerprint,
      networkKey: session.networkKey,
      idempotencyKey: parsed.data.idempotencyKey ?? parsed.data.submissionId ?? crypto.randomUUID(),
      eventId,
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      phone: parsed.data.phone || undefined,
      attendees: parsed.data.attendees ?? parsed.data.attendeeCount ?? 1,
      notes: parsed.data.notes || undefined,
      consent: true,
    };
    const signed = signPublicFormPayload(session.formServiceSecret, {
      form: "event",
      fingerprint: args.fingerprint,
      networkKey: args.networkKey,
      honeypot: null,
      idempotencyKey: args.idempotencyKey,
      eventId: args.eventId,
      name: args.name,
      email: args.email,
      phone: args.phone ?? null,
      attendees: args.attendees,
      notes: args.notes ?? null,
      consent: args.consent,
    });
    await fetchAction(
      registerEvent,
      {
        ...args,
        ...signed,
        ...(process.env.NEXT_PUBLIC_WORKFLOW_CONVEX_URL && parsed.data.eventSlug
          ? { eventSlug: parsed.data.eventSlug }
          : {}),
      },
      { url: session.convexUrl },
    );
    return formJson(session, acknowledgement, { status: 201 });
  } catch (error) {
    const rateLimited = error instanceof Error && /rate|too many/i.test(error.message);
    return formJson(
      session,
      {
        error: rateLimited
          ? "Please wait before trying again."
          : "Your request could not be sent. Please try again.",
      },
      { status: rateLimited ? 429 : 502 },
    );
  }
}
