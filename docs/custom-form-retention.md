# Custom-form answer retention

**School policy for approval.** The proposed period is 365 days from submission for routine administrative forms such as a club interest survey. The records owner must approve the period and identify each eligible form revision before activation. No period is inferred from an answer's contents. This is a school policy choice, not a statutory deadline.

| Category | Handling |
|---|---|
| New answers to an approved routine form revision | Set the expiry at submission. The daily Convex cleanup removes expired answers in batches of ten and records the number removed. |
| Existing answers, unclassified forms, or a changed form revision | Preserve. A later change of configuration does not give these answers an expiry. |
| Admissions, safeguarding, statutory records, disputes and other official records | Exclude from the routine list. The school records owner assigns a separate approved schedule. |
| A preservation request or investigation | An active administrator places a hold on the response before expiry. The job skips held responses. The administrator releases a hold only after clearance. An overdue response then becomes eligible at the next cleanup. |

## Activation and review

1. Record written approval of the duration, the form ID and revision, its purpose, the owner and its exclusions. Give families the applicable retention notice before opening the eligible revision.
2. In the **workflow Convex deployment**, set `SCHOOL_RESPONSE_RETENTION_DAYS` and add only approved `formId@revision` entries to the comma-separated `SCHOOL_ROUTINE_FORM_REVISIONS`. Draft or changed revisions require fresh classification. The default is preservation.
3. A privileged staff client can call `schoolForms:setRetentionHold` with the response ID and `hold: true` or `false`. Convex checks the active admin role and logs the actor, record and decision. The existing admin UI has no hold button.
4. Review a count-only preview of due answers before activation and after changing the schedule. To pause all custom-form expiry, unset the duration. Removing a revision stops new expiry assignments. It does not cancel previously assigned dates. Use a hold or pause for those.
5. Review the policy annually. The cleanup covers the live custom-form answer. Backups, emailed receipts, exported files and official records require their own approved handling.
