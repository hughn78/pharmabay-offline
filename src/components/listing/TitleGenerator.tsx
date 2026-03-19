import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Wand2, AlertTriangle, Copy } from "lucide-react";
import {
  generateTitle,
  extractTitleParts,
  type TitleParts,
} from "@/lib/listingBuilder";
import { toast } from "sonner";

interface TitleGeneratorProps {
  product: Record<string, unknown>;
  channel: "ebay" | "shopify";
  currentTitle: string;
  onApply: (title: string) => void;
}

export function TitleGenerator({
  product,
  channel,
  currentTitle,
  onApply,
}: TitleGeneratorProps) {
  const [showGenerator, setShowGenerator] = useState(false);
  const parts = useMemo(() => extractTitleParts(product), [product]);

  const result = useMemo(
    () => generateTitle(parts, channel),
    [parts, channel]
  );

  const maxChars = channel === "ebay" ? 80 : 70;
  const currentCount = currentTitle.length;
  const isOver = currentCount > maxChars;

  return (
    <div className="space-y-2">
      {/* Character count for current title */}
      <div className="flex items-center justify-between">
        <Label className="text-sm">{channel === "ebay" ? "eBay" : "Shopify"} Title</Label>
        <span
          className={`text-xs font-mono tabular-nums ${
            isOver
              ? "text-destructive font-semibold"
              : currentCount > maxChars - 5
                ? "text-warning font-medium"
                : "text-muted-foreground"
          }`}
        >
          {currentCount}/{maxChars}
        </span>
      </div>

      {isOver && (
        <div className="flex items-center gap-1.5 text-[11px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          Title exceeds {maxChars} character limit — listing will be rejected
        </div>
      )}

      {/* Generate button */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => setShowGenerator(!showGenerator)}
        >
          <Wand2 className="h-3.5 w-3.5" />
          {showGenerator ? "Hide" : "Auto-generate"} Title
        </Button>
      </div>

      {showGenerator && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-3 pb-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-primary">
                Generated Title
              </span>
              <Badge variant="outline" className="text-[10px] tabular-nums">
                {result.charCount}/{result.maxChars}
              </Badge>
            </div>

            <p className="text-sm font-medium bg-background rounded-md px-3 py-2 border">
              {result.title || "Not enough data to generate"}
            </p>

            {result.warnings.length > 0 && (
              <div className="space-y-1">
                {result.warnings.map((w, i) => (
                  <p key={i} className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-warning" /> {w}
                  </p>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                className="text-xs gap-1"
                onClick={() => {
                  onApply(result.title);
                  setShowGenerator(false);
                  toast.success("Title applied");
                }}
                disabled={!result.title}
              >
                Apply Title
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs gap-1"
                onClick={() => {
                  navigator.clipboard.writeText(result.title);
                  toast.success("Copied");
                }}
                disabled={!result.title}
              >
                <Copy className="h-3 w-3" /> Copy
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
