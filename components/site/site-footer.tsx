import type { ComponentProps } from "react";
import { hasPublicFormConfiguration } from "@/lib/server/form-configuration";
import { FooterContent } from "./footer-content";

export function SiteFooter(props: Omit<ComponentProps<typeof FooterContent>, "subscriptionsAvailable">) {
  return <FooterContent {...props} subscriptionsAvailable={hasPublicFormConfiguration()} />;
}
