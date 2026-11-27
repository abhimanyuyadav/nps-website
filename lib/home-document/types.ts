import type { PublicHome } from "@/lib/data/home";
import type { PublicNavigationItem } from "@/lib/data/public";
export interface HomeDocumentData {
  home: PublicHome;
  header: PublicNavigationItem[];
  utility: PublicNavigationItem[];
  footer: PublicNavigationItem[];
  newsletterAvailable: boolean;
  origin: string;
}
