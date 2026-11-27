/** Used by both the standalone Clerk widget and the Next.js verification pages. */
export const staffSignInAppearance = {
  variables: {
    colorPrimary: "#2e3192",
    colorForeground: "#1e1f5c",
    fontFamily: "inherit",
    borderRadius: "0.65rem",
  },
  elements: {
    rootBox: { width: "100%", minWidth: 0 },
    cardBox: {
      width: "100%",
      maxWidth: "100%",
      border: "1px solid #dfe2f7",
      borderRadius: "1rem",
      boxShadow: "0 8px 28px rgba(30,31,92,.06)",
    },
    card: { width: "100%", minWidth: 0, padding: "clamp(1.25rem, 5vw, 2rem)", boxShadow: "none" },
    headerTitle: { color: "#1e1f5c", fontWeight: 800 },
    formButtonPrimary: { background: "#2e3192", color: "white", minHeight: "2.75rem" },
    formFieldInput: { minHeight: "2.75rem", fontSize: "1rem" },
    socialButtonsBlockButton: { minHeight: "2.75rem" },
  },
} as const;
