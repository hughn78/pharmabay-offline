import { useState, useRef, useCallback } from "react";
import { PageImageExtractorModal } from "./PageImageExtractorModal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Upload,
  ImageIcon,
  Link2,
  Globe,
  Code,
  Clipboard,
  Star,
  Trash2,
  CheckCircle,
  X,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  images: any[];
  productId: string;
}

type DetectedType = "file" | "image_url" | "page_url" | "html_snippet" | "unknown";

interface PendingItem {
  id: string;
  type: DetectedType;
  label: string;
  previewUrl?: string;
  file?: File;
  url?: string;
  extractedUrls?: string[];
  status: "pending" | "uploading" | "done" | "error";
}

function detectContentType(data: string): { type: DetectedType; value: string } {
  const trimmed = data.trim();

  // Image URL patterns
  const imageExts = /\.(jpg|jpeg|png|gif|webp|avif|bmp|svg)(\?.*)?$/i;
  if (/^https?:\/\//i.test(trimmed) && imageExts.test(trimmed)) {
    return { type: "image_url", value: trimmed };
  }

  // HTML snippet containing img tags
  if (/<img\s[^>]*src\s*=/i.test(trimmed)) {
    return { type: "html_snippet", value: trimmed };
  }

  // Generic URL (likely a product page)
  if (/^https?:\/\//i.test(trimmed)) {
    return { type: "page_url", value: trimmed };
  }

  return { type: "unknown", value: trimmed };
}

function extractImageUrlsFromHtml(html: string): string[] {
  const urls: string[] = [];
  const regex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const url = match[1];
    if (url && /^https?:\/\//i.test(url) && !/logo|icon|favicon|sprite|pixel|tracking/i.test(url)) {
      urls.push(url);
    }
  }
  return [...new Set(urls)];
}

export function UniversalImageIntake({ images, productId }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [manualUrl, setManualUrl] = useState("");
  const [extractorUrl, setExtractorUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const addPendingItem = useCallback((item: Omit<PendingItem, "id" | "status">) => {
    setPending((prev) => [
      ...prev,
      { ...item, id: crypto.randomUUID(), status: "pending" },
    ]);
  }, []);

  // ---- File handling ----
  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      Array.from(files).forEach((file) => {
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name} is not an image`);
          return;
        }
        const previewUrl = URL.createObjectURL(file);
        addPendingItem({
          type: "file",
          label: file.name,
          previewUrl,
          file,
        });
      });
    },
    [addPendingItem]
  );

  // ---- Drop handler ----
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      // 1. Files
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
        return;
      }

      // 2. HTML content (drag from browser)
      const html = e.dataTransfer.getData("text/html");
      if (html) {
        const urls = extractImageUrlsFromHtml(html);
        if (urls.length > 0) {
          urls.forEach((url) =>
            addPendingItem({ type: "image_url", label: url.split("/").pop() || "image", url, previewUrl: url })
          );
          return;
        }
        // If HTML but no images found, treat the whole snippet
        addPendingItem({ type: "html_snippet", label: "HTML snippet", extractedUrls: [] });
        toast.info("No image URLs found in dropped HTML");
        return;
      }

      // 3. Plain text (URL or text)
      const text = e.dataTransfer.getData("text/plain");
      if (text) {
        const { type, value } = detectContentType(text);
        if (type === "image_url") {
          addPendingItem({ type, label: value.split("/").pop() || "image", url: value, previewUrl: value });
        } else if (type === "page_url") {
          setExtractorUrl(value);
        } else {
          toast.info("Unsupported content", { description: "Drop image files, image URLs, or product page links" });
        }
        return;
      }

      toast.info("Could not detect content type from drop");
    },
    [handleFiles, addPendingItem]
  );

  // ---- Paste handler ----
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      // Clipboard images
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            handleFiles([file]);
            e.preventDefault();
            return;
          }
        }
      }

      // Clipboard text
      const text = e.clipboardData.getData("text/plain");
      if (text) {
        const { type, value } = detectContentType(text);
        if (type === "image_url") {
          addPendingItem({ type, label: value.split("/").pop() || "image", url: value, previewUrl: value });
          e.preventDefault();
        } else if (type === "page_url") {
          setExtractorUrl(value);
          e.preventDefault();
        }
        // If it's unknown text, let the paste proceed normally (e.g., in an input)
      }

      // Clipboard HTML
      const html = e.clipboardData.getData("text/html");
      if (html) {
        const urls = extractImageUrlsFromHtml(html);
        if (urls.length > 0) {
          urls.forEach((url) =>
            addPendingItem({ type: "image_url", label: url.split("/").pop() || "image", url, previewUrl: url })
          );
          e.preventDefault();
        }
      }
    },
    [handleFiles, addPendingItem]
  );

  // ---- Manual URL ----
  const handleManualUrl = useCallback(() => {
    if (!manualUrl.trim()) return;
    const { type, value } = detectContentType(manualUrl);
    if (type === "image_url") {
      addPendingItem({ type, label: value.split("/").pop() || "image", url: value, previewUrl: value });
    } else if (type === "page_url") {
      setExtractorUrl(value);
    } else {
      toast.error("Enter a valid image URL or product page URL");
      return;
    }
    setManualUrl("");
  }, [manualUrl, addPendingItem]);

  // ---- Upload a pending file to storage ----
  const uploadItem = useCallback(
    async (item: PendingItem) => {
      setPending((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, status: "uploading" as const } : p))
      );

      try {
        let originalUrl = item.url || "";
        let localStorageUrl = "";
        let localStoragePath = "";
        const sourceType = item.type === "file" ? "upload" : item.type === "image_url" ? "url" : "page";

        if (item.file) {
          const ext = item.file.name.split(".").pop() || "jpg";
          const path = `${productId}/${crypto.randomUUID()}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from("product-images")
            .upload(path, item.file, { contentType: item.file.type });
          if (uploadError) throw uploadError;

          const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
          localStorageUrl = urlData.publicUrl;
          localStoragePath = path;
        } else if (item.url) {
          // For URLs, store the original URL; server-side fetch can happen later
          originalUrl = item.url;
          localStorageUrl = item.url;
        }

        const currentImages = images.length;
        const { error: insertError } = await supabase.from("product_images").insert({
          product_id: productId,
          source_type: sourceType,
          original_url: originalUrl,
          local_storage_url: localStorageUrl,
          local_storage_path: localStoragePath || null,
          image_status: "candidate",
          is_primary: currentImages === 0,
          sort_order: currentImages,
          source_page_url: item.type === "page_url" ? item.url : null,
        });

        if (insertError) throw insertError;

        setPending((prev) =>
          prev.map((p) => (p.id === item.id ? { ...p, status: "done" as const } : p))
        );
        queryClient.invalidateQueries({ queryKey: ["product-images", productId] });
        toast.success(`Image added: ${item.label}`);
      } catch (err: any) {
        setPending((prev) =>
          prev.map((p) => (p.id === item.id ? { ...p, status: "error" as const } : p))
        );
        toast.error(`Failed: ${err.message}`);
      }
    },
    [productId, images.length, queryClient]
  );

  const uploadAll = useCallback(() => {
    const items = pending.filter((p) => p.status === "pending");
    items.forEach(uploadItem);
  }, [pending, uploadItem]);

  const removePending = (id: string) => {
    setPending((prev) => prev.filter((p) => p.id !== id));
  };

  // ---- Gallery actions ----
  const setPrimary = async (imageId: string) => {
    // Unset all primary first
    await supabase
      .from("product_images")
      .update({ is_primary: false })
      .eq("product_id", productId);
    await supabase
      .from("product_images")
      .update({ is_primary: true })
      .eq("id", imageId);
    queryClient.invalidateQueries({ queryKey: ["product-images", productId] });
    toast.success("Primary image set");
  };

  const approveForChannel = async (imageId: string, channel: "ebay" | "shopify", val: boolean) => {
    const update = channel === "ebay" ? { ebay_approved: val } : { shopify_approved: val };
    await supabase.from("product_images").update(update).eq("id", imageId);
    queryClient.invalidateQueries({ queryKey: ["product-images", productId] });
  };

  const setImageStatus = async (imageId: string, status: string) => {
    await supabase.from("product_images").update({ image_status: status }).eq("id", imageId);
    queryClient.invalidateQueries({ queryKey: ["product-images", productId] });
  };

  const typeIcon = (type: DetectedType) => {
    switch (type) {
      case "file": return <Upload className="h-3.5 w-3.5" />;
      case "image_url": return <Link2 className="h-3.5 w-3.5" />;
      case "page_url": return <Globe className="h-3.5 w-3.5" />;
      case "html_snippet": return <Code className="h-3.5 w-3.5" />;
      default: return <ImageIcon className="h-3.5 w-3.5" />;
    }
  };

  const typeLabel = (type: DetectedType) => {
    switch (type) {
      case "file": return "File";
      case "image_url": return "Image URL";
      case "page_url": return "Page URL";
      case "html_snippet": return "HTML";
      default: return "Unknown";
    }
  };

  return (
    <div className="space-y-4" onPaste={handlePaste}>
      {/* Drop Zone */}
      <div
        ref={dropZoneRef}
        className={`rounded-lg border-2 border-dashed transition-all cursor-pointer ${
          isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border hover:border-primary/40"
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => {
          if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
            setIsDragging(false);
          }
        }}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="py-10 text-center pointer-events-none">
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-40" />
          <p className="text-sm font-medium">Drop files, image links, or product page links here</p>
          <p className="text-xs text-muted-foreground mt-1.5">
            Supports: files • clipboard paste (Ctrl+V) • image URLs • HTML snippets • product page URLs
          </p>
          <div className="flex justify-center gap-3 mt-3">
            <Badge variant="outline" className="text-[10px] gap-1"><Upload className="h-2.5 w-2.5" /> Files</Badge>
            <Badge variant="outline" className="text-[10px] gap-1"><Clipboard className="h-2.5 w-2.5" /> Paste</Badge>
            <Badge variant="outline" className="text-[10px] gap-1"><Link2 className="h-2.5 w-2.5" /> URLs</Badge>
            <Badge variant="outline" className="text-[10px] gap-1"><Globe className="h-2.5 w-2.5" /> Pages</Badge>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />

      {/* Manual URL input */}
      <div className="flex gap-2">
        <Input
          value={manualUrl}
          onChange={(e) => setManualUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleManualUrl()}
          placeholder="Paste image or product page URL..."
          className="h-9 text-sm"
        />
        <Button size="sm" variant="secondary" onClick={handleManualUrl} className="shrink-0">
          <Link2 className="h-3.5 w-3.5 mr-1" /> Add URL
        </Button>
      </div>

      {/* Pending Queue */}
      {pending.length > 0 && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                Staging ({pending.filter((p) => p.status === "pending").length} ready)
              </Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[11px]"
                  onClick={() => setPending([])}
                >
                  Clear All
                </Button>
                <Button
                  size="sm"
                  className="h-6 text-[11px]"
                  onClick={uploadAll}
                  disabled={!pending.some((p) => p.status === "pending")}
                >
                  Import All
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {pending.map((item) => (
                <div
                  key={item.id}
                  className="relative rounded-md border overflow-hidden group"
                >
                  {/* Preview */}
                  <div className="aspect-square bg-muted flex items-center justify-center">
                    {item.previewUrl ? (
                      <img
                        src={item.previewUrl}
                        alt=""
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="text-center p-2">
                        {typeIcon(item.type)}
                        <p className="text-[10px] text-muted-foreground mt-1 truncate max-w-full px-1">
                          {item.label}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Status overlay */}
                  {item.status === "uploading" && (
                    <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    </div>
                  )}
                  {item.status === "done" && (
                    <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                      <CheckCircle className="h-5 w-5 text-emerald-500" />
                    </div>
                  )}
                  {item.status === "error" && (
                    <div className="absolute inset-0 bg-destructive/10 flex items-center justify-center">
                      <X className="h-5 w-5 text-destructive" />
                    </div>
                  )}

                  {/* Type badge + actions */}
                  <div className="absolute top-1 left-1">
                    <Badge variant="secondary" className="text-[9px] gap-0.5 py-0 h-4">
                      {typeIcon(item.type)} {typeLabel(item.type)}
                    </Badge>
                  </div>
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                    {item.status === "pending" && (
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-5 w-5"
                        onClick={() => uploadItem(item)}
                      >
                        <Upload className="h-2.5 w-2.5" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-5 w-5"
                      onClick={() => removePending(item.id)}
                    >
                      <X className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing Gallery */}
      {images.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No images yet. Drop, paste, or add URLs above.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {images.map((img: any) => (
            <Card key={img.id} className="overflow-hidden group relative">
              <div className="aspect-square bg-muted flex items-center justify-center">
                {img.local_storage_url || img.original_url ? (
                  <img
                    src={img.local_storage_url || img.original_url}
                    alt={img.alt_text || "Product image"}
                    className="object-contain w-full h-full"
                  />
                ) : (
                  <ImageIcon className="h-8 w-8 text-muted-foreground opacity-30" />
                )}
              </div>
              <CardContent className="p-2 space-y-1.5">
                <div className="flex items-center gap-1 flex-wrap">
                  {img.is_primary && (
                    <Badge className="text-[9px] gap-0.5">
                      <Star className="h-2 w-2" /> Primary
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className={`text-[9px] cursor-pointer ${
                      img.image_status === "approved"
                        ? "border-emerald-400 text-emerald-600"
                        : img.image_status === "rejected"
                        ? "border-destructive text-destructive"
                        : ""
                    }`}
                    onClick={() =>
                      setImageStatus(
                        img.id,
                        img.image_status === "approved" ? "candidate" : "approved"
                      )
                    }
                  >
                    {img.image_status || "candidate"}
                  </Badge>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant={img.ebay_approved ? "default" : "outline"}
                    className="h-5 text-[9px] px-1.5 flex-1"
                    onClick={() => approveForChannel(img.id, "ebay", !img.ebay_approved)}
                  >
                    eBay
                  </Button>
                  <Button
                    size="sm"
                    variant={img.shopify_approved ? "default" : "outline"}
                    className="h-5 text-[9px] px-1.5 flex-1"
                    onClick={() => approveForChannel(img.id, "shopify", !img.shopify_approved)}
                  >
                    Shopify
                  </Button>
                </div>

                {/* Hover actions */}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!img.is_primary && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 text-[9px] px-1.5 flex-1"
                      onClick={() => setPrimary(img.id)}
                    >
                      <Star className="h-2.5 w-2.5 mr-0.5" /> Set Primary
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 text-[9px] px-1.5 text-destructive"
                    onClick={() => setImageStatus(img.id, "rejected")}
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Page Image Extractor Modal */}
      <PageImageExtractorModal
        open={!!extractorUrl}
        onOpenChange={(open) => !open && setExtractorUrl(null)}
        pageUrl={extractorUrl || ""}
        productId={productId}
        existingImageCount={images.length}
      />
    </div>
  );
}
