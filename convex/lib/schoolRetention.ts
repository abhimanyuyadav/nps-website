export function schoolRetentionDays() {
  const value = process.env.SCHOOL_RESPONSE_RETENTION_DAYS?.trim() ?? "";
  const days = Number(value);
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(days * 86_400_000) ? days : 0;
}

export function schoolResponseExpiry(formId: string, revision: number, now: number) {
  const days = schoolRetentionDays();
  const approved = (process.env.SCHOOL_ROUTINE_FORM_REVISIONS ?? "").split(",").map(value => value.trim());
  const expiry = now + days * 86_400_000;
  if (days && approved.includes(formId + "@" + revision) && Number.isSafeInteger(expiry)) return expiry;
}
