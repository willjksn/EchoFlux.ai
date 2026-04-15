"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  canUseSjHeartEmoji,
  filterEmojisForSjHeartAccess,
  type SjHeartEmojiAccessContext,
} from "../src/lib/customEmoji";
import { EMOJIS, EMOJI_CATEGORIES, type Emoji } from "./emojiData";
import {
  FaceSmileIcon,
  CatIcon,
  PizzaIcon,
  SoccerBallIcon,
  CarIcon,
  LightbulbIcon,
  HeartIcon,
} from "./icons/UIIcons";

const feedCommentModalEmojiCategoryIcons: Record<string, React.ReactNode> = {
  FaceSmileIcon: <FaceSmileIcon className="w-5 h-5" />,
  CatIcon: <CatIcon className="w-5 h-5" />,
  PizzaIcon: <PizzaIcon className="w-5 h-5" />,
  SoccerBallIcon: <SoccerBallIcon className="w-5 h-5" />,
  CarIcon: <CarIcon className="w-5 h-5" />,
  LightbulbIcon: <LightbulbIcon className="w-5 h-5" />,
  HeartIcon: <HeartIcon className="w-5 h-5" />,
};

export type UseFanFeedCommentEmojiPickerArgs = {
  composeSurfaceOpen: boolean;
  commentText: string;
  setCommentText: (value: string) => void;
  maxLength?: number;
  sjHeartEmojiCtx: SjHeartEmojiAccessContext;
};

export function useFanFeedCommentEmojiPicker({
  composeSurfaceOpen,
  commentText,
  setCommentText,
  maxLength = 500,
  sjHeartEmojiCtx,
}: UseFanFeedCommentEmojiPickerArgs) {
  const [composeEmojiPickerOpen, setComposeEmojiPickerOpen] = useState(false);
  const [composeEmojiSearch, setComposeEmojiSearch] = useState("");
  const [composeEmojiCategory, setComposeEmojiCategory] = useState<Emoji["category"]>(EMOJI_CATEGORIES[0].name);
  const [composeEmojiPickerFixedStyle, setComposeEmojiPickerFixedStyle] = useState<React.CSSProperties | null>(null);

  const commentInputRef = useRef<HTMLInputElement | null>(null);
  const composeEmojiPickerRef = useRef<HTMLDivElement | null>(null);
  const composeEmojiButtonRef = useRef<HTMLButtonElement | null>(null);
  const composeFieldRef = useRef<HTMLDivElement | null>(null);

  const composeFilteredEmojis = useMemo(() => {
    const term = composeEmojiSearch.toLowerCase();
    const allowSjHeart = canUseSjHeartEmoji(sjHeartEmojiCtx);
    const base = filterEmojisForSjHeartAccess(EMOJIS, allowSjHeart);
    if (term) {
      return base.filter(
        (e) =>
          e.description.toLowerCase().includes(term) || e.aliases.some((a) => a.includes(term))
      );
    }
    return base.filter((e) => e.category === composeEmojiCategory);
  }, [composeEmojiSearch, composeEmojiCategory, sjHeartEmojiCtx]);

  const insertComposeEmoji = useCallback(
    (insert: string) => {
      const piece = insert;
      if (!piece) return;
      const el = commentInputRef.current;
      if (el) {
        const start = el.selectionStart ?? commentText.length;
        const end = el.selectionEnd ?? commentText.length;
        const next = (commentText.slice(0, start) + piece + commentText.slice(end)).slice(0, maxLength);
        setCommentText(next);
        window.requestAnimationFrame(() => {
          const input = commentInputRef.current;
          if (!input) return;
          input.focus();
          const pos = Math.min(start + piece.length, next.length);
          input.setSelectionRange(pos, pos);
        });
      } else {
        setCommentText((commentText + piece).slice(0, maxLength));
      }
    },
    [commentText, maxLength, setCommentText]
  );

  const updateComposeEmojiPickerPosition = useCallback(() => {
    if (!composeEmojiPickerOpen) {
      setComposeEmojiPickerFixedStyle(null);
      return;
    }
    const POPOVER_H = 300;
    const pad = 8;
    const vw = typeof window !== "undefined" ? window.innerWidth : 400;
    const vh = typeof window !== "undefined" ? window.innerHeight : 600;
    const w = Math.min(320, vw - 2 * pad);

    const field = composeFieldRef.current;
    if (!field) {
      setComposeEmojiPickerFixedStyle({
        position: "fixed",
        left: Math.max(pad, (vw - w) / 2),
        bottom: 24,
        width: w,
        maxHeight: Math.min(POPOVER_H, Math.floor(vh * 0.42)),
        zIndex: 2147483646,
        boxSizing: "border-box",
        visibility: "visible",
        opacity: 1,
      });
      return;
    }

    const rect = field.getBoundingClientRect();
    const left = Math.max(pad, Math.min(rect.left, vw - w - pad));
    const spaceBelow = vh - rect.bottom - pad;
    const spaceAbove = rect.top - pad;
    const below = spaceBelow >= 160 || spaceBelow >= spaceAbove;
    const top = below ? rect.bottom + 6 : Math.max(pad, rect.top - POPOVER_H - 6);
    const maxH = Math.max(
      120,
      below ? Math.min(POPOVER_H, spaceBelow - 6) : Math.min(POPOVER_H, spaceAbove - 6)
    );
    setComposeEmojiPickerFixedStyle({
      position: "fixed",
      left,
      top,
      width: w,
      maxHeight: maxH,
      zIndex: 2147483646,
      boxSizing: "border-box",
      visibility: "visible",
      opacity: 1,
    });
  }, [composeEmojiPickerOpen]);

  useLayoutEffect(() => {
    if (!composeEmojiPickerOpen) {
      setComposeEmojiPickerFixedStyle(null);
      return;
    }
    updateComposeEmojiPickerPosition();
    const id = window.requestAnimationFrame(() => {
      updateComposeEmojiPickerPosition();
    });
    return () => window.cancelAnimationFrame(id);
  }, [composeEmojiPickerOpen, updateComposeEmojiPickerPosition]);

  useEffect(() => {
    if (!composeEmojiPickerOpen) return;
    updateComposeEmojiPickerPosition();
    const onMove = () => updateComposeEmojiPickerPosition();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [composeEmojiPickerOpen, updateComposeEmojiPickerPosition]);

  useEffect(() => {
    if (!composeEmojiPickerOpen) return;
    const ignoreOutsideUntil = Date.now() + 220;
    const handlePointerDownOutside = (event: PointerEvent) => {
      if (Date.now() < ignoreOutsideUntil) return;
      const t = event.target as Node;
      if (
        composeEmojiPickerRef.current?.contains(t) ||
        composeEmojiButtonRef.current?.contains(t)
      ) {
        return;
      }
      setComposeEmojiPickerOpen(false);
      setComposeEmojiSearch("");
    };
    document.addEventListener("pointerdown", handlePointerDownOutside);
    return () => document.removeEventListener("pointerdown", handlePointerDownOutside);
  }, [composeEmojiPickerOpen]);

  useEffect(() => {
    if (composeSurfaceOpen) return;
    setComposeEmojiPickerOpen(false);
    setComposeEmojiSearch("");
  }, [composeSurfaceOpen]);

  const emojiPickerPortal =
    composeEmojiPickerOpen &&
    composeSurfaceOpen &&
    typeof document !== "undefined" &&
    document.body
      ? createPortal(
          <div
            ref={composeEmojiPickerRef}
            className="feed-comments-modal-emoji-picker feed-comments-modal-emoji-picker--fixed"
            style={
              composeEmojiPickerFixedStyle ??
              (typeof window !== "undefined"
                ? {
                    position: "fixed",
                    left: Math.max(12, (window.innerWidth - Math.min(320, window.innerWidth - 24)) / 2),
                    bottom: 24,
                    width: Math.min(320, window.innerWidth - 24),
                    maxHeight: Math.min(300, Math.floor(window.innerHeight * 0.42)),
                    zIndex: 2147483646,
                    boxSizing: "border-box",
                    visibility: "visible",
                    opacity: 1,
                  }
                : { position: "fixed", zIndex: 2147483646, boxSizing: "border-box" })
            }
            onPointerDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Emoji picker"
          >
            <div className="feed-comments-modal-emoji-picker-search">
              <input
                type="text"
                placeholder="Search emojis…"
                value={composeEmojiSearch}
                onChange={(e) => setComposeEmojiSearch(e.target.value)}
                className="feed-comments-modal-emoji-picker-search-input"
              />
            </div>
            <div className="feed-comments-modal-emoji-picker-grid">
              {composeFilteredEmojis.map(({ emoji, description, imageUrl, insertText }) => (
                <button
                  key={description}
                  type="button"
                  className="feed-comments-modal-emoji-picker-cell"
                  title={description}
                  aria-label={description}
                  onClick={() => insertComposeEmoji(insertText ?? emoji)}
                >
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={description}
                      className="feed-comments-modal-emoji-picker-img"
                    />
                  ) : (
                    emoji
                  )}
                </button>
              ))}
            </div>
            <div className="feed-comments-modal-emoji-picker-cats">
              {EMOJI_CATEGORIES.map(({ name, icon }) => (
                <button
                  key={name}
                  type="button"
                  className={`feed-comments-modal-emoji-picker-cat${
                    composeEmojiCategory === name && !composeEmojiSearch ? " active" : ""
                  }`}
                  title={name}
                  aria-label={name}
                  onClick={() => {
                    setComposeEmojiCategory(name);
                    setComposeEmojiSearch("");
                  }}
                >
                  {feedCommentModalEmojiCategoryIcons[icon]}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )
      : null;

  return {
    composeFieldRef,
    commentInputRef,
    composeEmojiButtonRef,
    composeEmojiPickerOpen,
    setComposeEmojiPickerOpen,
    emojiPickerPortal,
  };
}
