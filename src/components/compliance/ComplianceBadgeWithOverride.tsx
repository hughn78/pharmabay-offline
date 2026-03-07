import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import { ComplianceOverrideDialog } from "./ComplianceOverrideDialog";

interface Props {
  productId: string;
  productName: string;
  status?: string | null;
  reasons?: string[] | null;
  showOverrideButton?: boolean;
}

export function ComplianceBadgeWithOverride({
  productId,
  productName,
  status,
  reasons,
  showOverrideButton = true,
}: Props) {
  const [overrideOpen, setOverrideOpen] = useState(false);

  const statusLabel = status?.replace("_", " ") || "unknown";
  const cls =
    status === "blocked"
      ? "status-blocked"
      : status === "review_required"
      ? "status-review"
      : status === "permitted"
      ? "status-permitted"
      : "";

  return (
    <div className="flex items-center gap-2">
      <Badge className={`text-[10px] ${cls}`}>{statusLabel}</Badge>

      {showOverrideButton && (status === "blocked" || status === "review_required") && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            setOverrideOpen(true);
          }}
        >
          <ShieldAlert className="h-3 w-3 mr-1" />
          Override
        </Button>
      )}

      <ComplianceOverrideDialog
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        productId={productId}
        productName={productName}
        currentStatus={status || ""}
        complianceReasons={reasons || []}
      />
    </div>
  );
}
