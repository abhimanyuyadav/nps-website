"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { showsMaintenanceNotice } from "@/lib/content/maintenance-routes";
export function MaintenanceGate({
  enabled,
  fallback,
  children,
}: {
  enabled: boolean;
  fallback: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  return showsMaintenanceNotice(enabled, pathname) ? fallback : children;
}
