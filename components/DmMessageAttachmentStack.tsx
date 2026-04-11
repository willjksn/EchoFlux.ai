import React from "react";
import type { DmAttachmentItem } from "../src/lib/fanDmAttachments";
import { DmAudioPlayer } from "./DmAudioPlayer";
import { inferIsAudioFromUrl } from "../src/lib/mediaUrlInfer";

type Props = { attachments: DmAttachmentItem[] };

/**
 * Renders image / video / voice attachments for a single fan DM bubble (supports multiple per message).
 */
export const DmMessageAttachmentStack: React.FC<Props> = ({ attachments }) => {
  if (!attachments.length) return null;
  return (
    <div className="fh-dm-attachments-stack space-y-2">
      {attachments.map((a, i) => {
        const key = `${a.url}-${i}`;
        const playAsAudio =
          a.type === "audio" ||
          (inferIsAudioFromUrl(a.url) && a.type !== "image" && a.type !== "video");
        if (playAsAudio) {
          return (
            <div key={key} className="fh-dm-attachment">
              <DmAudioPlayer src={a.url} variant="voiceNote" />
            </div>
          );
        }
        if (a.type === "image") {
          return (
            <div key={key} className="fh-dm-attachment">
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="fh-dm-attachment-link"
                aria-label="Open image in new tab"
              >
                <img src={a.url} alt="" loading="lazy" />
              </a>
            </div>
          );
        }
        return (
          <div key={key} className="fh-dm-attachment">
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="fh-dm-attachment-link"
              aria-label="Open video in new tab"
            >
              <video src={a.url} controls playsInline />
            </a>
          </div>
        );
      })}
    </div>
  );
};
