export const archiveRecordTypes = [
  "contacts",
  "admissions",
  "eventRegistrations",
  "newsletterSubscribers",
  "aiConversations",
] as const;
export type ArchiveRecordType = (typeof archiveRecordTypes)[number];
export type ArchiveReceipt = {
  actor: string;
  kind: ArchiveRecordType;
  operation: "view" | "export";
  ids: string[];
  nonce: string;
  issuedAt: number;
};

export function serializeArchiveReceipt(r: ArchiveReceipt) {
  return JSON.stringify(["nps-archive-access-v1", r.actor, r.kind, r.operation, r.ids, r.nonce, r.issuedAt]);
}
