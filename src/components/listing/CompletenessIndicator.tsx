import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { calculateCompleteness, type CompletenessResult } from "@/lib/listingBuilder";
import { useMemo } from "react";

interface CompletenessIndicatorProps {
  product: Record<string, unknown>;
  showMissing?: boolean;
}

export function CompletenessIndicator({ product, showMissing = false }: CompletenessIndicatorProps) {
  const result = useMemo(() => calculateCompleteness(product), [product]);

  const colorClass =
    result.level === "complete"
      ? "bg-emerald-500"
      : result.level === "good"
        ? "bg-emerald-400"
        : result.level === "fair"
          ? "bg-warning"
          : "bg-destructive";

  const badgeVariant =
    result.level === "complete"
      ? "default"
      : result.level === "good"
        ? "secondary"
        : result.level === "fair"
          ? "outline"
          : "destructive";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2">
            {/* Progress bar */}
            <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${colorClass}`}
                style={{ width: `${result.score}%` }}
              />
            </div>
            <Badge variant={badgeVariant} className="text-[10px] tabular-nums">
              {result.score}%
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs p-3">
          <p className="font-semibold mb-1">Listing Completeness: {result.score}%</p>
          <p className="text-muted-foreground mb-2">
            {result.filledCount}/{result.totalCount} fields filled
          </p>
          {result.missingFields.length > 0 && (
            <div>
              <p className="font-medium mb-0.5">Missing:</p>
              <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                {result.missingFields.slice(0, 8).map((f) => (
                  <li key={f}>{f}</li>
                ))}
                {result.missingFields.length > 8 && (
                  <li>+{result.missingFields.length - 8} more</li>
                )}
              </ul>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
