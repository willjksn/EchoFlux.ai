import React, { useEffect, useRef } from "react";

type Props = {
  stream: MediaStream | null;
  className?: string;
  barColor?: string;
};

/**
 * Live input level bars. Uses time-domain samples (works better for voice than frequency bins).
 */
export const AudioLevelMeter: React.FC<Props> = ({
  stream,
  className = "",
  barColor = "var(--fan-primary, #6366f1)",
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!stream || !canvas) return;
    const tracks = stream.getAudioTracks();
    if (tracks.length === 0) return;

    let cancelled = false;
    const Ctx =
      typeof window !== "undefined"
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (!Ctx) return;

    const audioCtx = new Ctx();
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let gain: GainNode | null = null;

    const startGraph = () => {
      if (cancelled) return;
      source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.35;
      gain = audioCtx.createGain();
      gain.gain.value = 0;
      source.connect(analyser);
      analyser.connect(gain);
      gain.connect(audioCtx.destination);

      const timeData = new Uint8Array(analyser.fftSize);
      const bars = 16;
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

      const draw = () => {
        if (cancelled || !analyser) return;
        const c = canvasRef.current;
        if (!c) return;
        const w = c.clientWidth || 200;
        const h = c.clientHeight || 36;
        const bw = Math.floor(w * dpr);
        const bh = Math.floor(h * dpr);
        if (c.width !== bw || c.height !== bh) {
          c.width = bw;
          c.height = bh;
        }
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        analyser.getByteTimeDomainData(timeData);
        const step = Math.max(1, Math.floor(timeData.length / bars));

        for (let i = 0; i < bars; i++) {
          let peak = 0;
          for (let j = 0; j < step; j++) {
            const v = (timeData[i * step + j] ?? 128) - 128;
            peak = Math.max(peak, Math.abs(v));
          }
          const level = peak / 128;
          const barHeight = Math.max(3, level * h * 1.1);
          const barW = (w - 2 * (bars - 1)) / bars;
          const x = i * (barW + 2);
          const y = h - barHeight;
          ctx.fillStyle = barColor;
          ctx.beginPath();
          if (typeof ctx.roundRect === "function") {
            ctx.roundRect(x, y, barW, barHeight, 2);
          } else {
            ctx.rect(x, y, barW, barHeight);
          }
          ctx.fill();
        }

        rafRef.current = requestAnimationFrame(draw);
      };

      draw();
    };

    const resume = async () => {
      try {
        if (audioCtx.state === "suspended") {
          await audioCtx.resume();
        }
      } catch {
        /* autoplay policy — meter may stay flat until next gesture */
      }
      startGraph();
    };
    void resume();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      try {
        source?.disconnect();
        analyser?.disconnect();
        gain?.disconnect();
      } catch {
        /* ignore */
      }
      void audioCtx.close();
    };
  }, [stream, barColor]);

  if (!stream?.getAudioTracks().length) return null;

  return (
    <div
      className={`rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 px-2 py-1.5 ${className}`}
    >
      <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1 font-medium">
        Input level
      </p>
      <canvas ref={canvasRef} className="w-full h-9 block" style={{ minHeight: 36 }} aria-hidden />
    </div>
  );
};
