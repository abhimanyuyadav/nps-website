import { ConvexHttpClient } from "convex/browser";

export function schoolContentClient() {
  const url = process.env.SCHOOL_CONTENT_URL;
  return url ? new ConvexHttpClient(url) : null;
}
