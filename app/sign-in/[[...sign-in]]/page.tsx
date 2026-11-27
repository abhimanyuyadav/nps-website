import { SignIn } from "@clerk/nextjs";
import { StaffSignInShell } from "@/components/site/staff-sign-in-shell";

export const metadata = {
  title: "Staff sign in",
  description: "Secure staff access to the Nepal Police School administration workspace.",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.includes("replace") &&
    process.env.CLERK_SECRET_KEY &&
    !process.env.CLERK_SECRET_KEY.includes("replace"),
  );

  return (
    <StaffSignInShell configured={configured}>
      <SignIn routing="path" path="/sign-in" forceRedirectUrl="/admin" signUpUrl={undefined} />
    </StaffSignInShell>
  );
}
