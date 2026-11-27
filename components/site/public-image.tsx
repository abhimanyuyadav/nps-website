import NextImage, { getImageProps, type ImageProps } from "next/image";

/** Image wrapper for administrator-configured or Convex storage URLs. */
export default function PublicImage(props: ImageProps) {
  return <NextImage {...props} />;
}

// Static editorial photos need responsive image URLs, dimensions and native lazy loading.
export function EditorialImage(
  options: Pick<
    ImageProps,
    "src" | "alt" | "sizes" | "width" | "height" | "fill" | "className" | "aria-hidden"
  >,
) {
  const { props } = getImageProps(options);
  // eslint-disable-next-line @next/next/no-img-element -- getImageProps supplies the optimized srcset.
  return <img {...props} alt={options.alt} />;
}
