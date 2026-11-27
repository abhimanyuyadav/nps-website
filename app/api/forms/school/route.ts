import { NextRequest } from "next/server";
import { fetchAction } from "convex/nextjs";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import {
  formJson,
  looksLikeBot,
  preparePublicFormRequest,
  signPublicFormPayload,
  verifyTurnstile,
} from "@/lib/server/public-forms";
const schema = z.object({
  id: z.string().min(1).max(80),
  revision: z.number().int().positive(),
  submissionId: z.string().uuid(),
  email: z.string().trim().email().max(254),
  answers: z.array(z.string().max(3000)).max(20),
  consent: z.literal(true),
  website: z.string().max(200).optional(),
  captchaToken: z.string().max(2048).optional(),
});
export async function POST(request: NextRequest) {
  const session = preparePublicFormRequest(request);
  if (!session)
    return formJson(null, { error: "School forms are temporarily unavailable." }, { status: 503 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return formJson(
      session,
      { error: "Check your answers and email address, then tick the agreement box." },
      { status: 400 },
    );
  const { id, revision, submissionId, email, answers, website, captchaToken } = parsed.data;
  if (looksLikeBot(website)) return formJson(session, { message: "Submission received." }, { status: 201 });
  if (!(await verifyTurnstile(captchaToken, request, "school-form")))
    return formJson(session, { error: "Please complete the security check." }, { status: 400 });
  const input = { id, revision, submissionId, fingerprint: session.fingerprint, email, answers };
  const signed = signPublicFormPayload(session.formServiceSecret, { form: "school-form", ...input });
  try {
    const reference = await fetchAction(
      api.formActions.submitSchoolForm,
      { ...input, ...signed },
      { url: session.convexUrl },
    );
    return formJson(
      session,
      { reference, message: "The school received your answers. Your reference number is " + reference + "." },
      { status: 201 },
    );
  } catch (error) {
    const details =
      error && typeof error === "object" && "data" in error
        ? (error.data as { code?: string; message?: string })
        : null;
    if (details?.code === "FORM_INVALID" || details?.code === "INVALID_EMAIL")
      return formJson(session, { error: details.message }, { status: 400 });
    if (details?.code === "RATE_LIMITED")
      return formJson(session, { error: "Please wait before submitting again." }, { status: 429 });
    return formJson(
      session,
      { error: "Your response could not be saved. Please try again." },
      { status: 502 },
    );
  }
}
