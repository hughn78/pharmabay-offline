import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Shield, Plus, Pencil, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BLOCK_SIGNALS, REVIEW_SIGNALS } from "@/lib/compliance-engine";

const MATCH_FIELDS = [
  { value: "source_product_name", label: "Product Name" },
  { value: "department", label: "Department" },
  { value: "z_category", label: "Category" },
  { value: "brand", label: "Brand" },
  { value: "notes_internal", label: "Internal Notes" },
  { value: "ebay_title", label: "eBay Title" },
  { value: "shopify_title", label: "Shopify Title" },
  { value: "all_text", label: "All Text Fields" },
];

const OPERATORS = [
  { value: "contains", label: "Contains" },
  { value: "not_contains", label: "Does Not Contain" },
  { value: "equals", label: "Equals" },
  { value: "starts_with", label: "Starts With" },
  { value: "ends_with", label: "Ends With" },
  { value: "regex", label: "Regex" },
  { value: "is_empty", label: "Is Empty" },
  { value: "is_not_empty", label: "Is Not Empty" },
];

const ACTIONS = [
  { value: "block", label: "Block", color: "status-blocked" },
  { value: "review", label: "Review", color: "status-review" },
  { value: "permit", label: "Permit", color: "status-permitted" },
];

interface RuleForm {
  rule_name: string;
  rule_type: string;
  match_field: string;
  operator: string;
  match_value: string;
  action: string;
  reason: string;
  priority: number;
  is_active: boolean;
}

const emptyRule: RuleForm = {
  rule_name: "",
  rule_type: "keyword",
  match_field: "source_product_name",
  operator: "contains",
  match_value: "",
  action: "block",
  reason: "",
  priority: 100,
  is_active: true,
};

export function ComplianceRuleEditor() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyRule);

  const { data: rules = [] } = useQuery({
    queryKey: ["compliance-rules"],
    queryFn: async () => {
      const { data } = await supabase
        .from("compliance_rules")
        .select("*")
        .order("priority");
      return data || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.rule_name.trim()) throw new Error("Rule name is required");
      const payload = {
        rule_name: form.rule_name,
        rule_type: form.rule_type,
        match_field: form.match_field,
        operator: form.operator,
        match_value: form.match_value,
        action: form.action,
        reason: form.reason,
        priority: form.priority,
        is_active: form.is_active,
      };

      if (editingId) {
        const { error } = await supabase
          .from("compliance_rules")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("compliance_rules").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Rule updated" : "Rule created");
      queryClient.invalidateQueries({ queryKey: ["compliance-rules"] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyRule);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("compliance_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rule deleted");
      queryClient.invalidateQueries({ queryKey: ["compliance-rules"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("compliance_rules")
        .update({ is_active: active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["compliance-rules"] }),
  });

  const openEdit = (rule: any) => {
    setEditingId(rule.id);
    setForm({
      rule_name: rule.rule_name ?? "",
      rule_type: rule.rule_type ?? "keyword",
      match_field: rule.match_field ?? "source_product_name",
      operator: rule.operator ?? "contains",
      match_value: rule.match_value ?? "",
      action: rule.action ?? "block",
      reason: rule.reason ?? "",
      priority: rule.priority ?? 100,
      is_active: rule.is_active ?? true,
    });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyRule);
    setDialogOpen(true);
  };

  const actionBadge = (action: string) => {
    const cls =
      action === "block"
        ? "status-blocked"
        : action === "review"
        ? "status-review"
        : "status-permitted";
    return <Badge className={`text-[10px] ${cls}`}>{action}</Badge>;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4" /> Compliance Rules
        </CardTitle>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Rule
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Built-in signals notice */}
        <div className="rounded-md border border-dashed p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Built-in Block Signals (always active)</p>
          <div className="flex flex-wrap gap-1">
            {BLOCK_SIGNALS.map((s) => (
              <Badge key={s} variant="destructive" className="text-[10px]">{s}</Badge>
            ))}
          </div>
          <p className="text-xs font-medium text-muted-foreground mt-2">Built-in Review Signals</p>
          <div className="flex flex-wrap gap-1">
            {REVIEW_SIGNALS.map((s) => (
              <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
            ))}
          </div>
        </div>

        {/* Rules table */}
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No custom compliance rules configured. Built-in signals are still active.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Priority</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Operator</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs font-mono">{r.priority}</TableCell>
                    <TableCell className="font-medium text-sm">{r.rule_name}</TableCell>
                    <TableCell className="text-xs">
                      {MATCH_FIELDS.find((f) => f.value === r.match_field)?.label || r.match_field}
                    </TableCell>
                    <TableCell className="text-xs">
                      {OPERATORS.find((o) => o.value === r.operator)?.label || r.operator}
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[120px] truncate">
                      {r.match_value}
                    </TableCell>
                    <TableCell>{actionBadge(r.action)}</TableCell>
                    <TableCell>
                      <Switch
                        checked={r.is_active}
                        onCheckedChange={(checked) =>
                          toggleActive.mutate({ id: r.id, active: checked })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => openEdit(r)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => {
                            if (confirm("Delete this rule?")) deleteMutation.mutate(r.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Rule" : "Add Compliance Rule"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Rule Name</Label>
                  <Input
                    value={form.rule_name}
                    onChange={(e) => setForm({ ...form, rule_name: e.target.value })}
                    placeholder="e.g. Block S3 products"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Priority (lower = first)</Label>
                  <Input
                    type="number"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 100 })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Match Field</Label>
                  <Select
                    value={form.match_field}
                    onValueChange={(v) => setForm({ ...form, match_field: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MATCH_FIELDS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Operator</Label>
                  <Select
                    value={form.operator}
                    onValueChange={(v) => setForm({ ...form, operator: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {OPERATORS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Match Value</Label>
                <Input
                  value={form.match_value}
                  onChange={(e) => setForm({ ...form, match_value: e.target.value })}
                  placeholder="e.g. prescription"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Action</Label>
                  <Select
                    value={form.action}
                    onValueChange={(v) => setForm({ ...form, action: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACTIONS.map((a) => (
                        <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Active</Label>
                  <div className="pt-2">
                    <Switch
                      checked={form.is_active}
                      onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Reason (shown to staff)</Label>
                <Input
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="e.g. Schedule 3 medicines cannot be listed online"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editingId ? "Update Rule" : "Create Rule"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
