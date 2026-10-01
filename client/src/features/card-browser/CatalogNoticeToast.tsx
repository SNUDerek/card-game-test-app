import { useEffect } from "react";
import { useCardCatalog } from "./CardCatalogContext";
import "./CatalogNoticeToast.css";

export const CATALOG_NOTICE_DURATION_MS = 4_000;

/** Says who just edited the set, so cards on the table never change silently. */
export function CatalogNoticeToast({ durationMs = CATALOG_NOTICE_DURATION_MS }: { durationMs?: number }) {
  const { notice, dismissNotice } = useCardCatalog();

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(dismissNotice, durationMs);
    return () => clearTimeout(timer);
  }, [notice, dismissNotice, durationMs]);

  if (!notice) return null;
  return (
    <p className="catalog-notice" role="status">
      {notice.text}
    </p>
  );
}
