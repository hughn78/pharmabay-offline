import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Props {
  productId: string;
}

export function ResearchHistoryPanel({ productId }: Props) {
  const { data: summary } = useQuery({
    queryKey: ["enrichment-summary", productId],
    queryFn: async () => {
      const { data } = await supabase
        .from("product_enrichment_summary")
        .select("*")
        .eq("product_id", productId)
        .single();
      return data;
    },
  });

  const { data: results = [] } = useQuery({
    queryKey: ["research-results", productId],
    queryFn: async () => {
      const { data } = await supabase
        .from("product_research_results")
        .select("*")
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  if (!summary && results.length === 0) {
    return (
      <Card className="border-muted">
        <CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">
          <Globe className="h-8 w-8 mx-auto mb-2 opacity-20" />
          No research history yet. Run Market Research to enrich this product.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary Card */}
      {summary && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3 pt-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Last Research Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">Last Researched:</span>
                <p className="font-medium">
                  {summary.last_researched_at
                    ? formatDistanceToNow(new Date(summary.last_researched_at), {
                        addSuffix: true,
                      })
                    : "Never"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Confidence:</span>
                <p className="font-medium">
                  {summary.overall_confidence
                    ? `${Math.round(summary.overall_confidence * 100)}%`
                    : "—"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Fields Filled:</span>
                <p className="font-medium">{summary.fields_filled_count || 0}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Sources Found:</span>
                <p className="font-medium">{summary.source_count || 0}</p>
              </div>
            </div>

            {summary.needs_review && (
              <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600">
                <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                Needs Review
              </Badge>
            )}

            {summary.research_notes && (
              <p className="text-xs text-muted-foreground italic mt-2 pt-2 border-t">
                {summary.research_notes}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Results History */}
      {results.length > 0 && (
        <Card>
          <CardHeader className="pb-3 pt-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Recent Research Runs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {results.map((result) => {
              const payload = result.extracted_payload as Record<string, unknown> | null;
              const conf = result.confidence_score || 0;
              return (
                <div
                  key={result.id}
                  className="flex items-start gap-2 p-2 rounded-md border bg-card/50 text-xs"
                >
                  <Globe className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {result.source_domain || "Unknown source"}
                    </p>
                    {result.source_title && (
                      <p className="text-muted-foreground truncate text-[10px]">
                        {result.source_title}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <Badge
                        variant={conf >= 0.85 ? "default" : conf >= 0.6 ? "secondary" : "outline"}
                        className="text-[9px] h-4 px-1.5"
                      >
                        {Math.round(conf * 100)}% match
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {(result.auto_filled_fields as string[] | null)?.length || 0} filled ·{" "}
                        {(result.fields_found as string[] | null)?.length || 0} found
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(result.created_at), { addSuffix: true })}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
