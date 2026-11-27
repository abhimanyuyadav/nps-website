import type { ImageProps } from "next/image";
// The function-only entry used by Next's getImageProps avoids importing its client image component.
import { getImageProps } from "next/dist/shared/lib/image-external-get-image-props";
export { getImageProps };

export default function DocumentImage(options: ImageProps) {
  const { props } = getImageProps(options);
  // eslint-disable-next-line @next/next/no-img-element -- Next's image optimizer supplied the responsive URLs.
  return <img {...props} alt={options.alt} />;
}
