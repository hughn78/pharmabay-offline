import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Globe, Sparkles, AlertTriangle, TrendingUp } from "lucide-react";
import type { QueueItem } from "./ResearchQueuePanel";

interface ResearchResult {
  id: string;
  product_id: string;
  source_domain: string | null;
  source_url: string | null;
  source_title: string | null;
  extracted_payload: Record<string, unknown> | null;
  confidence_score: number | null;
  fields_found: string[] | null;
  auto_filled_fields: string[] | null;
  created_at: string;
}

interface Props {
  results: ResearchResult[];
  queueItems: QueueItem[];
}

const FIELD_LABELS: Record<string, string> = {
  normalized_product_name: "Product Name",
  brand: "Brand",
  manufacturer: "Manufacturer",
  pack_size: "Pack Size",
  product_form: "Dosage Form",
  strength: "Strength",
  ingredients_summary: "Ingredients",
  directions_summary: "Directions",
  warnings_summary: "Warnings",
  short_description: "Description",
  key_features: "Key Features",
  product_type: "Product Type",
  country_of_origin: "Country of Origin",
  storage_requirements: "Storage",
  allergen_information: "Allergens",
  age_restriction: "Age Restriction",
  barcode: "Barcode",
  artg_number: "ARTG Number",
  ebay_title_suggestion: "eBay Title",
  shopify_title_suggestion: "Shopify Title",
  image_urls: "Images",
};

function ConfidenceBadge({ score }: { score: number }) {
  if (score >= 0.85)
    return (
      <Badge variant="outline" className="text-[10px] border-green-500/50 text-green-600 gap-1">
        <TrendingUp className="h-2.5 w-2.5" />
        High confidence
      </Badge>
    );
  if (score >= 0.6)
    return (
      <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600 gap-1">
        <AlertTriangle className="h-2.5 w-2.5" />
        Medium
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground gap-1">
      <XCircle className="h-2.5 w-2.5" />
      Low confidence
    </Badge>
  );
}

function FieldPill({
  label,
  state,
}: {
  label: string;
  state: "auto-filled" | "found" | "blank";
}) {
  const styles = {
    "auto-filled":
      "border-green-500/40 bg-green-500/8 text-green-700 dark:text-green-400",
    found: "border-blue-500/30 bg-blue-500/5 text-blue-700 dark:text-blue-400",
    blank: "border-border/50 text-muted-foreground/50",
  };
  const icons = {
    "auto-filled": <CheckCircle2 className="h-2.5 w-2.5 text-green-500" />,
    found: <CheckCircle2 className="h-2.5 w-2.5 text-blue-400" />,
    blank: <XCircle className="h-2.5 w-2.5 opacity-30" />,
  };
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${styles[state]}`}
    >
      {icons[state]}
      {label}
    </span>
  );
}

export function EnrichmentResultsPanel({ results, queueItems }: Props) {
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <Sparkles className="h-12 w-12 text-muted-foreground/30" />
        <div>
          <h3 className="font-medium text-muted-foreground">No results yet</h3>
          <p className="text-sm text-muted-foreground/60 mt-1">
            Add products to the queue and run Market Research to see enrichment results here.
          </p>
        </div>
      </div>
    );
  }

  const totalAutoFilled = results.reduce(
    (acc, r) => acc + (r.auto_filled_fields?.length ?? 0),
    0,
  );
  const avgConf =
    results.reduce((acc, r) => acc + (r.confidence_score ?? 0), 0) / results.length;
  const highConfCount = results.filter((r) => (r.confidence_score ?? 0) >= 0.85).length;

  const queueMap = Object.fromEntries(queueItems.map((q) => [q.product_id, q]));

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Products researched",
            value: results.length,
            icon: Globe,
            color: "text-primary",
          },
          {
            label: "Fields auto-filled",
            value: totalAutoFilled,
            icon: CheckCircle2,
            color: "text-green-500",
          },
          {
            label: "High confidence",
            value: highConfCount,
            icon: Sparkles,
            color: "text-amber-500",
          },
          {
            label: "Avg match confidence",
            value: `${Math.round(avgConf * 100)}%`,
            icon: TrendingUp,
            color: "text-blue-500",
          },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-2xl font-bold">{s.value}</div>
                  <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                    {s.label}
                  </div>
                </div>
                <s.icon className={`h-4 w-4 mt-1 ${s.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500/30 border border-green-500/50" />
          Auto-filled into product
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500/20 border border-blue-500/40" />
          Found (medium confidence – review)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-transparent border border-border/50" />
          Not found / blank
        </span>
      </div>

      {/* Per-product cards */}
      <div className="space-y-3">
        {results.map((result) => {
          const queueItem = queueMap[result.product_id];
          const name =
            queueItem?.product?.normalized_product_name ||
            queueItem?.product?.source_product_name ||
            "Unknown product";
          const brand = queueItem?.product?.brand;

          const payload = result.extracted_payload ?? {};
          const extractedFields = (payload.fields ?? {}) as Record<string, unknown>;
          const confidenceMap = (payload.confidence ?? {}) as Record<string, number>;
          const fieldsFound = new Set(result.fields_found ?? []);
          const autoFilled = new Set(result.auto_filled_fields ?? []);
          const notes = payload.notes as string | undefined;

          return (
            <Card key={result.id}>
              <CardHeader className="pb-2 pt-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <CardTitle className="text-sm font-semibold">{name}</CardTitle>
                    {brand && (
                      <p className="text-xs text-muted-foreground mt-0.5">{brand}</p>
                    )}
                    {result.source_domain && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Globe className="h-3 w-3 shrink-0" />
                        {result.source_domain}
                        {result.source_title && (
                          <span className="opacity-60 truncate max-w-[240px]">
                            — {result.source_title}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {autoFilled.size} auto-filled · {fieldsFound.size - autoFilled.size} suggested
                    </span>
                    <ConfidenceBadge score={result.confidence_score ?? 0} />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(FIELD_LABELS).map(([key, label]) => {
                    const state = autoFilled.has(key)
                      ? "auto-filled"
                      : fieldsFound.has(key) && (confidenceMap[key] ?? 0) >= 0.6
                      ? "found"
                      : "blank";
                    return <FieldPill key={key} label={label} state={state} />;
                  })}
                </div>

                {/* Show suggested (medium confidence) values */}
                {Object.entries(extractedFields).some(
                  ([k, v]) =>
                    v &&
                    !autoFilled.has(k) &&
                    fieldsFound.has(k) &&
                    (confidenceMap[k] ?? 0) >= 0.6,
                ) && (
                  <div className="mt-3 pt-3 border-t space-y-1">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      Suggestions (not auto-filled — review before applying)
                    </p>
                    {Object.entries(extractedFields)
                      .filter(
                        ([k, v]) =>
                          v &&
                          !autoFilled.has(k) &&
                          fieldsFound.has(k) &&
                          (confidenceMap[k] ?? 0) >= 0.6 &&
                          FIELD_LABELS[k],
                      )
                      .map(([k, v]) => (
                        <div key={k} className="flex items-start gap-2 text-xs">
                          <span className="text-muted-foreground font-medium min-w-[120px]">
                            {FIELD_LABELS[k]}:
                          </span>
                          <span className="text-foreground/80 line-clamp-2">
                            {Array.isArray(v) ? v.join(", ") : String(v)}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[9px] ml-auto shrink-0 text-amber-600 border-amber-500/40"
                          >
                            {Math.round((confidenceMap[k] ?? 0) * 100)}%
                          </Badge>
                        </div>
                      ))}
                  </div>
                )}

                {notes && (
                  <p className="mt-3 pt-3 border-t text-xs text-muted-foreground italic">
                    ℹ {notes}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
