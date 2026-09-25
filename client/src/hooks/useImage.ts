import { useState, useEffect } from "react";

export function useImage(url: string | undefined) {
  const [image, setImage] = useState<HTMLImageElement | undefined>(undefined);
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");

  useEffect(() => {
    if (!url) return;
    const img = new window.Image();
    img.src = url;
    img.crossOrigin = "Anonymous";
    
    const onLoad = () => {
      setImage(img);
      setStatus("loaded");
    };
    
    const onError = () => {
      setImage(undefined);
      setStatus("failed");
    };
    
    img.addEventListener("load", onLoad);
    img.addEventListener("error", onError);
    
    return () => {
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", onError);
    };
  }, [url]);

  return [image, status] as const;
}
