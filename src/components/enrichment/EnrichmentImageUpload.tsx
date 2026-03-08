import { useState, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Star, Trash2, ImageIcon, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const MAX_IMAGES = 12;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_FORMATS = ["image/jpeg", "image/png", "image/webp", "image/gif"];

interface Props {
  productId: string;
}

interface UploadingFile {
  id: string;
  file: File;
  previewUrl: string;
  status: "uploading" | "done" | "error";
  error?: string;
}

export function EnrichmentImageUpload({ productId }: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState<UploadingFile[]>([]);

  const { data: images = [] } = useQuery({
    queryKey: ["product-images", productId],
    queryFn: async () => {
      const { data } = await supabase
        .from("product_images")
        .select("*")
        .eq("product_id", productId)
        .order("is_primary", { ascending: false })
        .order("sort_order");
      return data || [];
    },
  });

  const totalCount = images.length + uploading.filter((u) => u.status === "uploading").length;

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_FORMATS.includes(file.type)) {
      return "Unsupported format — please use JPG, PNG, WEBP or GIF";
    }
    if (file.size > MAX_FILE_SIZE) {
      return "File too large — max 5MB per image";
    }
    return null;
  };

  const uploadFile = useCallback(async (file: File) => {
    const id = crypto.randomUUID();
    const previewUrl = URL.createObjectURL(file);

    const error = validateFile(file);
    if (error) {
      toast.error(error);
      return;
    }

    if (totalCount >= MAX_IMAGES) {
      toast.error(`Maximum ${MAX_IMAGES} images allowed`);
      return;
    }

    setUploading((prev) => [...prev, { id, file, previewUrl, status: "uploading" }]);

    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${productId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);

      const currentCount = images.length;
      const { error: insertError } = await supabase.from("product_images").insert({
        product_id: productId,
        source_type: "upload",
        original_url: urlData.publicUrl,
        local_storage_url: urlData.publicUrl,
        local_storage_path: path,
        image_status: "approved",
        is_primary: currentCount === 0,
        sort_order: currentCount,
        ebay_approved: true,
        shopify_approved: true,
      });
      if (insertError) throw insertError;

      setUploading((prev) => prev.map((u) => u.id === id ? { ...u, status: "done" } : u));
      queryClient.invalidateQueries({ queryKey: ["product-images", productId] });

      // Clear done items after a delay
      setTimeout(() => {
        setUploading((prev) => prev.filter((u) => u.id !== id));
      }, 1500);
    } catch (err: any) {
      setUploading((prev) => prev.map((u) => u.id === id ? { ...u, status: "error", error: err.message } : u));
      toast.error(`Upload failed: ${err.message}`);
    }
  }, [productId, images.length, totalCount, queryClient]);

  const handleFiles = useCallback((files: FileList | File[]) => {
    Array.from(files).forEach((file) => uploadFile(file));
  }, [uploadFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const setPrimary = async (imageId: string) => {
    await supabase.from("product_images").update({ is_primary: false }).eq("product_id", productId);
    await supabase.from("product_images").update({ is_primary: true }).eq("id", imageId);
    queryClient.invalidateQueries({ queryKey: ["product-images", productId] });
    toast.success("Primary image set");
  };

  const removeImage = async (imageId: string, storagePath?: string) => {
    if (storagePath) {
      await supabase.storage.from("product-images").remove([storagePath]);
    }
    await supabase.from("product_images").update({ image_status: "rejected" }).eq("id", imageId);
    queryClient.invalidateQueries({ queryKey: ["product-images", productId] });
    toast.success("Image removed");
  };

  const toggleChannel = async (imageId: string, channel: "ebay" | "shopify", current: boolean) => {
    const update = channel === "ebay" ? { ebay_approved: !current } : { shopify_approved: !current };
    await supabase.from("product_images").update(update).eq("id", imageId);
    queryClient.invalidateQueries({ queryKey: ["product-images", productId] });
  };

  const activeImages = images.filter((img: any) => img.image_status !== "rejected");

  return (
    <Card>
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Product Images</h3>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {activeImages.length} of {MAX_IMAGES} images used
          </Badge>
        </div>

        {/* Drop zone */}
        <div
          className={`rounded-lg border-2 border-dashed transition-all cursor-pointer ${
            isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="py-8 text-center pointer-events-none">
            <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground opacity-40" />
            <p className="text-sm font-medium">Upload Your Own Images</p>
            <p className="text-xs text-muted-foreground mt-1">
              Drag & drop or click to browse • JPG, PNG, WEBP, GIF • Max 5MB each
            </p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.gif"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />

        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="w-full"
        >
          <Upload className="h-3.5 w-3.5 mr-1.5" /> Browse Files
        </Button>

        {/* Uploading items */}
        {uploading.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {uploading.map((item) => (
              <div key={item.id} className="relative rounded-md border overflow-hidden">
                <div className="aspect-square bg-muted">
                  <img src={item.previewUrl} alt="" className="w-full h-full object-contain" />
                </div>
                <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                  {item.status === "uploading" && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                  {item.status === "done" && <Badge className="text-[9px]">✓</Badge>}
                  {item.status === "error" && <X className="h-5 w-5 text-destructive" />}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Thumbnail grid */}
        {activeImages.length > 0 && (
          <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
            {activeImages.map((img: any) => (
              <div key={img.id} className="relative rounded-md border overflow-hidden group">
                <div className="aspect-square bg-muted flex items-center justify-center">
                  {img.local_storage_url || img.original_url ? (
                    <img
                      src={img.local_storage_url || img.original_url}
                      alt={img.alt_text || ""}
                      className="object-contain w-full h-full"
                    />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-muted-foreground opacity-30" />
                  )}
                </div>
                <div className="p-1.5 space-y-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    {img.is_primary && (
                      <Badge className="text-[8px] gap-0.5 py-0 h-4">
                        <Star className="h-2 w-2" /> Primary
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-0.5">
                    <Button
                      size="sm"
                      variant={img.ebay_approved ? "default" : "outline"}
                      className="h-5 text-[8px] px-1 flex-1"
                      onClick={() => toggleChannel(img.id, "ebay", img.ebay_approved)}
                    >
                      eBay
                    </Button>
                    <Button
                      size="sm"
                      variant={img.shopify_approved ? "default" : "outline"}
                      className="h-5 text-[8px] px-1 flex-1"
                      onClick={() => toggleChannel(img.id, "shopify", img.shopify_approved)}
                    >
                      Shopify
                    </Button>
                  </div>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!img.is_primary && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 text-[8px] px-1 flex-1"
                        onClick={() => setPrimary(img.id)}
                      >
                        <Star className="h-2 w-2 mr-0.5" /> Set Primary
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 text-[8px] px-1 text-destructive"
                      onClick={() => removeImage(img.id, img.local_storage_path)}
                    >
                      <Trash2 className="h-2 w-2" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
