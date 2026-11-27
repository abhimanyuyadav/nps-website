import type { HomeDocumentData } from "../home-document/types";

export type DocumentShell = Omit<HomeDocumentData, "home"> & { site: HomeDocumentData["home"]["site"] };
export type PageDocumentData = DocumentShell & {
  pathname: string;
  search: Record<string, string | string[]>;
};
export type DocumentPage = {
  pathname: string;
  title: string;
  description: string;
  canonical: string;
  image?: string;
  robots?: string;
  body: string;
};
