import { Button } from "@/components/ui/button";
import { ArrowUpDown } from "lucide-react";

export type SortMode = "quality" | "dimensions" | "recent";

interface Props {
  current: SortMode;
  onChange: (mode: SortMode) => void;
}

const OPTIONS: { value: SortMode; label: string }[] = [
  { value: "quality", label: "Best quality" },
  { value: "dimensions", label: "Largest" },
  { value: "recent", label: "Most recent" },
];

export function ImageSortControls({ current, onChange }: Props) {
  return (
    <div className="flex items-center gap-1.5">
      <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
      {OPTIONS.map((opt) => (
        <Button
          key={opt.value}
          size="sm"
          variant={current === opt.value ? "default" : "outline"}
          className="h-6 text-[10px] px-2"
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
