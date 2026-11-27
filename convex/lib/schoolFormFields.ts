import { v, type Infer } from "convex/values";
export const field = v.object({
  label: v.string(),
  kind: v.union(v.literal("text"), v.literal("paragraph"), v.literal("choice"), v.literal("date")),
  required: v.boolean(),
  options: v.array(v.string()),
});
export type SchoolField = Infer<typeof field>;
export const formState = v.union(v.literal("draft"), v.literal("open"), v.literal("closed"));
