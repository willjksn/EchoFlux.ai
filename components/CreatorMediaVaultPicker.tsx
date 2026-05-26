import React, { useCallback, useRef, useState } from "react";
import { useAppContext } from "./AppContext";
import {
  loadCreatorMediaVaultPage,
  type MediaVaultItem,
  type MediaVaultItemType,
} from "../src/lib/creatorMediaVault";

type Props = {
  /** Only show vault items of this type (e.g. audio for sales voice). */
  filterType?: MediaVaultItemType;
  onSelect: (item: MediaVaultItem) => void;
  disabled?: boolean;
  emptyHint?: string;
};

/**
 * Inline My Vault picker (same `users/{uid}/media_library` as Posts / Purchases).
 */
export const CreatorMediaVaultPicker: React.FC<Props> = ({
  filterType,
  onSelect,
  disabled = false,
  emptyHint = "No items in My Vault yet. Upload media from Vault in the sidebar, then try again.",
}) => {
  const { user, showToast } = useAppContext();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [items, setItems] = useState<MediaVaultItem[]>([]);
  const cursorRef = useRef<Awaited<ReturnType<typeof loadCreatorMediaVaultPage>>["cursor"]>(null);
  const orderSupportedRef = useRef(true);
  const gateRef = useRef({ hasMore: false, loadingMore: false, loading: false });
  gateRef.current = { hasMore, loadingMore, loading };

  const loadVault = useCallback(
    async (mode: "reset" | "more") => {
      const uid = user?.id;
      if (!uid) return;
      if (mode === "more") {
        const g = gateRef.current;
        if (!g.hasMore || g.loadingMore || g.loading) return;
        if (!orderSupportedRef.current || !cursorRef.current) return;
      }
      if (mode === "reset") {
        cursorRef.current = null;
        orderSupportedRef.current = true;
      }
      if (mode === "more") setLoadingMore(true);
      else setLoading(true);
      try {
        const result = await loadCreatorMediaVaultPage(
          uid,
          mode,
          { cursor: cursorRef.current, orderSupported: orderSupportedRef.current },
          filterType
        );
        cursorRef.current = result.cursor;
        orderSupportedRef.current = result.orderSupported;
        setHasMore(result.hasMore);
        setItems((prev) => (mode === "reset" ? result.items : [...prev, ...result.items]));
      } catch (e) {
        showToast?.(e instanceof Error ? e.message : "Could not load Vault items.", "error");
      } finally {
        if (mode === "more") setLoadingMore(false);
        else setLoading(false);
      }
    },
    [filterType, showToast, user?.id]
  );

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) void loadVault("reset");
  };

  return (
    <div className="creator-vault-picker">
      <button
        type="button"
        className="treats-form-cancel creator-vault-picker__toggle"
        disabled={disabled || loading || loadingMore}
        onClick={toggleOpen}
      >
        {open ? "Hide library" : loading ? "Loading library…" : "Pick from library"}
      </button>
      {open ? (
        <div className="creator-vault-picker__panel">
          {loading ? (
            <p className="treat-inline-hint">Loading your library…</p>
          ) : items.length === 0 ? (
            <p className="treat-inline-hint">{emptyHint}</p>
          ) : (
            <div className="creator-vault-picker__grid">
              {items.map((item) => (
                <button
                  key={`${item.url}-${item.name}`}
                  type="button"
                  className="creator-vault-picker__tile"
                  disabled={disabled}
                  onClick={() => {
                    onSelect(item);
                    setOpen(false);
                    showToast?.(
                      filterType === "audio" ? "Sales voice selected from library." : "Selected from library.",
                      "success"
                    );
                  }}
                >
                  {item.type === "audio" ? (
                    <span className="creator-vault-picker__audio-label">Voice</span>
                  ) : item.type === "video" ? (
                    <span className="creator-vault-picker__audio-label">Video</span>
                  ) : (
                    <img src={item.url} alt="" loading="lazy" className="creator-vault-picker__thumb" />
                  )}
                  <span className="creator-vault-picker__name">{item.name}</span>
                </button>
              ))}
            </div>
          )}
          {hasMore && items.length > 0 ? (
            <button
              type="button"
              className="treats-form-cancel"
              disabled={loadingMore || loading}
              onClick={() => void loadVault("more")}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
