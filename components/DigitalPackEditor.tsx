import React, { useCallback, useId, useMemo, useState } from "react";
import { auth, storage } from "../firebaseConfig";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import type { DigitalPackMediaItem, DigitalPackMediaKind } from "../types";
import {
  MAX_DIGITAL_PACK_PREVIEW_IMAGES,
  defaultPackPreviewIndices,
  isDigitalPackProductType,
  normalizePackPreviewIndices,
  togglePackPreviewIndex,
} from "../src/lib/digitalPackProduct";
import { CreatorMediaVaultPicker } from "./CreatorMediaVaultPicker";

type Props = {
  creatorId: string;
  productId: string | null;
  fulfillmentItems: DigitalPackMediaItem[];
  onFulfillmentItemsChange: (items: DigitalPackMediaItem[]) => void;
  previewMediaIndices: number[];
  onPreviewMediaIndicesChange: (indices: number[]) => void;
  salesVoiceTeaserUrl: string;
  onSalesVoiceTeaserUrlChange: (url: string) => void;
  productType: string;
  disabled?: boolean;
};

function inferKindFromFile(file: File): DigitalPackMediaKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "m4v"].includes(ext)) return "video";
  if (["mp3", "m4a", "wav", "ogg", "webm", "aac"].includes(ext)) return "audio";
  return null;
}

async function uploadPackFile(creatorId: string, productId: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `users/${creatorId}/productPacks/${productId}/media/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || undefined });
  return getDownloadURL(storageRef);
}

export const DigitalPackEditor: React.FC<Props> = ({
  creatorId,
  productId,
  fulfillmentItems,
  onFulfillmentItemsChange,
  previewMediaIndices,
  onPreviewMediaIndicesChange,
  salesVoiceTeaserUrl,
  onSalesVoiceTeaserUrlChange,
  productType,
  disabled = false,
}) => {
  const uid = auth.currentUser?.uid || creatorId;
  const draftId = productId || `draft_${useId().replace(/:/g, "")}`;
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const previewIndices = useMemo(
    () => normalizePackPreviewIndices(previewMediaIndices, fulfillmentItems),
    [previewMediaIndices, fulfillmentItems]
  );

  const appendItems = useCallback(
    (next: DigitalPackMediaItem[]) => {
      const merged = [...fulfillmentItems, ...next].map((item, i) => ({ ...item, sortOrder: i }));
      onFulfillmentItemsChange(merged);
      const previews = normalizePackPreviewIndices(previewMediaIndices, merged);
      if (previews.length === 0) {
        const defaults = defaultPackPreviewIndices(merged);
        if (defaults.length > 0) onPreviewMediaIndicesChange(defaults);
      } else {
        const valid = previews.filter((i) => i < merged.length);
        if (valid.length !== previews.length) onPreviewMediaIndicesChange(valid);
      }
    },
    [fulfillmentItems, onFulfillmentItemsChange, previewMediaIndices, onPreviewMediaIndicesChange]
  );

  const removeItem = (index: number) => {
    const merged = fulfillmentItems.filter((_, i) => i !== index).map((item, i) => ({ ...item, sortOrder: i }));
    onFulfillmentItemsChange(merged);
    const nextPreviews = normalizePackPreviewIndices(
      previewIndices.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i)),
      merged
    );
    onPreviewMediaIndicesChange(nextPreviews.length > 0 ? nextPreviews : defaultPackPreviewIndices(merged));
  };

  const handlePackFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length || !uid) return;
      setUploadError("");
      setUploading(true);
      try {
        const added: DigitalPackMediaItem[] = [];
        for (const file of Array.from(files)) {
          const kind = inferKindFromFile(file);
          if (!kind) {
            setUploadError("Unsupported file type. Use image, video, or audio.");
            continue;
          }
          const url = await uploadPackFile(uid, draftId, file);
          added.push({ type: kind, url });
        }
        if (added.length > 0) appendItems(added);
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "Upload failed.");
      } finally {
        setUploading(false);
      }
    },
    [uid, draftId, appendItems]
  );

  const handleSalesVoice = useCallback(
    async (files: FileList | null) => {
      if (!files?.[0] || !uid) return;
      setUploadError("");
      setUploading(true);
      try {
        const url = await uploadPackFile(uid, `${draftId}/salesVoice`, files[0]);
        onSalesVoiceTeaserUrlChange(url);
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "Upload failed.");
      } finally {
        setUploading(false);
      }
    },
    [uid, draftId, onSalesVoiceTeaserUrlChange]
  );

  if (!isDigitalPackProductType(productType)) return null;

  return (
    <div className="digital-pack-editor">
      <p className="treat-inline-hint">
        Upload everything in your pack once. Tap up to {MAX_DIGITAL_PACK_PREVIEW_IMAGES} photos as{" "}
        <strong>preview</strong> — fans see those sharp; everything else stays blurred until they buy (like feed
        unlocks).
      </p>
      {uploadError ? (
        <p className="treat-inline-hint treats-form-error" role="alert">
          {uploadError}
        </p>
      ) : null}

      <div className="treats-form-field">
        <label>Pack media *</label>
        <p className="treat-inline-hint">Photos, videos, and voice notes — all delivered automatically after purchase.</p>
        <input
          type="file"
          accept="image/*,video/*,audio/*"
          multiple
          disabled={disabled || uploading}
          onChange={(e) => {
            void handlePackFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {fulfillmentItems.length > 0 ? (
        <ul className="digital-pack-media-list">
          {fulfillmentItems.map((item, index) => {
            const isPreview = previewIndices.includes(index);
            const canPreview = item.type === "image";
            return (
              <li key={`${item.url}-${index}`} className="digital-pack-media-list__item">
                <div className="digital-pack-media-list__thumb">
                  {item.type === "image" ? (
                    <img src={item.url} alt="" loading="lazy" />
                  ) : item.type === "video" ? (
                    <video src={item.url} muted playsInline preload="metadata" />
                  ) : (
                    <span className="digital-pack-media-list__audio">Voice</span>
                  )}
                  {!isPreview && item.type !== "audio" ? (
                    <span className="digital-pack-media-list__blur-badge" aria-hidden>
                      Blurred
                    </span>
                  ) : null}
                </div>
                <div className="digital-pack-media-list__meta">
                  <span className="digital-pack-media-list__type">{item.type}</span>
                  {canPreview ? (
                    <button
                      type="button"
                      className={`digital-pack-media-list__preview-btn${isPreview ? " digital-pack-media-list__preview-btn--on" : ""}`}
                      disabled={disabled}
                      onClick={() =>
                        onPreviewMediaIndicesChange(
                          togglePackPreviewIndex(previewIndices, index, fulfillmentItems)
                        )
                      }
                    >
                      {isPreview ? "Preview ✓" : "Set as preview"}
                    </button>
                  ) : (
                    <span className="treat-inline-hint">Always blurred pre-purchase</span>
                  )}
                  <button
                    type="button"
                    className="treats-form-cancel digital-pack-media-list__remove"
                    disabled={disabled}
                    onClick={() => removeItem(index)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="treats-form-field">
        <label>Sales voice (optional)</label>
        <p className="treat-inline-hint">Short clip fans can play before buying — not included in the pack.</p>
        {salesVoiceTeaserUrl ? (
          <audio src={salesVoiceTeaserUrl} controls style={{ width: "100%", marginBottom: "0.5rem" }} />
        ) : null}
        <div className="digital-pack-sales-voice-toolbar">
          <input
            type="file"
            accept="audio/*"
            disabled={disabled || uploading}
            onChange={(e) => {
              void handleSalesVoice(e.target.files);
              e.target.value = "";
            }}
          />
          <CreatorMediaVaultPicker
            filterType="audio"
            disabled={disabled || uploading}
            emptyHint="No voice clips in My Vault yet. Upload audio from Vault in the sidebar, then pick it here."
            onSelect={(item) => onSalesVoiceTeaserUrlChange(item.url)}
          />
        </div>
        {salesVoiceTeaserUrl ? (
          <button
            type="button"
            className="treats-form-cancel"
            style={{ marginTop: "0.35rem" }}
            disabled={disabled}
            onClick={() => onSalesVoiceTeaserUrlChange("")}
          >
            Remove sales voice
          </button>
        ) : null}
      </div>

      {uploading ? (
        <p className="treat-inline-hint" style={{ margin: 0 }}>
          Uploading…
        </p>
      ) : null}
    </div>
  );
};
