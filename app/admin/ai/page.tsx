import { AiManager } from "@/components/admin/ai-manager";
import { PageHeading } from "@/components/admin/page-heading";
export default function AiPage() {
  return (
    <>
      <PageHeading
        eyebrow="Digital support"
        title="AI assistant"
        description="Turn Ask NPS on or off, test its answers, and check for problems. Review conversations only when needed for safety or support."
      />
      <AiManager />
    </>
  );
}
