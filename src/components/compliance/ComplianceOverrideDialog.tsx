import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  currentStatus: string;
  complianceReasons: string[];
}

export function ComplianceOverrideDialog({
  open,
  onOpenChange,
  productId,
  productName,
  currentStatus,
  complianceReasons,
}: Props) {
  const [newStatus, setNewStatus] = useState<string>("permitted");
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();

  const overrideMutation = useMutation({
    mutationFn: async () => {
      if (!reason.trim()) throw new Error("Override reason is required");

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check role — only owner/manager can override
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const userRoles = (roles ?? []).map((r) => r.role);
      if (!userRoles.includes("owner") && !userRoles.includes("manager")) {
        throw new Error("Only owners and managers can override compliance status");
      }

      // Get current product state for audit
      const { data: before } = await supabase
        .from("products")
        .select("compliance_status,compliance_reasons")
        .eq("id", productId)
        .single();

      // Update compliance status
      const { error: updateError } = await supabase
        .from("products")
        .update({
          compliance_status: newStatus,
          compliance_reasons:
            newStatus === "permitted"
              ? []
              : [`Override: ${reason}`],
        })
        .eq("id", productId);

      if (updateError) throw updateError;

      // Log to change_log
      const { error: logError } = await supabase.from("change_log").insert({
        entity_type: "product",
        entity_id: productId,
        action: "compliance_override",
        changed_by: user.id,
        before_json: before as any,
        after_json: {
          compliance_status: newStatus,
          override_reason: reason,
          previous_status: currentStatus,
          previous_reasons: complianceReasons,
        },
      });

      if (logError) console.error("Audit log failed:", logError);
    },
    onSuccess: () => {
      toast.success("Compliance status overridden");
      queryClient.invalidateQueries({ queryKey: ["product", productId] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      onOpenChange(false);
      setReason("");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            Compliance Override
          </DialogTitle>
          <DialogDescription>
            Override the compliance status for this product. This action is logged and requires a
            mandatory reason.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs text-muted-foreground">Product</Label>
            <p className="text-sm font-medium truncate">{productName}</p>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Current Status</Label>
            <div className="mt-1">
              <Badge
                className={`text-xs ${
                  currentStatus === "blocked"
                    ? "status-blocked"
                    : currentStatus === "review_required"
                    ? "status-review"
                    : "status-permitted"
                }`}
              >
                {currentStatus?.replace("_", " ") || "unknown"}
              </Badge>
            </div>
          </div>

          {complianceReasons.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground">Reasons</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {complianceReasons.map((r, i) => (
                  <Badge key={i} variant="outline" className="text-[10px]">
                    {r}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>New Status</Label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="permitted">Permitted</SelectItem>
                <SelectItem value="review_required">Review Required</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>
              Override Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this override is safe and justified..."
              className="min-h-[80px]"
            />
            <p className="text-[11px] text-muted-foreground">
              This reason will be permanently recorded in the audit log.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => overrideMutation.mutate()}
            disabled={!reason.trim() || overrideMutation.isPending}
            variant="destructive"
          >
            {overrideMutation.isPending ? "Saving..." : "Confirm Override"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
