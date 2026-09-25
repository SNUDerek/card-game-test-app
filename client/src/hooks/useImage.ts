import { useState, useEffect } from "react";

export function useImage(url: string | undefined) {
  const [image, setImage] = useState<HTMLImageElement | undefined>(undefined);
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "failed">(
    url ? "loading" : "idle",
  );

  useEffect(() => {
    setImage(undefined);
    if (!url) {
      setStatus("idle");
      return;
    }

    let active = true;
    setStatus("loading");
    const img = new window.Image();

    const onLoad = () => {
      if (!active) return;
      setImage(img);
      setStatus("loaded");
    };

    const onError = () => {
      if (!active) return;
      setImage(undefined);
      setStatus("failed");
    };

    img.addEventListener("load", onLoad);
    img.addEventListener("error", onError);
    img.crossOrigin = "anonymous";
    img.src = url;

    return () => {
      active = false;
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", onError);
    };
  }, [url]);

  return [image, status] as const;
}
