import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Scan, Search, Package, Clock, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RapidReviewModal } from "@/components/scan/RapidReviewModal";
import { buildSafeIlikeOr } from "@/lib/search-utils";

export default function ScanSearch() {
  const [barcode, setBarcode] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [reviewProductId, setReviewProductId] = useState<string | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    barcodeRef.current?.focus();
  }, []);

  // Re-focus barcode input when modal closes
  useEffect(() => {
    if (!reviewProductId) {
      setTimeout(() => barcodeRef.current?.focus(), 100);
    }
  }, [reviewProductId]);

  const handleBarcodeScan = useCallback(async (code: string) => {
    if (!code.trim()) return;

    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("barcode", code.trim())
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setRecentScans((prev) => [
          { ...data, scannedAt: new Date() },
          ...prev.filter((s) => s.id !== data.id).slice(0, 19),
        ]);
        setReviewProductId(data.id);
      } else {
        toast.info("Product not found", {
          description: `No product with barcode ${code}. Create a new entry?`,
        });
        setRecentScans((prev) => [
          { barcode: code, source_product_name: "Unknown - New Scan", scannedAt: new Date(), isNew: true },
          ...prev.slice(0, 19),
        ]);
      }
    } catch (err) {
      toast.error("Scan error", { description: String(err) });
    }

    setBarcode("");
    barcodeRef.current?.focus();
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id, source_product_name, barcode, sku, brand, stock_on_hand, compliance_status")
        .or(
          `source_product_name.ilike.%${searchQuery}%,barcode.ilike.%${searchQuery}%,sku.ilike.%${searchQuery}%,brand.ilike.%${searchQuery}%`
        )
        .limit(20);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (err) {
      toast.error("Search error");
    }
    setIsSearching(false);
  }, [searchQuery]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Scan / Search</h1>
        <p className="text-muted-foreground text-sm mt-1">Scan a barcode or search for products</p>
      </div>

      {/* Barcode Scanner */}
      <Card className="border-2 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <Scan className="h-6 w-6 text-primary shrink-0" />
            <Input
              ref={barcodeRef}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleBarcodeScan(barcode);
              }}
              placeholder="Scan barcode or type manually..."
              className="text-lg h-12 font-mono"
              autoComplete="off"
            />
            <Button onClick={() => handleBarcodeScan(barcode)} size="lg">
              <ArrowRight className="h-5 w-5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Text Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <Search className="h-5 w-5 text-muted-foreground shrink-0" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              placeholder="Search by name, barcode, SKU, or brand..."
              className="h-10"
            />
            <Button onClick={handleSearch} variant="secondary" disabled={isSearching}>
              {isSearching ? "Searching..." : "Search"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Search Results */}
        {searchResults.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                Search Results ({searchResults.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setReviewProductId(p.id)}
                  className="w-full text-left p-3 rounded-md hover:bg-muted/50 transition-colors border"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{p.source_product_name}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {p.barcode || p.sku}
                      </div>
                    </div>
                    <ComplianceBadge status={p.compliance_status} />
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Recent Scans */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" /> Recent Scans
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentScans.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Scan className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No recent scans. Start scanning!
              </div>
            ) : (
              <div className="space-y-2">
                {recentScans.map((s, i) => (
                  <button
                    key={`${s.barcode}-${i}`}
                    onClick={() => s.id && setReviewProductId(s.id)}
                    className="w-full text-left flex items-center justify-between p-2 rounded border text-sm hover:bg-muted/30 transition-colors"
                  >
                    <div>
                      <div className="font-medium">{s.source_product_name || "Unknown"}</div>
                      <div className="text-xs text-muted-foreground font-mono">{s.barcode}</div>
                    </div>
                    {s.isNew && (
                      <Badge variant="outline" className="text-xs">
                        New
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Rapid Review Modal */}
      <RapidReviewModal
        productId={reviewProductId}
        onClose={() => setReviewProductId(null)}
        onSaveAndNext={() => {
          setReviewProductId(null);
          // Focus will be restored by the useEffect above
        }}
      />
    </div>
  );
}

function ComplianceBadge({ status }: { status?: string }) {
  if (!status) return null;
  const map: Record<string, string> = {
    permitted: "status-permitted",
    review_required: "status-review",
    blocked: "status-blocked",
  };
  return (
    <Badge className={`text-[10px] ${map[status] || ""}`}>{status?.replace("_", " ")}</Badge>
  );
}
