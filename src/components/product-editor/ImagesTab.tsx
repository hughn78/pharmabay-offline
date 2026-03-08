import { useState, useMemo } from "react";
import { UniversalImageIntake } from "@/components/images/UniversalImageIntake";
import { ImageQualitySummary } from "@/components/images/ImageQualitySummary";
import { ImageSortControls, SortMode } from "@/components/images/ImageSortControls";
import { LogoBrandingPanel } from "@/components/images/LogoBrandingPanel";
import { useImageDimensions } from "@/hooks/useImageDimensions";

interface ImagesTabProps {
  images: Record<string, unknown>[];
  productId: string;
}

export function ImagesTab({ images, productId }: ImagesTabProps) {
  const [sortMode, setSortMode] = useState<SortMode>("quality");
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const { metas, detecting, bestImageId } = useImageDimensions(images as any[], productId);

  const sortedImages = useMemo(() => {
    const arr = [...images] as any[];
    switch (sortMode) {
      case "quality":
        return arr.sort((a, b) => {
          const sa = metas.get(a.id)?.qualityScore ?? 0;
          const sb = metas.get(b.id)?.qualityScore ?? 0;
          return sb - sa;
        });
      case "dimensions":
        return arr.sort((a, b) => {
          const ma = metas.get(a.id);
          const mb = metas.get(b.id);
          const pa = (ma?.width ?? 0) * (ma?.height ?? 0);
          const pb = (mb?.width ?? 0) * (mb?.height ?? 0);
          return pb - pa;
        });
      case "recent":
        return arr.sort((a, b) => {
          const da = new Date(a.created_at || 0).getTime();
          const db = new Date(b.created_at || 0).getTime();
          return db - da;
        });
      default:
        return arr;
    }
  }, [images, sortMode, metas]);

  return (
    <div className="space-y-4">
      {/* Quality summary */}
      <ImageQualitySummary
        images={images as any[]}
        metas={metas}
        detecting={detecting}
        bestImageId={bestImageId}
      />

      {/* Sort controls */}
      {images.length > 1 && (
        <div className="flex items-center justify-between">
          <ImageSortControls current={sortMode} onChange={setSortMode} />
        </div>
      )}

      {/* Logo branding */}
      <LogoBrandingPanel
        images={images as any[]}
        productId={productId}
        selectedImageIds={selectedImageIds}
      />

      {/* Main intake + gallery */}
      <UniversalImageIntake
        images={sortedImages}
        productId={productId}
        metas={metas}
        bestImageId={bestImageId}
        selectedImageIds={selectedImageIds}
        onToggleSelect={(id) => {
          setSelectedImageIds((prev) =>
            prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
          );
        }}
      />
    </div>
  );
}
