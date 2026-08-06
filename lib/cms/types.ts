export type Teacher = {
  id: string;
  name: string;
  designation: string;
  department: string;
  qualification: string | null;
  bio: string | null;
  photo_url: string | null;
  social_links: Record<string, string> | null;
  position: number;
  is_enabled: boolean;
};

export type SiteSetting = { key: string; value: unknown; updated_at: string };
export type LeadershipContent = { id: string; slug: string; name: string; designation: string; message: string; photo_url: string | null; signature_url: string | null; office_hours: string | null; is_enabled: boolean; position: number };
