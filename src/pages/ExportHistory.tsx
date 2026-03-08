import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw, ShoppingCart, Store, FileSpreadsheet } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function ExportHistory() {
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

  const platformIcon = (p: string | null) => {
    if (p === "ebay") return <ShoppingCart className="h-3.5 w-3.5" />;
    if (p === "shopify") return <Store className="h-3.5 w-3.5" />;
    return <FileSpreadsheet className="h-3.5 w-3.5" />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Export History</h1>
        <p className="text-muted-foreground text-sm">View and re-download past CSV exports</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Loading...</div>
          ) : batches.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Download className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No exports yet. Create one from the Products page.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Filename</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="text-sm">
                      {b.created_at ? new Date(b.created_at).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] gap-1">
                        {platformIcon(b.platform)}
                        {b.platform || "generic"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{b.product_count ?? "—"}</TableCell>
                    <TableCell className="text-sm font-mono truncate max-w-[200px]">
                      {b.batch_name || "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!b.file_url}
                        onClick={() => {
                          if (b.file_url) {
                            const a = document.createElement("a");
                            a.href = b.file_url;
                            a.download = b.batch_name || "export.csv";
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                          }
                        }}
                      >
                        <Download className="h-3.5 w-3.5 mr-1" /> Download
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
