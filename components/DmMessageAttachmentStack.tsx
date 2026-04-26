import React from "react";
import type { DmAttachmentItem } from "../src/lib/fanDmAttachments";
import { DmAudioPlayer } from "./DmAudioPlayer";
import { inferIsAudioFromUrl } from "../src/lib/mediaUrlInfer";

type Props = { attachments: DmAttachmentItem[] };

const dmImageDownloadGuardProps = {
  draggable: false as const,
  onContextMenu: (e: React.MouseEvent<HTMLImageElement>) => e.preventDefault(),
};

const dmVideoDownloadGuardProps = {
  controlsList: "nodownload noplaybackrate noremoteplayback" as const,
  disablePictureInPicture: true,
  onContextMenu: (e: React.MouseEvent<HTMLVideoElement>) => e.preventDefault(),
};

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
            <div key={key} className="fh-dm-attachment fh-dm-attachment--protected">
              <img src={a.url} alt="" loading="lazy" {...dmImageDownloadGuardProps} />
            </div>
          );
        }
        return (
          <div key={key} className="fh-dm-attachment fh-dm-attachment--protected">
            <video src={a.url} controls playsInline preload="metadata" {...dmVideoDownloadGuardProps} />
          </div>
        );
      })}
    </div>
  );
};
