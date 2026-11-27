declare module "school-page-modules" {
  import type { Metadata } from "next";
  import type { ComponentChild } from "preact";
  type Props = {
    params: Promise<Record<string, string>>;
    searchParams: Promise<Record<string, string | string[]>>;
  };
  export const pages: Record<
    string,
    {
      default: (props: Props) => ComponentChild | Promise<ComponentChild>;
      metadata?: Metadata;
      generateMetadata?: (props: Props) => Metadata | Promise<Metadata>;
    }
  >;
}
