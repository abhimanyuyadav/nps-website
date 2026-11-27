import { createPrivateKey, sign } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { getSiteUrl } from "@/lib/server/site-url";

function tokenResponse(token: string) {
  return Response.json({ token }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST() {
  const { userId, getToken, sessionClaims } = await auth();
  const primary = process.env.NEXT_PUBLIC_CONVEX_URL;
  const workflow = process.env.NEXT_PUBLIC_WORKFLOW_CONVEX_URL;
  if (!userId) return new Response(null, { status: 401 });
  if (!primary || !workflow) return new Response(null, { status: 503 });
  const clerkToken = await getToken(sessionClaims?.aud === "convex" ? {} : { template: "convex" });
  if (!clerkToken) return new Response(null, { status: 401 });
  const client = new ConvexHttpClient(primary);
  client.setAuth(clerkToken);
  const staff = await client.query(api.users.current, {});
  if (!staff || staff.clerkUserId !== userId || staff.status !== "active" || !staff.roles.length)
    return new Response(null, { status: 403 });
  if (new URL(primary).href === new URL(workflow).href) return tokenResponse(clerkToken);

  const privateKey = process.env.WORKFLOW_TOKEN_PRIVATE_KEY;
  if (!privateKey) return new Response(null, { status: 503 });
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const claims = {
    iss: new URL("/admin/workflow-token", getSiteUrl()).href,
    sub: userId,
    aud: "nps-workflows",
    iat: now,
    exp: now + 120,
    email: staff.email,
    name: staff.name,
  };
  const key = createPrivateKey({ key: Buffer.from(privateKey, "base64"), format: "der", type: "pkcs8" });
  const signForRoles = (roles: typeof staff.roles) => {
    const input = encode({ alg: "RS256", typ: "JWT", kid: "nps-workflows" }) + "." + encode({ ...claims, roles });
    return input + "." + sign("RSA-SHA256", Buffer.from(input), key).toString("base64url");
  };
  const destination = new ConvexHttpClient(workflow);
  destination.setAuth(signForRoles(staff.roles));
  let localStaff = await destination.query(api.users.current, {});
  if (!localStaff) {
    await destination.mutation(api.users.syncCurrent, {});
    localStaff = await destination.query(api.users.current, {});
  }
  if (!localStaff || localStaff.clerkUserId !== userId || localStaff.status !== "active")
    return new Response(null, { status: 403 });
  const allowedRoles = localStaff.roles;
  const roles = staff.roles.filter((role) => allowedRoles.includes(role));
  if (!roles.length) return new Response(null, { status: 403 });
  return tokenResponse(signForRoles(roles));
}
