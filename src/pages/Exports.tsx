import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, ShoppingCart, Store } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function Exports() {
  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["export-batches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("export_batches")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const ebayBatches = batches.filter((b: any) => b.platform === "ebay");
  const shopifyBatches = batches.filter((b: any) => b.platform === "shopify");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Exports</h1>
        <p className="text-muted-foreground text-sm">Download CSV exports for eBay and Shopify</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExportSection
          title="eBay Exports"
          icon={<ShoppingCart className="h-5 w-5" />}
          batches={ebayBatches}
          isLoading={isLoading}
        />
        <ExportSection
          title="Shopify Exports"
          icon={<Store className="h-5 w-5" />}
          batches={shopifyBatches}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}

function ExportSection({ title, icon, batches, isLoading }: {
  title: string;
  icon: React.ReactNode;
  batches: any[];
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm text-center py-6">Loading...</p>
        ) : batches.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Download className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No exports yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {batches.map((b: any) => (
              <div key={b.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <div className="font-medium text-sm">{b.batch_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {b.product_count} products • {new Date(b.created_at).toLocaleDateString()}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!b.file_url}
                  onClick={() => {
                    if (b.file_url) {
                      const a = document.createElement('a');
                      a.href = b.file_url;
                      a.download = b.batch_name || 'export.csv';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                    }
                  }}
                >
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
