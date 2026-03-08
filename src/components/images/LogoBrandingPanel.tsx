import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Upload, X, Eye, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  images: any[];
  productId: string;
  selectedImageIds: string[];
}

interface LogoSettings {
  logoUrl: string | null;
  logoFile: File | null;
  enabled: boolean;
  sizePercent: number; // 5-25, default 16
  paddingPercent: number; // 1-10, default 3
  opacity: number; // 10-100, default 95
}

const DEFAULT_SETTINGS: LogoSettings = {
  logoUrl: null,
  logoFile: null,
  enabled: true,
  sizePercent: 16,
  paddingPercent: 3,
  opacity: 95,
};

function compositeImage(
  baseUrl: string,
  logoUrl: string,
  settings: LogoSettings
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const baseImg = new Image();
    baseImg.crossOrigin = "anonymous";
    const logoImg = new Image();
    logoImg.crossOrigin = "anonymous";

    let baseLoaded = false;
    let logoLoaded = false;

    function tryComposite() {
      if (!baseLoaded || !logoLoaded) return;

      const canvas = document.createElement("canvas");
      canvas.width = baseImg.naturalWidth;
      canvas.height = baseImg.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No canvas context"));

      // Draw base
      ctx.drawImage(baseImg, 0, 0);

      // Calculate logo dimensions
      const maxLogoW = canvas.width * (settings.sizePercent / 100);
      const maxArea = canvas.width * canvas.height / 9;
      const logoRatio = logoImg.naturalWidth / logoImg.naturalHeight;

      let logoW = maxLogoW;
      let logoH = logoW / logoRatio;

      // Enforce area cap
      if (logoW * logoH > maxArea) {
        const scale = Math.sqrt(maxArea / (logoW * logoH));
        logoW *= scale;
        logoH *= scale;
      }

      const padding = canvas.width * (settings.paddingPercent / 100);
      const x = canvas.width - logoW - padding;
      const y = canvas.height - logoH - padding;

      ctx.globalAlpha = settings.opacity / 100;
      ctx.drawImage(logoImg, x, y, logoW, logoH);
      ctx.globalAlpha = 1;

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
        "image/png",
        0.95
      );
    }

    baseImg.onload = () => { baseLoaded = true; tryComposite(); };
    baseImg.onerror = () => reject(new Error("Base image load failed"));
    logoImg.onload = () => { logoLoaded = true; tryComposite(); };
    logoImg.onerror = () => reject(new Error("Logo load failed"));

    baseImg.src = baseUrl;
    logoImg.src = logoUrl;
  });
}

export function LogoBrandingPanel({ images, productId, selectedImageIds }: Props) {
  const [settings, setSettings] = useState<LogoSettings>(DEFAULT_SETTINGS);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewImageId, setPreviewImageId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Load persisted logo from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("pharmabay_logo_url");
    if (saved) setSettings((s) => ({ ...s, logoUrl: saved }));
  }, []);

  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    const url = URL.createObjectURL(file);
    setSettings((s) => ({ ...s, logoUrl: url, logoFile: file, enabled: true }));
    localStorage.setItem("pharmabay_logo_url", url);
  }, []);

  const removeLogo = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    setPreviewUrl(null);
    localStorage.removeItem("pharmabay_logo_url");
  }, []);

  // Generate preview
  const generatePreview = useCallback(async () => {
    const targetId = selectedImageIds[0] || images.find((i: any) => i.is_primary)?.id || images[0]?.id;
    if (!targetId || !settings.logoUrl) return;
    const img = images.find((i: any) => i.id === targetId);
    if (!img) return;
    const baseUrl = img.local_storage_url || img.original_url;
    if (!baseUrl) return;

    try {
      const blob = await compositeImage(baseUrl, settings.logoUrl, settings);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPreviewImageId(targetId);
    } catch (err: any) {
      toast.error("Preview failed: " + err.message);
    }
  }, [images, selectedImageIds, settings]);

  // Apply branding to selected images
  const applyBranding = useCallback(async () => {
    if (!settings.logoUrl) return;
    const targets = selectedImageIds.length > 0
      ? images.filter((i: any) => selectedImageIds.includes(i.id))
      : images.filter((i: any) => i.image_status !== "rejected");

    if (!targets.length) {
      toast.error("No images to apply branding to");
      return;
    }

    setApplying(true);
    let success = 0;

    for (const img of targets) {
      const baseUrl = img.local_storage_url || img.original_url;
      if (!baseUrl) continue;

      try {
        const blob = await compositeImage(baseUrl, settings.logoUrl!, settings);
        const ext = "png";
        const path = `${productId}/branded_${img.id.slice(0, 8)}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(path, blob, { contentType: "image/png", upsert: true });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);

        // Insert as a derived image
        await supabase.from("product_images").insert({
          product_id: productId,
          source_type: "branded",
          original_url: img.original_url,
          local_storage_url: urlData.publicUrl,
          local_storage_path: path,
          image_status: "candidate",
          is_primary: false,
          sort_order: (img.sort_order ?? 0) + 0.5,
          source_page_url: img.source_page_url,
          alt_text: (img.alt_text || "") + " (branded)",
        });

        success++;
      } catch (err: any) {
        console.error("Branding failed for", img.id, err);
      }
    }

    setApplying(false);
    if (success > 0) {
      queryClient.invalidateQueries({ queryKey: ["product-images", productId] });
      toast.success(`Branding applied to ${success} image${success !== 1 ? "s" : ""}`);
    } else {
      toast.error("Branding failed for all images");
    }
  }, [settings, images, selectedImageIds, productId, queryClient]);

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Logo Branding</Label>
          {settings.logoUrl && (
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Enabled</Label>
              <Switch
                checked={settings.enabled}
                onCheckedChange={(v) => setSettings((s) => ({ ...s, enabled: v }))}
              />
            </div>
          )}
        </div>

        {/* Logo upload / preview */}
        <div className="flex items-center gap-3">
          {settings.logoUrl ? (
            <div className="relative h-12 w-12 rounded border bg-muted flex items-center justify-center overflow-hidden">
              <img src={settings.logoUrl} alt="Logo" className="object-contain w-full h-full" />
            </div>
          ) : (
            <div className="h-12 w-12 rounded border-2 border-dashed border-border flex items-center justify-center">
              <Upload className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()}>
              {settings.logoUrl ? "Change Logo" : "Upload Logo PNG"}
            </Button>
            {settings.logoUrl && (
              <Button size="sm" variant="ghost" onClick={removeLogo}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/*"
            className="hidden"
            onChange={handleLogoUpload}
          />
        </div>

        {/* Controls - only show when logo is uploaded and enabled */}
        {settings.logoUrl && settings.enabled && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Size ({settings.sizePercent}%)</Label>
                <Slider
                  value={[settings.sizePercent]}
                  onValueChange={([v]) => setSettings((s) => ({ ...s, sizePercent: v }))}
                  min={5}
                  max={25}
                  step={1}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Padding ({settings.paddingPercent}%)</Label>
                <Slider
                  value={[settings.paddingPercent]}
                  onValueChange={([v]) => setSettings((s) => ({ ...s, paddingPercent: v }))}
                  min={1}
                  max={10}
                  step={1}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Opacity ({settings.opacity}%)</Label>
                <Slider
                  value={[settings.opacity]}
                  onValueChange={([v]) => setSettings((s) => ({ ...s, opacity: v }))}
                  min={10}
                  max={100}
                  step={5}
                />
              </div>
            </div>

            {/* Preview */}
            {previewUrl && (
              <div className="rounded-lg border overflow-hidden bg-muted">
                <img src={previewUrl} alt="Branded preview" className="w-full max-h-64 object-contain" />
                <div className="p-2 text-center">
                  <Badge variant="outline" className="text-[10px]">Preview — bottom-right placement</Badge>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={generatePreview} className="gap-1">
                <Eye className="h-3.5 w-3.5" /> Preview
              </Button>
              <Button
                size="sm"
                onClick={applyBranding}
                disabled={applying}
                className="gap-1"
              >
                {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {selectedImageIds.length > 0
                  ? `Apply to ${selectedImageIds.length} image${selectedImageIds.length !== 1 ? "s" : ""}`
                  : "Apply to all images"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
