import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Cpu,
  AlertTriangle,
  Trash2,
  RefreshCw,
} from "lucide-react";

export interface QueueItem {
  id: string;
  status: string;
  product_id: string;
  error_message?: string | null;
  product?: {
    id: string;
    normalized_product_name?: string | null;
    source_product_name?: string | null;
    brand?: string | null;
    barcode?: string | null;
  } | null;
}

interface Props {
  queueItems: QueueItem[];
  isRunning: boolean;
  onRunAll: () => void;
  onClear: () => void;
  onRetryFailed: () => void;
}

const STATUS_CONFIG: Record<
  string,
  { icon: React.ElementType; label: string; color: string; pulse?: boolean }
> = {
  queued: { icon: Clock, label: "Queued", color: "text-muted-foreground" },
  searching: {
    icon: Search,
    label: "Searching web…",
    color: "text-blue-500",
    pulse: true,
  },
  extracting: {
    icon: Cpu,
    label: "Extracting data…",
    color: "text-purple-500",
    pulse: true,
  },
  completed: { icon: CheckCircle2, label: "Completed", color: "text-green-500" },
  completed_partial: {
    icon: AlertTriangle,
    label: "Partial results",
    color: "text-amber-500",
  },
  completed_no_data: {
    icon: XCircle,
    label: "No data found",
    color: "text-muted-foreground",
  },
  failed: { icon: XCircle, label: "Failed", color: "text-destructive" },
};

export function ResearchQueuePanel({
  queueItems,
  isRunning,
  onRunAll,
  onClear,
  onRetryFailed,
}: Props) {
  const total = queueItems.length;
  const completed = queueItems.filter((i) => i.status.startsWith("completed")).length;
  const failed = queueItems.filter((i) => i.status === "failed").length;
  const processing = queueItems.filter((i) =>
    ["searching", "extracting"].includes(i.status),
  ).length;
  const pending = queueItems.filter((i) => i.status === "queued").length;
  const progress = total > 0 ? ((completed + failed) / total) * 100 : 0;

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <Clock className="h-12 w-12 text-muted-foreground/30" />
        <div>
          <h3 className="font-medium text-muted-foreground">Queue is empty</h3>
          <p className="text-sm text-muted-foreground/60 mt-1">
            Select products from the <strong>Select Products</strong> tab and click{" "}
            <strong>Add to Queue</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <span className="font-medium">{total} total</span>
              {completed > 0 && (
                <span className="text-green-600">
                  <strong>{completed}</strong> done
                </span>
              )}
              {failed > 0 && (
                <span className="text-destructive">
                  <strong>{failed}</strong> failed
                </span>
              )}
              {processing > 0 && (
                <span className="text-blue-500">
                  <strong>{processing}</strong> running
                </span>
              )}
              {pending > 0 && (
                <span className="text-muted-foreground">
                  <strong>{pending}</strong> pending
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {failed > 0 && !isRunning && (
                <Button size="sm" variant="outline" onClick={onRetryFailed}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Retry failed
                </Button>
              )}
              {(pending > 0 || processing > 0) && (
                <Button size="sm" onClick={onRunAll} disabled={isRunning} className="gap-2">
                  {isRunning ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Running…
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" />
                      Run Research
                    </>
                  )}
                </Button>
              )}
              {!isRunning && (
                <Button size="sm" variant="ghost" onClick={onClear}>
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          <Progress value={progress} className="h-1.5" />
        </CardContent>
      </Card>

      {/* Queue item list */}
      <div className="space-y-1.5">
        {queueItems.map((item) => {
          const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.queued;
          const Icon = cfg.icon;
          const name =
            item.product?.normalized_product_name ||
            item.product?.source_product_name ||
            "Unknown product";

          return (
            <div
              key={item.id}
              className="flex items-center gap-3 px-3 py-2.5 border rounded-lg bg-card"
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${cfg.color} ${cfg.pulse ? "animate-pulse" : ""}`}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{name}</div>
                {item.product?.brand && (
                  <div className="text-xs text-muted-foreground truncate">
                    {item.product.brand}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {item.product?.barcode && (
                  <span className="hidden sm:inline text-xs font-mono text-muted-foreground">
                    {item.product.barcode}
                  </span>
                )}
                <Badge
                  variant="outline"
                  className={`text-[10px] ${cfg.color} border-current/30`}
                >
                  {cfg.label}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
