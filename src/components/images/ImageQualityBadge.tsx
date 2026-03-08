import { Badge } from "@/components/ui/badge";
import { Crown, ImageIcon } from "lucide-react";
import type { ImageMeta } from "@/hooks/useImageDimensions";

interface Props {
  meta: ImageMeta | undefined;
  isBest: boolean;
}

export function ImageQualityBadge({ meta, isBest }: Props) {
  if (!meta) return null;

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 flex-wrap">
        {meta.width && meta.height ? (
          <span className="text-[10px] font-mono text-muted-foreground">
            {meta.width} × {meta.height} px
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground italic">Unknown size</span>
        )}
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {meta.megapixels !== null && (
          <Badge variant="outline" className="text-[9px] py-0 h-4 font-mono">
            {meta.megapixels} MP
          </Badge>
        )}
        {meta.aspectRatio && (
          <Badge variant="outline" className="text-[9px] py-0 h-4 font-mono">
            {meta.aspectRatio}
          </Badge>
        )}
        {isBest && (
          <Badge className="text-[9px] py-0 h-4 gap-0.5 bg-primary/90">
            <Crown className="h-2.5 w-2.5" /> Best
          </Badge>
        )}
      </div>
    </div>
  );
}
