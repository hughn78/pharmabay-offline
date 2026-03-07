import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Globe, ImageIcon, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface ExtractedImage {
  url: string;
  source: string;
  score: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageUrl: string;
  productId: string;
  existingImageCount: number;
}

export function PageImageExtractorModal({
  open,
  onOpenChange,
  pageUrl,
  productId,
  existingImageCount,
}: Props) {
  const [images, setImages] = useState<ExtractedImage[]>([]);
  const [pageTitle, setPageTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [fetched, setFetched] = useState(false);
  const queryClient = useQueryClient();

  const fetchImages = async () => {
    setIsLoading(true);
    setError("");
    setImages([]);
    setSelected(new Set());

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "extract-page-images",
        { body: { url: pageUrl } }
      );

      if (fnError) throw new Error(fnError.message);
      if (!data?.success) throw new Error(data?.error || "Extraction failed");

      setImages(data.images || []);
      setPageTitle(data.pageTitle || "");
      setFetched(true);

      // Auto-select top-scored images (score >= 70)
      const autoSelect = new Set<string>();
      (data.images || []).forEach((img: ExtractedImage) => {
        if (img.score >= 70) autoSelect.add(img.url);
      });
      setSelected(autoSelect);

      if ((data.images || []).length === 0) {
        toast.info("No product images found on this page");
      }
    } catch (err: any) {
      setError(err.message);
      toast.error("Failed to extract images: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch when opened
  const handleOpenChange = (val: boolean) => {
    if (val && !fetched && !isLoading) {
      fetchImages();
    }
    if (!val) {
      setFetched(false);
      setImages([]);
      setSelected(new Set());
    }
    onOpenChange(val);
  };

  const toggleSelect = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === images.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(images.map((i) => i.url)));
    }
  };

  const importSelected = async () => {
    if (selected.size === 0) return;
    setImporting(true);

    try {
      const urls = images.filter((i) => selected.has(i.url));
      let sortOrder = existingImageCount;

      for (const img of urls) {
        const { error: insertError } = await supabase.from("product_images").insert({
          product_id: productId,
          source_type: "page_extract",
          source_page_url: pageUrl,
          original_url: img.url,
          local_storage_url: img.url,
          image_status: "candidate",
          is_primary: sortOrder === 0,
          sort_order: sortOrder,
        });
        if (insertError) console.error("Insert error:", insertError);
        sortOrder++;
      }

      queryClient.invalidateQueries({ queryKey: ["product-images", productId] });
      toast.success(`Imported ${selected.size} images`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Import failed: " + err.message);
    } finally {
      setImporting(false);
    }
  };

  const sourceBadge = (source: string) => {
    const colors: Record<string, string> = {
      "og:image": "bg-blue-500/15 text-blue-700 border-blue-300",
      "twitter:image": "bg-sky-500/15 text-sky-700 border-sky-300",
      "json-ld": "bg-purple-500/15 text-purple-700 border-purple-300",
      "img-tag": "",
      "srcset": "bg-amber-500/15 text-amber-700 border-amber-300",
      "lazy-load": "bg-amber-500/15 text-amber-700 border-amber-300",
    };
    return (
      <Badge variant="outline" className={`text-[9px] ${colors[source] || ""}`}>
        {source}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" /> Extract Images from Page
          </DialogTitle>
          <DialogDescription className="truncate">
            {pageUrl}
            {pageTitle && <span className="ml-2 text-xs">— {pageTitle}</span>}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Fetching and analyzing page...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchImages}>
              Retry
            </Button>
          </div>
        ) : images.length === 0 && fetched ? (
          <div className="text-center py-12">
            <ImageIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">No product images found on this page.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selected.size === images.length && images.length > 0}
                  onCheckedChange={selectAll}
                />
                <span className="text-xs text-muted-foreground">
                  {selected.size} of {images.length} selected
                </span>
              </div>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={fetchImages}>
                Re-scan
              </Button>
            </div>

            <ScrollArea className="flex-1 max-h-[50vh]">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-1">
                {images.map((img) => {
                  const isSelected = selected.has(img.url);
                  return (
                    <div
                      key={img.url}
                      className={`relative rounded-lg border-2 overflow-hidden cursor-pointer transition-all ${
                        isSelected
                          ? "border-primary ring-1 ring-primary/30"
                          : "border-transparent hover:border-muted-foreground/20"
                      }`}
                      onClick={() => toggleSelect(img.url)}
                    >
                      <div className="aspect-square bg-muted flex items-center justify-center">
                        <img
                          src={img.url}
                          alt=""
                          className="w-full h-full object-contain"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </div>

                      {/* Selection check */}
                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}

                      {/* Source badge */}
                      <div className="absolute bottom-1 left-1">
                        {sourceBadge(img.source)}
                      </div>

                      {/* Score indicator */}
                      <div className="absolute top-1.5 left-1.5">
                        <Badge
                          variant="secondary"
                          className={`text-[9px] py-0 h-4 ${
                            img.score >= 70
                              ? "bg-emerald-500/20 text-emerald-700"
                              : img.score >= 40
                              ? "bg-amber-500/20 text-amber-700"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {img.score}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={importSelected}
            disabled={selected.size === 0 || importing}
          >
            {importing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                Importing...
              </>
            ) : (
              `Import ${selected.size} Image${selected.size !== 1 ? "s" : ""}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
