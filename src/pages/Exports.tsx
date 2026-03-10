import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Download, ShoppingCart, Store, Database, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

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
        <p className="text-muted-foreground text-sm">Download data exports, product lists, and database backups</p>
      </div>

      {/* Database & Product Exports */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DatabaseExportCard />
        <ProductExportCard />
      </div>

      <Separator />

      {/* Channel Exports */}
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

function DatabaseExportCard() {
  const [exportingSQL, setExportingSQL] = useState(false);
  const [exportingSQLite, setExportingSQLite] = useState(false);

  const getSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");
    return session;
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportSQL = async () => {
    setExportingSQL(true);
    try {
      const session = await getSession();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/export-sql-dump`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Export failed");
      }
      const blob = await res.blob();
      downloadBlob(blob, `pharmabay_dump_${new Date().toISOString().slice(0, 10)}.sql`);
      toast.success("SQL dump exported successfully");
    } catch (err: any) {
      toast.error("Export failed", { description: err.message });
    } finally {
      setExportingSQL(false);
    }
  };

  const handleExportSQLite = async () => {
    setExportingSQLite(true);
    try {
      const session = await getSession();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/export-sqlite`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Export failed");
      }
      const blob = await res.blob();
      downloadBlob(blob, `pharmabay_export_${new Date().toISOString().slice(0, 10)}.sqlite`);
      toast.success("SQLite database exported successfully");
    } catch (err: any) {
      toast.error("Export failed", { description: err.message });
    } finally {
      setExportingSQLite(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-5 w-5" /> Database Export
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Export the entire database for migration or backup. Includes all tables, products, drafts, listings, and settings.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={handleExportSQL} disabled={exportingSQL} variant="outline" className="gap-2">
            {exportingSQL ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {exportingSQL ? "Exporting…" : "Export as SQL"}
          </Button>
          <Button onClick={handleExportSQLite} disabled={exportingSQLite} variant="outline" className="gap-2">
            {exportingSQLite ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            {exportingSQLite ? "Exporting…" : "Export as SQLite"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductExportCard() {
  const [exportingCSV, setExportingCSV] = useState(false);
  const [exportingXLSX, setExportingXLSX] = useState(false);

  const getSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");
    return session;
  };

  const handleExportCSV = async () => {
    setExportingCSV(true);
    try {
      const session = await getSession();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/export-products?format=csv`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `products_export_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Products exported as CSV");
    } catch (err: any) {
      toast.error("Export failed", { description: err.message });
    } finally {
      setExportingCSV(false);
    }
  };

  const handleExportXLSX = async () => {
    setExportingXLSX(true);
    try {
      const session = await getSession();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/export-products?format=xlsx`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Export failed");
      }
      const json = await res.json();
      const { columns, rows } = json;

      // Build worksheet data
      const wsData = [columns];
      for (const row of rows) {
        wsData.push(columns.map((col: string) => {
          const val = row[col];
          if (val === null || val === undefined) return "";
          if (typeof val === "object") return JSON.stringify(val);
          return val;
        }));
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, "Products");
      XLSX.writeFile(wb, `products_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`${rows.length} products exported as Excel`);
    } catch (err: any) {
      toast.error("Export failed", { description: err.message });
    } finally {
      setExportingXLSX(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="h-5 w-5" /> Product Export
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Export the complete product catalogue with pricing, stock levels, compliance status, and more.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={handleExportCSV} disabled={exportingCSV} variant="outline" className="gap-2">
            {exportingCSV ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {exportingCSV ? "Exporting…" : "Export as CSV"}
          </Button>
          <Button onClick={handleExportXLSX} disabled={exportingXLSX} variant="outline" className="gap-2">
            {exportingXLSX ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            {exportingXLSX ? "Exporting…" : "Export as Excel"}
          </Button>
        </div>
      </CardContent>
    </Card>
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
                  <Download className="h-3.5 w-3.5 mr-1" /> Download
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
