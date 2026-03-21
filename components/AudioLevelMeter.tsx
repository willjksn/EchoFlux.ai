import React, { useEffect, useRef } from "react";

type Props = {
  stream: MediaStream | null;
  className?: string;
  barColor?: string;
};

/**
 * Live frequency bars. Resumes AudioContext + silent gain → Safari pumps the graph.
 */
export const AudioLevelMeter: React.FC<Props> = ({
  stream,
  className = "",
  barColor = "var(--accent, #db2777)",
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!stream || !canvas) return;
    if (stream.getAudioTracks().length === 0) return;

    let cancelled = false;
    const audioCtx = new AudioContext();
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let gain: GainNode | null = null;

    const startGraph = () => {
      if (cancelled) return;
      source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.55;
      gain = audioCtx.createGain();
      gain.gain.value = 0;
      source.connect(analyser);
      analyser.connect(gain);
      gain.connect(audioCtx.destination);

      const data = new Uint8Array(analyser.frequencyBinCount);
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

        analyser.getByteFrequencyData(data);
        const step = Math.max(1, Math.floor(data.length / bars));
        const gap = 2;
        const barW = (w - gap * (bars - 1)) / bars;

        for (let i = 0; i < bars; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) {
            sum += data[i * step + j] ?? 0;
          }
          const avg = sum / step / 255;
          const barHeight = Math.max(3, avg * h * 1.45);
          const x = i * (barW + gap);
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

    void audioCtx.resume().then(startGraph).catch(startGraph);

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
    <div className={`rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 px-2 py-1.5 ${className}`}>
      <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1 font-medium">
        Input level
      </p>
      <canvas ref={canvasRef} className="w-full h-9 block" style={{ minHeight: 36 }} aria-hidden />
    </div>
  );
};
