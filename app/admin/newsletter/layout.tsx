import { WorkflowProvider } from "@/components/admin/workflow-provider";
import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return <WorkflowProvider>{children}</WorkflowProvider>;
}
