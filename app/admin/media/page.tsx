import { MediaManager } from "@/components/admin/media-manager";
import { PageHeading } from "@/components/admin/page-heading";
export default function MediaPage() {
  return (
    <>
      <PageHeading
        eyebrow="School photos and files"
        title="Media library"
        description="Upload school-approved photos, videos, and documents. Describe each image for people who cannot see it."
      />
      <MediaManager />
    </>
  );
}
