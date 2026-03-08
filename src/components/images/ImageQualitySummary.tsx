import { Badge } from "@/components/ui/badge";
import { ImageIcon, Crown, Loader2 } from "lucide-react";
import type { ImageMeta } from "@/hooks/useImageDimensions";

interface Props {
  images: any[];
  metas: Map<string, ImageMeta>;
  detecting: boolean;
  bestImageId: string | null;
}

export function ImageQualitySummary({ images, metas, detecting, bestImageId }: Props) {
  if (!images.length) return null;

  const bestMeta = bestImageId ? metas.get(bestImageId) : null;
  const bestImage = bestImageId ? images.find((i: any) => i.id === bestImageId) : null;
  const primaryImage = images.find((i: any) => i.is_primary);

  let sourceLabel = "";
  if (bestImage?.source_page_url) {
    try {
      sourceLabel = new URL(bestImage.source_page_url).hostname;
    } catch {
      sourceLabel = "extracted page";
    }
  } else if (bestImage?.source_type === "upload") {
    sourceLabel = "upload";
  } else {
    sourceLabel = bestImage?.source_type || "";
  }

  return (
    <div className="rounded-lg border bg-card p-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{images.length} image{images.length !== 1 ? "s" : ""}</span>
          {detecting && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        {primaryImage && (
          <Badge variant="outline" className="text-[10px]">
            Primary: {primaryImage.alt_text || "Image #" + (images.indexOf(primaryImage) + 1)}
          </Badge>
        )}
      </div>

      {bestMeta && bestMeta.width && bestMeta.height && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Crown className="h-3 w-3 text-primary" />
          <span>
            Recommended: <strong className="text-foreground">{bestMeta.width} × {bestMeta.height} px</strong>
            {sourceLabel && <> from {sourceLabel}</>}
          </span>
        </div>
      )}
    </div>
  );
}
