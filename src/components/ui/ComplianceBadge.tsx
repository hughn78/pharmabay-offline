import { Badge } from "@/components/ui/badge";

interface ComplianceBadgeProps {
  status?: string | null;
}

export function ComplianceBadge({ status }: ComplianceBadgeProps) {
  if (!status) return null;
  const map: Record<string, string> = {
    permitted: "status-permitted",
    review_required: "status-review",
    blocked: "status-blocked",
  };
  return (
    <Badge className={`text-[10px] ${map[status] || ""}`}>
      {status.replace("_", " ")}
    </Badge>
  );
}
