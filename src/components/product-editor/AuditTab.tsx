import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface AuditTabProps {
  productId: string;
}

export function AuditTab({ productId }: AuditTabProps) {
  const { data: logs = [] } = useQuery({
    queryKey: ["product-audit", productId],
    queryFn: async () => {
      const { data } = await supabase
        .from("change_log")
        .select("*")
        .eq("entity_id", productId)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  return (
    <Card>
      <CardContent className="pt-6">
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No audit history for this product.</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 p-2 border rounded text-sm">
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {log.created_at ? new Date(log.created_at).toLocaleString() : "—"}
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">{log.action}</Badge>
                <div className="text-xs truncate flex-1">
                  {log.after_json ? JSON.stringify(log.after_json).slice(0, 100) : "—"}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
