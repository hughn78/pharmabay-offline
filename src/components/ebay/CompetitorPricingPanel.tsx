import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search, Loader2, ExternalLink, TrendingUp, TrendingDown, Minus,
  Store, Plus, X,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CompetitorProduct {
  title: string;
  handle: string;
  vendor: string;
  product_type: string;
  description: string;
  tags: string[];
  available: boolean;
  url: string;
  image_url: string | null;
  price_min: number;
  price_max: number;
  compare_at_price: number | null;
  currency: string;
  variants: Array<{
    title: string;
    sku: string | null;
    barcode: string | null;
    price: number;
    compare_at_price: number | null;
    available: boolean;
  }>;
}

interface CompetitorResult {
  store: string;
  query: string;
  result_count: number;
  products: CompetitorProduct[];
}

// Popular Australian pharmacy/health Shopify stores
const SUGGESTED_STORES = [
  "chemistwarehouse.com.au",
  "pharmacydirect.com.au",
  "pharmacyonline.com.au",
  "epharmacy.com.au",
];

interface Props {
  productName: string;
  ourPrice: number;
  costPrice: number;
}

export function CompetitorPricingPanel({ productName, ourPrice, costPrice }: Props) {
  const [stores, setStores] = useState<string[]>([]);
  const [newStore, setNewStore] = useState("");
  const [searchQuery, setSearchQuery] = useState(productName);
  const [results, setResults] = useState<CompetitorResult[]>([]);

  const lookup = useMutation({
    mutationFn: async (storeDomain: string) => {
      const res = await supabase.functions.invoke("shopify-storefront-lookup", {
        body: { store_domain: storeDomain, search_query: searchQuery, max_results: 5 },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data as CompetitorResult;
    },
  });

  const searchAll = useMutation({
    mutationFn: async () => {
      if (!stores.length) throw new Error("Add at least one store to search");
      const results: CompetitorResult[] = [];
      for (const store of stores) {
        try {
          const res = await supabase.functions.invoke("shopify-storefront-lookup", {
            body: { store_domain: store, search_query: searchQuery, max_results: 5 },
          });
          if (res.data && !res.data.error) {
            results.push(res.data as CompetitorResult);
          }
        } catch {
          // Skip failed stores
        }
      }
      return results;
    },
    onSuccess: (data) => {
      setResults(data);
      if (data.length === 0) {
        toast.info("No results found from any store");
      }
    },
    onError: (err) => toast.error(String(err)),
  });

  const addStore = (domain: string) => {
    const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (clean && !stores.includes(clean)) {
      setStores((prev) => [...prev, clean]);
    }
    setNewStore("");
  };

  // Compute pricing stats across all results
  const allPrices = results.flatMap((r) =>
    r.products.map((p) => p.price_min).filter((p) => p > 0)
  );
  const compMedian = allPrices.length
    ? (() => {
        const sorted = [...allPrices].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      })()
    : null;
  const compMin = allPrices.length ? Math.min(...allPrices) : null;
  const compMax = allPrices.length ? Math.max(...allPrices) : null;

  const pricePosition = compMedian && ourPrice > 0
    ? ourPrice < compMedian ? "below" : ourPrice > compMedian ? "above" : "at"
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Store className="h-4 w-4" /> Competitor Pricing (Shopify Stores)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Store list */}
        <div className="space-y-2">
          <Label className="text-xs">Competitor Stores</Label>
          <div className="flex flex-wrap gap-1.5">
            {stores.map((s) => (
              <Badge key={s} variant="secondary" className="gap-1 text-xs">
                {s}
                <button onClick={() => setStores((prev) => prev.filter((x) => x !== s))}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="store.myshopify.com or store.com.au"
              value={newStore}
              onChange={(e) => setNewStore(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addStore(newStore)}
              className="flex-1 text-xs h-8"
            />
            <Button size="sm" variant="outline" onClick={() => addStore(newStore)} disabled={!newStore.trim()}>
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          {stores.length === 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-[10px] text-muted-foreground">Suggested:</span>
              {SUGGESTED_STORES.map((s) => (
                <button
                  key={s}
                  onClick={() => addStore(s)}
                  className="text-[10px] text-primary hover:underline"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Search */}
        <div className="flex gap-2">
          <Input
            placeholder="Search query…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 text-xs h-8"
          />
          <Button
            size="sm"
            onClick={() => searchAll.mutate()}
            disabled={searchAll.isPending || !stores.length || !searchQuery.trim()}
          >
            {searchAll.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Search className="h-3 w-3" />
            )}
            Search
          </Button>
        </div>

        {/* Summary stats */}
        {allPrices.length > 0 && (
          <>
            <Separator />
            <div className="grid grid-cols-4 gap-3 text-center">
              <div>
                <div className="text-[10px] text-muted-foreground">Comp Low</div>
                <div className="text-sm font-semibold">${compMin?.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">Comp Median</div>
                <div className="text-sm font-semibold text-primary">${compMedian?.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">Comp High</div>
                <div className="text-sm font-semibold">${compMax?.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">Our Price</div>
                <div className="flex items-center justify-center gap-1">
                  <span className="text-sm font-semibold">
                    {ourPrice > 0 ? `$${ourPrice.toFixed(2)}` : "—"}
                  </span>
                  {pricePosition === "below" && <TrendingDown className="h-3 w-3 text-emerald-500" />}
                  {pricePosition === "above" && <TrendingUp className="h-3 w-3 text-destructive" />}
                  {pricePosition === "at" && <Minus className="h-3 w-3 text-muted-foreground" />}
                </div>
              </div>
            </div>
            {pricePosition && (
              <p className="text-[11px] text-muted-foreground text-center">
                Your price is <span className="font-medium">{pricePosition} the median</span>
                {compMedian && ourPrice > 0 && (
                  <> by {Math.abs(((ourPrice - compMedian) / compMedian) * 100).toFixed(0)}%</>
                )}
              </p>
            )}
          </>
        )}

        {/* Results */}
        {results.length > 0 && (
          <>
            <Separator />
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-3">
                {results.map((r) => (
                  <div key={r.store}>
                    <h5 className="text-xs font-medium text-muted-foreground mb-1.5">
                      {r.store} — {r.result_count} result{r.result_count !== 1 ? "s" : ""}
                    </h5>
                    {r.products.map((p, i) => (
                      <CompetitorProductCard
                        key={`${r.store}-${i}`}
                        product={p}
                        ourPrice={ourPrice}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        {results.length > 0 && allPrices.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            No matching products found across searched stores.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CompetitorProductCard({
  product,
  ourPrice,
}: {
  product: CompetitorProduct;
  ourPrice: number;
}) {
  const diff =
    ourPrice > 0 && product.price_min > 0
      ? ((ourPrice - product.price_min) / product.price_min) * 100
      : null;

  return (
    <div className="flex gap-3 p-2 rounded-md border bg-card mb-2">
      {product.image_url && (
        <img
          src={product.image_url}
          alt={product.title}
          className="w-12 h-12 rounded object-cover shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium truncate">{product.title}</p>
          <a
            href={product.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
          >
            <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
          </a>
        </div>
        <p className="text-[10px] text-muted-foreground truncate">
          {product.vendor} · {product.product_type || "No type"}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs font-semibold">
            ${product.price_min.toFixed(2)}
            {product.price_max > product.price_min && (
              <span className="text-muted-foreground font-normal"> – ${product.price_max.toFixed(2)}</span>
            )}
          </span>
          <span className="text-[10px] text-muted-foreground">{product.currency}</span>
          {product.compare_at_price && product.compare_at_price > product.price_min && (
            <span className="text-[10px] text-muted-foreground line-through">
              ${product.compare_at_price.toFixed(2)}
            </span>
          )}
          {diff !== null && (
            <Badge
              variant="outline"
              className={`text-[9px] ${
                diff > 5
                  ? "border-destructive/50 text-destructive"
                  : diff < -5
                  ? "border-emerald-400 text-emerald-600"
                  : "text-muted-foreground"
              }`}
            >
              {diff > 0 ? "+" : ""}{diff.toFixed(0)}% vs ours
            </Badge>
          )}
          {!product.available && (
            <Badge variant="outline" className="text-[9px] text-muted-foreground">Out of stock</Badge>
          )}
        </div>
      </div>
    </div>
  );
}
