import React, { useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import { EMOJIS, EMOJI_CATEGORIES } from "./emojiData";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const CategoryIcons: Record<string, string> = {
  "Smileys & People": "😀",
  "Animals & Nature": "🐻",
  "Food & Drink": "🍎",
  "Activities": "⚽",
  "Travel & Places": "✈️",
  "Objects": "💡",
  "Symbols": "❤️",
};

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect, onClose }) => {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("Smileys & People");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const filteredEmojis = search.trim()
    ? EMOJIS.filter(
        (e) =>
          e.emoji.includes(search) ||
          e.description.toLowerCase().includes(search.toLowerCase()) ||
          e.aliases.some((a) => a.toLowerCase().includes(search.toLowerCase()))
      )
    : EMOJIS.filter((e) => e.category === activeCategory);

  const handleEmojiClick = (emoji: string) => {
    onSelect(emoji);
  };

  return (
    <div
      ref={containerRef}
      className="emoji-picker-panel"
      style={{
        width: "352px",
        height: "420px",
        background: "linear-gradient(180deg, #e8e8e8 0%, #d4d4d4 100%)",
        borderRadius: "8px",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.1)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Segoe UI', system-ui, sans-serif",
      }}
    >
      {/* Search bar */}
      <div style={{ padding: "8px 10px", background: "rgba(255,255,255,0.5)" }}>
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search emoji..."
          style={{
            width: "100%",
            padding: "8px 12px",
            border: "none",
            borderRadius: "20px",
            background: "rgba(255, 255, 255, 0.9)",
            fontSize: "14px",
            color: "#333",
            outline: "none",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.1)",
          }}
        />
      </div>

      {/* Emoji grid - scrollable area */}
      <div
        style={{
          flex: "1 1 0",
          minHeight: 0,
          overflowY: "scroll",
          overflowX: "hidden",
          padding: "4px 8px",
          background: "rgba(255, 255, 255, 0.3)",
        }}
      >
        {search.trim() && filteredEmojis.length === 0 && (
          <p style={{ fontSize: "13px", color: "#666", textAlign: "center", padding: "20px 0" }}>
            No emojis found
          </p>
        )}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 44px)",
            gap: "2px",
            justifyContent: "center",
          }}
        >
          {filteredEmojis.map((emoji, idx) => (
            <button
              key={`${emoji.emoji}-${idx}`}
              type="button"
              onClick={() => handleEmojiClick(emoji.emoji)}
              style={{
                width: "44px",
                height: "44px",
                padding: 0,
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
                background: "transparent",
                fontSize: "28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 0.1s",
                flexShrink: 0,
              }}
              title={emoji.description}
              onMouseOver={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.6)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {emoji.emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Category bar at bottom */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-around",
          padding: "6px 8px",
          background: "rgba(255, 255, 255, 0.5)",
          borderTop: "1px solid rgba(0, 0, 0, 0.1)",
        }}
      >
        {EMOJI_CATEGORIES.map((cat) => (
          <button
            key={cat.name}
            type="button"
            onClick={() => {
              setActiveCategory(cat.name);
              setSearch("");
            }}
            style={{
              width: "40px",
              height: "36px",
              padding: 0,
              borderRadius: "6px",
              border: "none",
              cursor: "pointer",
              background: activeCategory === cat.name && !search.trim() ? "rgba(255, 255, 255, 0.8)" : "transparent",
              fontSize: "22px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.15s",
              boxShadow: activeCategory === cat.name && !search.trim() ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
            }}
            title={cat.name}
            onMouseOver={(e) => {
              if (activeCategory !== cat.name || search.trim()) {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.5)";
              }
            }}
            onMouseOut={(e) => {
              if (activeCategory !== cat.name || search.trim()) {
                e.currentTarget.style.background = "transparent";
              }
            }}
          >
            {CategoryIcons[cat.name]}
          </button>
        ))}
      </div>
    </div>
  );
};

interface EmojiButtonProps {
  onSelect: (emoji: string) => void;
}

export const EmojiButton: React.FC<EmojiButtonProps> = ({ onSelect }) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const calculatePosition = () => {
    if (!buttonRef.current) return null;
    
    const rect = buttonRef.current.getBoundingClientRect();
    const pickerWidth = 352;
    const pickerHeight = 420;
    
    let left = rect.left;
    let top = rect.bottom + 4;
    
    // Adjust if picker would go off the right edge
    if (left + pickerWidth > window.innerWidth - 16) {
      left = window.innerWidth - pickerWidth - 16;
    }
    
    // Adjust if picker would go off the bottom edge - show above instead
    if (top + pickerHeight > window.innerHeight - 16) {
      top = rect.top - pickerHeight - 4;
    }
    
    // If showing above would put it off the top, just show at top of viewport
    if (top < 16) {
      top = 16;
    }
    
    // Ensure left doesn't go negative
    if (left < 16) left = 16;
    
    return { top, left };
  };

  const handleOpen = () => {
    if (!open) {
      const pos = calculatePosition();
      if (pos) {
        setPosition(pos);
        setOpen(true);
      }
    } else {
      setOpen(false);
    }
  };

  // Close on scroll
  useEffect(() => {
    if (!open) return;
    
    const handleScroll = () => {
      setOpen(false);
    };
    
    // Listen to scroll on window and any scrollable parent
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  // Close on window resize
  useEffect(() => {
    if (!open) return;
    
    const handleResize = () => {
      setOpen(false);
    };
    
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleOpen}
        className={`px-2.5 py-2 rounded-lg border transition-colors text-base flex items-center justify-center ${
          open
            ? "bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600"
            : "bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
        }`}
        title="Add emoji"
      >
        😀
      </button>
      {open && position && (
        <EmojiPickerPortal position={position}>
          <EmojiPicker
            onSelect={(emoji) => {
              onSelect(emoji);
              setOpen(false);
            }}
            onClose={() => setOpen(false)}
          />
        </EmojiPickerPortal>
      )}
    </>
  );
};

interface EmojiPickerPortalProps {
  children: React.ReactNode;
  position: { top: number; left: number };
}

const EmojiPickerPortal: React.FC<EmojiPickerPortalProps> = ({ children, position }) => {
  const [container] = useState(() => {
    const div = document.createElement("div");
    div.style.position = "fixed";
    div.style.top = `${position.top}px`;
    div.style.left = `${position.left}px`;
    div.style.zIndex = "9999";
    return div;
  });

  useEffect(() => {
    document.body.appendChild(container);
    return () => {
      document.body.removeChild(container);
    };
  }, [container]);

  useEffect(() => {
    container.style.top = `${position.top}px`;
    container.style.left = `${position.left}px`;
  }, [container, position]);

  return ReactDOM.createPortal(children, container);
};
