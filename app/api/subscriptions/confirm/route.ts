import { fetchMutation } from "convex/nextjs";
import { makeFunctionReference } from "convex/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const confirmNewsletter = makeFunctionReference<"mutation", { token: string }, { ok: boolean }>(
  "forms:confirmNewsletter",
);
const schema = z.object({ token: z.string().min(20).max(200) });

export async function POST(request: Request) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl)
    return NextResponse.json({ error: "Email sign-up is unavailable right now." }, { status: 503 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "This confirmation link is invalid." }, { status: 400 });
  try {
    const result = await fetchMutation(confirmNewsletter, parsed.data, {
      url: parsed.data.token.startsWith("nps2_")
        ? process.env.NEXT_PUBLIC_WORKFLOW_CONVEX_URL || convexUrl
        : process.env.NEXT_PUBLIC_ARCHIVE_CONVEX_URL || convexUrl,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      {
        error:
          "This link doesnâ€™t work or has expired. Check that you opened the full link from the schoolâ€™s email.",
      },
      { status: 400 },
    );
  }
}
