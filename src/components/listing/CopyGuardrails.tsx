import { useMemo } from "react";
import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import { checkCopyCompliance, type CopyWarning } from "@/lib/listingBuilder";

interface CopyGuardrailsProps {
  title: string;
  description: string;
  ingredientsSummary?: string;
  product?: Record<string, unknown>;
}

export function CopyGuardrails({
  title,
  description,
  ingredientsSummary,
  product,
}: CopyGuardrailsProps) {
  const warnings = useMemo(
    () => checkCopyCompliance(title, description, ingredientsSummary, product),
    [title, description, ingredientsSummary, product]
  );

  if (warnings.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        <ShieldAlert className="h-3.5 w-3.5" />
        Copy Compliance
      </div>
      {warnings.map((w, i) => (
        <GuardrailRow key={i} warning={w} />
      ))}
    </div>
  );
}

function GuardrailRow({ warning }: { warning: CopyWarning }) {
  const Icon = warning.level === "error" ? ShieldAlert : warning.level === "warning" ? AlertTriangle : Info;
  const bgClass =
    warning.level === "error"
      ? "bg-destructive/10 text-destructive"
      : warning.level === "warning"
        ? "bg-warning/10 text-foreground"
        : "bg-muted/50 text-muted-foreground";

  return (
    <div className={`flex items-start gap-2 text-[11px] rounded-md px-2.5 py-1.5 ${bgClass}`}>
      <Icon className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
      <div>
        <span>{warning.message}</span>
        {warning.suggestion && (
          <span className="block mt-0.5 text-muted-foreground italic">
            💡 {warning.suggestion}
          </span>
        )}
      </div>
    </div>
  );
}
