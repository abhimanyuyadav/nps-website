import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fetchAction } from "convex/nextjs";
import { POST as register } from "@/app/api/forms/events/route";
import { POST as subscribe } from "@/app/api/forms/newsletter/route";

vi.mock("convex/nextjs", () => ({ fetchAction: vi.fn(), fetchQuery: vi.fn() }));
vi.mock("@/lib/server/public-forms", () => ({
  formJson: (_: unknown, data: unknown, init: ResponseInit) => Response.json(data, init),
  looksLikeBot: (value?: string) => Boolean(value),
  preparePublicFormRequest: () => ({ fingerprint: "test", convexUrl: "https://school.example.test" }),
  signPublicFormPayload: () => ({}),
  verifyTurnstile: async () => true,
}));
afterEach(() => vi.resetAllMocks());

it.each([
  {
    path: "events",
    handler: register,
    data: { eventId: "fixture", name: "Test Student" },
    outcomes: [
      { ok: true, registrationNumber: "first-private-reference", status: "registered" },
      { ok: true, registrationNumber: "another-private-reference", status: "waitlisted" },
    ],
  },
  {
    path: "newsletter",
    handler: subscribe,
    data: {},
    outcomes: [
      { ok: true, status: "active" },
      { ok: true, status: "pending" },
    ],
  },
])(
  "returns a single public confirmation for $path without disclosing a previous record",
  async ({ path, handler, data, outcomes }) => {
    const replies = [];
    for (const [index, outcome] of [...outcomes, outcomes[0]].entries()) {
      vi.mocked(fetchAction).mockResolvedValue(outcome);
      const request = new NextRequest("https://school.example.test/api/forms/" + path, {
        method: "POST",
        body: JSON.stringify({
          ...data,
          email: "fixture@example.test",
          consent: true,
          website: index === 2 ? "trap" : "",
        }),
      });
      const response = await handler(request);
      expect(response.status).toBe(201);
      replies.push(await response.json());
    }
    expect(replies[0]).toEqual({ ok: true, message: expect.any(String) });
    expect(replies[1]).toEqual(replies[0]);
    expect(replies[2]).toEqual(replies[0]);
    expect(fetchAction).toHaveBeenCalledTimes(2);
  },
);
