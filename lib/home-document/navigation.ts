export { useDocumentPath as usePathname } from "./path";

const navigation = {
  push(path: string) {
    window.location.assign(path);
  },
  replace(path: string) {
    window.location.replace(path);
  },
  // Document navigation fetches a fresh page, including after student sign-out.
  refresh() {},
};
export function useRouter() {
  return navigation;
}
