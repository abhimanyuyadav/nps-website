import { WorkflowProvider } from "@/components/admin/workflow-provider";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <WorkflowProvider>{children}</WorkflowProvider>;
}
