import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from "recharts";

interface Props {
  costPrice: number;
  rrp: number;
  ebayPrice: number;
  compMedian?: number | null;
  defaultMarkup?: number;
  minMargin?: number;
}

export function EbayPricingPanel({
  costPrice,
  rrp,
  ebayPrice,
  compMedian = null,
  defaultMarkup = 30,
  minMargin = 15,
}: Props) {
  const cost = costPrice || 0;
  const suggested = cost > 0 ? +(cost * (1 + defaultMarkup / 100)).toFixed(2) : rrp || 0;
  const activePrice = ebayPrice || suggested;

  const margin = cost > 0 && activePrice > 0 ? +((1 - cost / activePrice) * 100).toFixed(1) : null;
  const profit = cost > 0 && activePrice > 0 ? +(activePrice - cost).toFixed(2) : null;
  const marginOk = margin !== null && margin >= minMargin;

  const bars = [
    { name: "Cost", value: cost, fill: "hsl(var(--muted-foreground))" },
    { name: "RRP", value: rrp || 0, fill: "hsl(var(--primary) / 0.5)" },
    { name: "Suggested", value: suggested, fill: "hsl(var(--primary) / 0.75)" },
    ...(compMedian != null ? [{ name: "Comp Median", value: compMedian, fill: "hsl(var(--accent-foreground) / 0.6)" }] : []),
    { name: "eBay Price", value: activePrice, fill: "hsl(var(--primary))" },
  ].filter((b) => b.value > 0);

  return (
    <Card className="bg-muted/30 border">
      <CardContent className="pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
            Pricing Intelligence
          </h4>
          {margin !== null && (
            <Badge
              variant="outline"
              className={`text-[10px] ${
                marginOk
                  ? "border-emerald-400 text-emerald-600"
                  : "border-destructive text-destructive"
              }`}
            >
              {marginOk ? "✓" : "⚠"} {margin}% margin
            </Badge>
          )}
        </div>

        {/* Chart */}
        <div className="h-28">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
              <XAxis type="number" hide domain={[0, "auto"]} />
              <YAxis
                type="category"
                dataKey="name"
                width={75}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value: number) => [`$${value.toFixed(2)}`, ""]}
                contentStyle={{
                  fontSize: 11,
                  borderRadius: 6,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--popover))",
                  color: "hsl(var(--popover-foreground))",
                }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
                {bars.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <StatCell label="Cost" value={cost} />
          <StatCell label="RRP" value={rrp} />
          <StatCell label="Suggested" value={suggested} highlight />
          <StatCell
            label="Profit"
            value={profit}
            prefix=""
            suffix=""
            customValue={profit !== null ? `$${profit}` : "—"}
          />
        </div>

        {compMedian != null && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>Comp Median:</span>
            <span className="font-medium text-foreground">${compMedian.toFixed(2)}</span>
            {activePrice > 0 && compMedian > 0 && (
              <Badge variant="outline" className="text-[9px]">
                {activePrice < compMedian ? "Below" : activePrice > compMedian ? "Above" : "At"} market
              </Badge>
            )}
          </div>
        )}

        {margin !== null && !marginOk && (
          <p className="text-[11px] text-destructive">
            ⚠ Margin is below the {minMargin}% minimum threshold
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatCell({
  label,
  value,
  prefix = "$",
  suffix = "",
  highlight = false,
  customValue,
}: {
  label: string;
  value: number | null;
  prefix?: string;
  suffix?: string;
  highlight?: boolean;
  customValue?: string;
}) {
  const display = customValue ?? (value != null && value > 0 ? `${prefix}${value.toFixed(2)}${suffix}` : "—");
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${highlight ? "text-primary" : ""}`}>{display}</div>
    </div>
  );
}
