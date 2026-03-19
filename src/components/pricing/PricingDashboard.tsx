import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import {
  calculatePricingBreakdown,
  DEFAULT_PRICING_CONFIG,
  type Channel,
  type CompetitorMode,
  type PricingBreakdown,
  type PricingWarning,
  type PricingConfig,
} from "@/lib/pricingEngine";

interface PricingDashboardProps {
  costPrice: number;
  sellPrice: number;
  channel: Channel;
  taxClass?: string;
  competitorPrice?: number | null;
  onSuggestedPriceApply?: (price: number) => void;
  compact?: boolean;
}

export function PricingDashboard({
  costPrice,
  sellPrice,
  channel,
  taxClass = "gst_included",
  competitorPrice = null,
  onSuggestedPriceApply,
  compact = false,
}: PricingDashboardProps) {
  const [competitorMode, setCompetitorMode] = useState<CompetitorMode>("protect_margin");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [localCompPrice, setLocalCompPrice] = useState(competitorPrice?.toString() || "");

  const compPrice = localCompPrice ? Number(localCompPrice) : competitorPrice;

  const breakdown = useMemo(
    () =>
      calculatePricingBreakdown(
        costPrice,
        sellPrice,
        channel,
        taxClass,
        {},
        compPrice,
        competitorMode
      ),
    [costPrice, sellPrice, channel, taxClass, compPrice, competitorMode]
  );

  const marginColor = getMarginColor(breakdown.marginAtActual);
  const hasWarnings = breakdown.warnings.length > 0;
  const errorWarnings = breakdown.warnings.filter((w) => w.level === "error");
  const warnWarnings = breakdown.warnings.filter((w) => w.level === "warning");

  return (
    <Card className={`border ${errorWarnings.length > 0 ? "border-destructive/50" : warnWarnings.length > 0 ? "border-warning/50" : "border-border"}`}>
      <CardContent className="pt-4 pb-3 space-y-3">
        {/* Header with margin health badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
              Pricing — {channel === "ebay" ? "eBay" : "Shopify"}
            </h4>
          </div>
          <MarginPill margin={breakdown.marginAtActual} />
        </div>

        {/* Key metrics row */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <MetricCell
            label="Cost (ex-GST)"
            value={breakdown.costPriceExGst}
            prefix="$"
          />
          <MetricCell
            label="Channel Fee"
            value={breakdown.channelFee}
            prefix="$"
            sublabel={breakdown.channelFeeLabel}
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-help">
                  <MetricCell
                    label="Suggested"
                    value={breakdown.suggestedPrice}
                    prefix="$"
                    highlight
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs space-y-1 p-3">
                <p className="font-semibold">Price Waterfall</p>
                <div className="space-y-0.5">
                  <WaterfallRow label="Cost (ex-GST)" value={breakdown.costPriceExGst} />
                  <WaterfallRow label="Packaging" value={breakdown.packagingAllowance} />
                  <WaterfallRow label="Shipping" value={breakdown.shippingAllowance} />
                  <WaterfallRow label={breakdown.channelFeeLabel} value={breakdown.channelFee} />
                  <hr className="border-border" />
                  <WaterfallRow label="Total costs" value={breakdown.totalCostBase} bold />
                  <WaterfallRow label="Target profit" value={breakdown.profitAtSuggested} accent />
                  <hr className="border-border" />
                  <WaterfallRow label="Suggested price" value={breakdown.suggestedPrice} bold accent />
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <MetricCell
            label="Profit"
            value={breakdown.profitAtActual}
            prefix="$"
            color={breakdown.profitAtActual < 0 ? "destructive" : breakdown.profitAtActual > 0 ? "success" : undefined}
          />
        </div>

        {/* Suggested price apply button */}
        {onSuggestedPriceApply && sellPrice !== breakdown.suggestedPrice && breakdown.suggestedPrice > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs gap-1.5"
            onClick={() => onSuggestedPriceApply(breakdown.suggestedPrice)}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Apply suggested price: ${breakdown.suggestedPrice.toFixed(2)}
          </Button>
        )}

        {/* Warnings */}
        {hasWarnings && (
          <div className="space-y-1.5">
            {breakdown.warnings.map((w, i) => (
              <WarningRow key={i} warning={w} />
            ))}
          </div>
        )}

        {/* Competitor reference */}
        {!compact && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Competitor Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="$0.00"
                  value={localCompPrice}
                  onChange={(e) => setLocalCompPrice(e.target.value)}
                  className="h-8 text-sm mt-1"
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Strategy</Label>
                <Select value={competitorMode} onValueChange={(v) => setCompetitorMode(v as CompetitorMode)}>
                  <SelectTrigger className="h-8 text-sm mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="protect_margin">Protect Margin</SelectItem>
                    <SelectItem value="match">Match Price</SelectItem>
                    <SelectItem value="beat">Beat by $1</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* Expandable breakdown */}
        {!compact && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground gap-1"
            onClick={() => setShowBreakdown(!showBreakdown)}
          >
            {showBreakdown ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showBreakdown ? "Hide" : "Show"} full breakdown
          </Button>
        )}

        {showBreakdown && (
          <div className="text-xs space-y-1 bg-muted/30 rounded-md p-3">
            <BreakdownRow label="Cost (inc. GST)" value={breakdown.costPriceIncGst} />
            <BreakdownRow label="Cost (ex-GST)" value={breakdown.costPriceExGst} />
            <BreakdownRow label="GST component" value={breakdown.gstComponent} />
            <BreakdownRow label="Packaging" value={breakdown.packagingAllowance} />
            <BreakdownRow label="Shipping" value={breakdown.shippingAllowance} />
            <BreakdownRow label={breakdown.channelFeeLabel} value={breakdown.channelFee} />
            <hr className="border-border" />
            <BreakdownRow label="Total cost base" value={breakdown.totalCostBase} bold />
            <BreakdownRow label="Min. acceptable price" value={breakdown.minimumAcceptablePrice} />
            <BreakdownRow label="Suggested price" value={breakdown.suggestedPrice} bold />
            <hr className="border-border" />
            <BreakdownRow label="Margin at suggested" value={breakdown.marginAtSuggested} suffix="%" />
            <BreakdownRow label="Profit at suggested" value={breakdown.profitAtSuggested} prefix="$" />
            {sellPrice > 0 && (
              <>
                <hr className="border-border" />
                <BreakdownRow label="Margin at actual" value={breakdown.marginAtActual} suffix="%" />
                <BreakdownRow label="Profit at actual" value={breakdown.profitAtActual} prefix="$" />
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

export function MarginPill({ margin }: { margin: number }) {
  if (margin === 0) return null;
  const color = getMarginColor(margin);
  const label = margin < 0 ? "Loss" : margin < 15 ? "Thin" : margin < 25 ? "OK" : "Healthy";
  const icon = margin < 0 ? "🔴" : margin < 15 ? "🟡" : "🟢";

  return (
    <Badge
      variant="outline"
      className={`text-[10px] gap-1 ${
        color === "destructive"
          ? "border-destructive text-destructive"
          : color === "warning"
            ? "border-warning text-foreground"
            : "border-emerald-400 text-emerald-600"
      }`}
    >
      {icon} {margin.toFixed(1)}% — {label}
    </Badge>
  );
}

function getMarginColor(margin: number): "destructive" | "warning" | "success" {
  if (margin < 0) return "destructive";
  if (margin < 15) return "warning";
  return "success";
}

function MetricCell({
  label,
  value,
  prefix = "",
  suffix = "",
  sublabel,
  highlight = false,
  color,
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  sublabel?: string;
  highlight?: boolean;
  color?: "destructive" | "success";
}) {
  const display = value !== 0 ? `${prefix}${value.toFixed(2)}${suffix}` : "—";
  return (
    <div>
      <div className="text-[10px] text-muted-foreground truncate">{label}</div>
      <div
        className={`text-sm font-semibold ${
          highlight
            ? "text-primary"
            : color === "destructive"
              ? "text-destructive"
              : color === "success"
                ? "text-emerald-600"
                : ""
        }`}
      >
        {display}
      </div>
      {sublabel && (
        <div className="text-[9px] text-muted-foreground truncate">{sublabel}</div>
      )}
    </div>
  );
}

function WarningRow({ warning }: { warning: PricingWarning }) {
  const Icon = warning.level === "error" ? AlertCircle : warning.level === "warning" ? AlertTriangle : Info;
  const colorClass =
    warning.level === "error"
      ? "text-destructive bg-destructive/10"
      : warning.level === "warning"
        ? "text-foreground bg-warning/10"
        : "text-muted-foreground bg-muted/50";

  return (
    <div className={`flex items-start gap-2 text-[11px] rounded-md px-2.5 py-1.5 ${colorClass}`}>
      <Icon className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
      <span>{warning.message}</span>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  prefix = "$",
  suffix = "",
  bold = false,
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  bold?: boolean;
}) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{prefix}{value.toFixed(2)}{suffix}</span>
    </div>
  );
}

function WaterfallRow({
  label,
  value,
  bold = false,
  accent = false,
}: {
  label: string;
  value: number;
  bold?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""} ${accent ? "text-primary" : ""}`}>
      <span>{label}</span>
      <span>${value.toFixed(2)}</span>
    </div>
  );
}
