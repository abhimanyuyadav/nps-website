import { createContext } from "preact";
import { useContext } from "preact/hooks";

export const DocumentPath = createContext<string | undefined>(undefined);
export function useDocumentPath() {
  const serverPath = useContext(DocumentPath);
  return serverPath ?? (typeof window === "undefined" ? "/" : window.location.pathname);
}
