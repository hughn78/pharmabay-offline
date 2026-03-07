import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle, XCircle, Image, Barcode } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

const reviewCategories = [
  { key: "blocked", label: "Blocked", icon: XCircle, filter: { compliance_status: "blocked" }, color: "text-destructive" },
  { key: "review", label: "Review Required", icon: AlertTriangle, filter: { compliance_status: "review_required" }, color: "text-warning" },
  { key: "low_confidence", label: "Low Confidence", icon: AlertTriangle, filter: { enrichment_confidence: "low" }, color: "text-warning" },
];

export default function ReviewQueue() {
  const navigate = useNavigate();

  const { data: reviewItems = [], isLoading } = useQuery({
    queryKey: ["review-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .or("compliance_status.eq.blocked,compliance_status.eq.review_required,enrichment_confidence.eq.low")
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Review Queue</h1>
        <p className="text-muted-foreground text-sm">Products requiring attention</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {reviewCategories.map((cat) => {
          const count = reviewItems.filter((p: any) => {
            if (cat.key === "blocked") return p.compliance_status === "blocked";
            if (cat.key === "review") return p.compliance_status === "review_required";
            if (cat.key === "low_confidence") return p.enrichment_confidence === "low";
            return false;
          }).length;
          return (
            <Card key={cat.key}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{cat.label}</p>
                    <p className="text-3xl font-bold mt-1">{count}</p>
                  </div>
                  <cat.icon className={`h-8 w-8 ${cat.color} opacity-60`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Items List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Items Requiring Review</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : reviewItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle className="h-10 w-10 mx-auto mb-3 text-success opacity-40" />
              <p className="font-medium">All clear!</p>
              <p className="text-sm">No products require review right now.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {reviewItems.map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => navigate(`/products/${p.id}`)}
                  className="w-full text-left p-3 rounded-lg border hover:bg-muted/30 transition-colors flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{p.source_product_name}</div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">
                      {p.barcode || p.sku || "No identifier"}
                    </div>
                    {p.compliance_reasons && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {(p.compliance_reasons as string[]).slice(0, 3).map((r, i) => (
                          <Badge key={i} variant="outline" className="text-[10px]">{r}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <Badge
                    className={`text-[10px] shrink-0 ml-3 ${
                      p.compliance_status === "blocked" ? "status-blocked" :
                      p.compliance_status === "review_required" ? "status-review" : ""
                    }`}
                  >
                    {p.compliance_status?.replace("_", " ") || "unknown"}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
