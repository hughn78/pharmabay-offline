import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Play, CheckCircle2, AlertTriangle, ListPlus } from "lucide-react";
import { ProductSelectionPanel } from "@/components/market-research/ProductSelectionPanel";
import { ResearchQueuePanel } from "@/components/market-research/ResearchQueuePanel";
import { EnrichmentResultsPanel } from "@/components/market-research/EnrichmentResultsPanel";

const SESSION_RUN_KEY = "pharma_market_research_run_id";

export default function MarketResearch() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [activeRunId, setActiveRunId] = useState<string | null>(
    () => sessionStorage.getItem(SESSION_RUN_KEY),
  );
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState("select");

  // Persist run ID to session
  useEffect(() => {
    if (activeRunId) sessionStorage.setItem(SESSION_RUN_KEY, activeRunId);
    else sessionStorage.removeItem(SESSION_RUN_KEY);
  }, [activeRunId]);

  // Load queue items for active run
  const { data: queueItems = [], refetch: refetchQueue } = useQuery({
    queryKey: ["research-queue", activeRunId],
    queryFn: async () => {
      if (!activeRunId) return [];
      const { data } = await (supabase as any)
        .from("product_research_queue")
        .select(
          "id, status, product_id, error_message, product:products(id, normalized_product_name, source_product_name, brand, barcode)",
        )
        .eq("research_run_id", activeRunId)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
    enabled: !!activeRunId,
    refetchInterval: isRunning ? 1500 : false,
  });

  // Load results for active run
  const { data: results = [] } = useQuery({
    queryKey: ["research-results", activeRunId],
    queryFn: async () => {
      if (!activeRunId) return [];
      const { data } = await (supabase as any)
        .from("product_research_results")
        .select("*")
        .eq("research_run_id", activeRunId)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
    enabled: !!activeRunId,
    refetchInterval: isRunning ? 2000 : false,
  });

  const handleAddToQueue = useCallback(async () => {
    if (selectedProductIds.size === 0) {
      toast.warning("Select at least one product first");
      return;
    }

    // Create research run
    const { data: run, error } = await (supabase as any)
      .from("market_research_runs")
      .insert({
        triggered_by: user?.id ?? null,
        status: "pending",
        total_products: selectedProductIds.size,
      })
      .select()
      .single();

    if (error || !run) {
      toast.error("Failed to create research run");
      return;
    }

    // Create queue items
    const items = Array.from(selectedProductIds).map((productId) => ({
      product_id: productId,
      research_run_id: run.id,
      queued_by: user?.id ?? null,
      status: "queued",
    }));

    const { error: qErr } = await (supabase as any)
      .from("product_research_queue")
      .insert(items);

    if (qErr) {
      toast.error("Failed to queue products");
      return;
    }

    setActiveRunId(run.id);
    setSelectedProductIds(new Set());
    setActiveTab("queue");
    toast.success(`${items.length} product${items.length !== 1 ? "s" : ""} added to research queue`);
  }, [selectedProductIds, user]);

  const handleRunResearch = useCallback(async () => {
    if (!activeRunId) return;

    const pendingItems = queueItems.filter(
      (item: any) => item.status === "queued" || item.status === "failed",
    );

    if (pendingItems.length === 0) {
      toast.info("No pending items in queue");
      return;
    }

    setIsRunning(true);

    // Update run status
    await (supabase as any)
      .from("market_research_runs")
      .update({ status: "running" })
      .eq("id", activeRunId);

    let successCount = 0;
    let failCount = 0;

    for (const item of pendingItems) {
      try {
        const { error } = await supabase.functions.invoke("market-research", {
          body: { queueItemId: item.id },
        });

        if (error) {
          console.error("Research error for item", item.id, error);
          failCount++;
        } else {
          successCount++;
        }
      } catch (e) {
        console.error("Research invocation failed:", e);
        failCount++;
      }

      // Refresh queue after each item
      await refetchQueue();
    }

    // Finalize run
    await (supabase as any)
      .from("market_research_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        success_count: successCount,
        failed_count: failCount,
      })
      .eq("id", activeRunId);

    setIsRunning(false);

    queryClient.invalidateQueries({ queryKey: ["research-results", activeRunId] });
    queryClient.invalidateQueries({ queryKey: ["enrichment-summaries"] });
    queryClient.invalidateQueries({ queryKey: ["market-research-products"] });

    setActiveTab("results");

    if (failCount === 0) {
      toast.success(`Research complete — ${successCount} product${successCount !== 1 ? "s" : ""} enriched`);
    } else {
      toast.warning(
        `Research complete — ${successCount} succeeded, ${failCount} failed`,
      );
    }
  }, [activeRunId, queueItems, refetchQueue, queryClient]);

  const handleRetryFailed = useCallback(async () => {
    if (!activeRunId) return;
    // Reset failed items to queued
    const failedItems = queueItems.filter((i: any) => i.status === "failed");
    if (failedItems.length === 0) return;

    await (supabase as any)
      .from("product_research_queue")
      .update({ status: "queued", error_message: null })
      .in(
        "id",
        failedItems.map((i: any) => i.id),
      );

    await refetchQueue();
    handleRunResearch();
  }, [activeRunId, queueItems, refetchQueue, handleRunResearch]);

  const handleClearQueue = useCallback(() => {
    setActiveRunId(null);
    setActiveTab("select");
  }, []);

  // Derived counts
  const completedCount = queueItems.filter((i: any) => i.status.startsWith("completed")).length;
  const failedCount = queueItems.filter((i: any) => i.status === "failed").length;
  const pendingCount = queueItems.filter((i: any) => i.status === "queued").length;

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="border-b bg-card px-6 py-4 shrink-0">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Market Research</h1>
              <p className="text-sm text-muted-foreground">
                Automatically enrich product data from the web for eBay and Shopify listings
              </p>
            </div>
          </div>

          {/* Status + actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {activeRunId && (
              <div className="flex items-center gap-2">
                {isRunning && (
                  <Badge variant="secondary" className="gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Running…
                  </Badge>
                )}
                {completedCount > 0 && (
                  <Badge variant="outline" className="gap-1 border-green-500/50 text-green-600">
                    <CheckCircle2 className="h-3 w-3" />
                    {completedCount} done
                  </Badge>
                )}
                {failedCount > 0 && (
                  <Badge
                    variant="outline"
                    className="gap-1 border-destructive/50 text-destructive"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    {failedCount} failed
                  </Badge>
                )}
              </div>
            )}

            {selectedProductIds.size > 0 && (
              <Button onClick={handleAddToQueue} variant="outline" className="gap-2">
                <ListPlus className="h-4 w-4" />
                Add {selectedProductIds.size} to Queue
              </Button>
            )}

            {queueItems.length > 0 && (pendingCount > 0 || failedCount > 0) && (
              <Button onClick={handleRunResearch} disabled={isRunning} className="gap-2">
                {isRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Run Research
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <div className="border-b shrink-0 px-6">
          <TabsList className="h-10 bg-transparent p-0 gap-0">
            {(
              [
                {
                  value: "select",
                  label: "Select Products",
                  count: selectedProductIds.size,
                },
                {
                  value: "queue",
                  label: "Research Queue",
                  count: queueItems.length,
                },
                {
                  value: "results",
                  label: "Results",
                  count: results.length,
                },
              ] as const
            ).map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="relative h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground"
              >
                {tab.label}
                {tab.count > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-2 h-4 px-1.5 text-[10px] py-0 min-w-[16px]"
                  >
                    {tab.count}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent
          value="select"
          className="flex-1 overflow-auto m-0 p-6 data-[state=inactive]:hidden"
        >
          <ProductSelectionPanel
            selectedIds={selectedProductIds}
            onSelectionChange={setSelectedProductIds}
          />
        </TabsContent>

        <TabsContent
          value="queue"
          className="flex-1 overflow-auto m-0 p-6 data-[state=inactive]:hidden"
        >
          <ResearchQueuePanel
            queueItems={queueItems}
            isRunning={isRunning}
            onRunAll={handleRunResearch}
            onClear={handleClearQueue}
            onRetryFailed={handleRetryFailed}
          />
        </TabsContent>

        <TabsContent
          value="results"
          className="flex-1 overflow-auto m-0 p-6 data-[state=inactive]:hidden"
        >
          <EnrichmentResultsPanel results={results} queueItems={queueItems} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
