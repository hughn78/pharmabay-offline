import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ShoppingCart, Store } from "lucide-react";

export function ImportHistory() {
  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["channel-import-batches"],
    queryFn: async () => {
      const { data } = await supabase
        .from("channel_listing_import_batches")
        .select("*")
        .order("imported_at", { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading history...
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <p>No imports yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Import History</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Platform</TableHead>
              <TableHead>File</TableHead>
              <TableHead>Rows</TableHead>
              <TableHead>Matched</TableHead>
              <TableHead>Unmatched</TableHead>
              <TableHead>Ambiguous</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.map((b: any) => (
              <TableRow key={b.id}>
                <TableCell>
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    {b.platform === "ebay" ? <ShoppingCart className="h-3 w-3" /> : <Store className="h-3 w-3" />}
                    {b.platform}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm truncate max-w-[200px]">{b.filename || "—"}</TableCell>
                <TableCell className="text-sm">{b.row_count}</TableCell>
                <TableCell className="text-sm text-green-600">{b.matched_count}</TableCell>
                <TableCell className="text-sm text-destructive">{b.unmatched_count}</TableCell>
                <TableCell className="text-sm text-yellow-600">{b.ambiguous_count}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(b.imported_at).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
