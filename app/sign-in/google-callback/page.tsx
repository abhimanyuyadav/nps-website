import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

export default function StaffGoogleCallback() {
  return (
    <AuthenticateWithRedirectCallback
      signInUrl="/sign-in?staff-method=email"
      signInForceRedirectUrl="/admin"
      signUpForceRedirectUrl="/admin"
    />
  );
}
