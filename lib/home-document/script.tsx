import { useEffect } from "react";

export default function DocumentScript({
  id,
  src,
  onReady,
}: {
  id: string;
  src: string;
  onReady: () => void;
}) {
  useEffect(() => {
    const existing = document.getElementById(id);
    const script = existing instanceof HTMLScriptElement ? existing : document.createElement("script");
    if (script.dataset.ready === "true") {
      onReady();
      return;
    }
    const ready = () => {
      script.dataset.ready = "true";
      onReady();
    };
    script.addEventListener("load", ready);
    if (!existing) {
      script.id = id;
      script.src = src;
      script.async = true;
      document.head.append(script);
    }
    return () => script.removeEventListener("load", ready);
  }, [id, src, onReady]);
  return null;
}
