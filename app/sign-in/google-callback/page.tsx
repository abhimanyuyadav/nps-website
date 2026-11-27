import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

export default function StaffGoogleCallback() {
  return (
    <AuthenticateWithRedirectCallback
      signInUrl="/sign-in?staff-ui=next"
      firstFactorUrl="/sign-in/factor-one"
      secondFactorUrl="/sign-in/factor-two"
      signInForceRedirectUrl="/admin"
      signUpForceRedirectUrl="/admin"
    />
  );
}
