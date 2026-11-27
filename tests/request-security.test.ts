import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getRequestIp, requestFingerprint, safeSameOriginPath } from "@/lib/server/request-security";
import { signPublicFormPayload } from "@/lib/server/public-forms";
import { createHmac } from "node:crypto";
import {
  canonicalAssistantSignaturePayload,
  normalizeAssistantServiceSecret,
} from "@/convex/lib/assistantSignature";

describe("safeSameOriginPath", () => {
  it("accepts normal application routes", () => {
    expect(safeSameOriginPath("/notices/admission-open")).toBe("/notices/admission-open");
  });

  it("preserves queries and fragments and rejects non-web path separators", () => {
    expect(safeSameOriginPath("/gallery?view=all#photos")).toBe("/gallery?view=all#photos");
    expect(safeSameOriginPath("/school\\archive")).toBeNull();
  });

  it("rejects protocol-relative and external destinations", () => {
    expect(safeSameOriginPath("//malicious.example/path")).toBeNull();
    expect(safeSameOriginPath("https://malicious.example/path")).toBeNull();
    expect(safeSameOriginPath("javascript:alert(1)")).toBeNull();
  });
});

describe("requestFingerprint", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("omits unavailable or invalid platform addresses", () => {
    vi.stubEnv("VERCEL", "1");
    const request = new NextRequest("https://school.example/");
    expect(getRequestIp(request)).toBeNull();
    request.headers.set("x-vercel-forwarded-for", "unavailable");
    expect(getRequestIp(request)).toBeNull();
    request.headers.set("x-vercel-forwarded-for", "2001:db8::1");
    expect(getRequestIp(request)).toBe("2001:db8::1");
    vi.stubEnv("VERCEL", "");
    expect(getRequestIp(request)).toBeNull();
  });
  it("uses the trusted forwarding address and produces a stable HMAC", () => {
    vi.stubEnv("VERCEL", "1");
    const request = new NextRequest("https://school.example/api/forms/contact", {
      headers: {
        "x-vercel-forwarded-for": "203.0.113.10",
        "cf-connecting-ip": "192.0.2.1",
        "x-forwarded-for": "198.51.100.20, 198.51.100.21",
        "user-agent": "test-agent",
      },
    });
    expect(getRequestIp(request)).toBe("203.0.113.10");
    const first = requestFingerprint(request, "session-id", "a-long-test-secret");
    const second = requestFingerprint(request, "session-id", "a-long-test-secret");
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("signPublicFormPayload", () => {
  it("signs the canonical timestamp-first JSON payload", () => {
    const now = 1_786_016_400_000;
    const originalNow = Date.now;
    Date.now = () => now;
    try {
      const secret = "form-service-secret-that-is-long-enough-for-tests";
      const payload = { form: "contact", fingerprint: "fingerprint", honeypot: null };
      const result = signPublicFormPayload(secret, payload);
      const expected = createHmac("sha256", secret)
        .update(JSON.stringify({ requestTimestamp: now, ...payload }), "utf8")
        .digest("hex");
      expect(result).toEqual({ requestTimestamp: now, signature: expected });
    } finally {
      Date.now = originalNow;
    }
  });
});

describe("canonicalAssistantSignaturePayload", () => {
  it("is stable when history object keys arrive in a different order", () => {
    const common = {
      requestTimestamp: 1_786_016_400_000,
      fingerprint: "fingerprint",
      sessionId: "session-id",
      message: "How do I apply?",
    };
    const routePayload = canonicalAssistantSignaturePayload({
      ...common,
      history: [{ role: "assistant", content: "Hello." }],
    });
    const convexPayload = canonicalAssistantSignaturePayload({
      ...common,
      history: [{ content: "Hello.", role: "assistant" }],
    });

    expect(routePayload).toBe(convexPayload);
    expect(routePayload).toBe(
      '["nps-assistant-v1",1786016400000,"fingerprint","session-id","How do I apply?",[["assistant","Hello."]]]',
    );
  });

  it("normalizes deployment line endings before signing", () => {
    const secret = "assistant-service-secret-that-is-long-enough";

    expect(normalizeAssistantServiceSecret(`  ${secret}\r\n`)).toBe(secret);
    expect(normalizeAssistantServiceSecret(" \r\n ")).toBeUndefined();
  });
});
