import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ImageMeta {
  id: string;
  width: number | null;
  height: number | null;
  megapixels: number | null;
  aspectRatio: string | null;
  fileSize: number | null;
  qualityScore: number;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function getAspectRatio(w: number, h: number): string {
  const d = gcd(w, h);
  const rw = w / d;
  const rh = h / d;
  if (rw > 20 || rh > 20) {
    const ratio = w / h;
    if (Math.abs(ratio - 1) < 0.05) return "1:1";
    if (Math.abs(ratio - 4 / 3) < 0.1) return "4:3";
    if (Math.abs(ratio - 16 / 9) < 0.1) return "16:9";
    if (Math.abs(ratio - 3 / 2) < 0.1) return "3:2";
    return `${(w / h).toFixed(2)}:1`;
  }
  return `${rw}:${rh}`;
}

function computeQualityScore(w: number | null, h: number | null): number {
  if (!w || !h) return 0;
  const pixels = w * h;
  // Penalise tiny images heavily
  if (pixels < 10000) return 1; // < 100×100
  if (pixels < 40000) return 10; // < 200×200
  if (pixels < 160000) return 30; // < 400×400
  if (pixels < 640000) return 60; // < 800×800
  return Math.min(100, Math.round(Math.sqrt(pixels) / 20));
}

function detectDimensionsFromUrl(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timeout = setTimeout(() => {
      img.src = "";
      reject(new Error("timeout"));
    }, 8000);
    img.onload = () => {
      clearTimeout(timeout);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("load error"));
    };
    img.src = url;
  });
}

export function useImageDimensions(images: any[], productId: string) {
  const [metas, setMetas] = useState<Map<string, ImageMeta>>(new Map());
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    if (!images.length) {
      setMetas(new Map());
      return;
    }

    let cancelled = false;
    setDetecting(true);

    async function detect() {
      const newMetas = new Map<string, ImageMeta>();

      await Promise.allSettled(
        images.map(async (img: any) => {
          let w = img.width as number | null;
          let h = img.height as number | null;

          // Try detecting if not stored
          if (!w || !h) {
            const url = img.local_storage_url || img.original_url;
            if (url) {
              try {
                const dims = await detectDimensionsFromUrl(url);
                w = dims.width;
                h = dims.height;
                // Persist to DB (fire-and-forget)
                supabase
                  .from("product_images")
                  .update({ width: w, height: h })
                  .eq("id", img.id)
                  .then();
              } catch {
                // Dimension detection failed, leave null
              }
            }
          }

          if (cancelled) return;

          const mp = w && h ? parseFloat(((w * h) / 1_000_000).toFixed(2)) : null;
          const ar = w && h ? getAspectRatio(w, h) : null;
          const score = computeQualityScore(w, h);

          newMetas.set(img.id, {
            id: img.id,
            width: w,
            height: h,
            megapixels: mp,
            aspectRatio: ar,
            fileSize: null, // file size not available from client-side load
            qualityScore: score,
          });
        })
      );

      if (!cancelled) {
        setMetas(newMetas);
        setDetecting(false);
      }
    }

    detect();
    return () => { cancelled = true; };
  }, [images, productId]);

  const bestImageId = (() => {
    let best: string | null = null;
    let bestScore = -1;
    metas.forEach((m) => {
      if (m.qualityScore > bestScore) {
        bestScore = m.qualityScore;
        best = m.id;
      }
    });
    return best;
  })();

  return { metas, detecting, bestImageId };
}
