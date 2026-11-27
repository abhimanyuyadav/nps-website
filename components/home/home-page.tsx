import { getPublicHome } from "@/lib/data/home";
import { HomeContent } from "./home-content";

export async function HomePage() {
  return <HomeContent {...await getPublicHome()} />;
}
