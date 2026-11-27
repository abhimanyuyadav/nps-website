import type { ComponentProps } from "react";

export default function DocumentLink({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) {
  void prefetch;
  return <a {...props} />;
}
