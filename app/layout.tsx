import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NPS Digital Campus | Nepal Police School",
  description: "Nepal Police School, Garuda, Rautahat — digital campus.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
