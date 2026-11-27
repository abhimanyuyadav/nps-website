import "server-only";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
export const schoolFormsUrl =
  process.env.NEXT_PUBLIC_WORKFLOW_CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
export function listOpenForms() {
  return schoolFormsUrl
    ? fetchQuery(api.schoolForms.openForms, {}, { url: schoolFormsUrl })
    : Promise.resolve([]);
}
