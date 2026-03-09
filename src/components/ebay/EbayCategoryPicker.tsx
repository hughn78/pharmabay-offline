import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface EbayCategoryPickerProps {
  value: string;
  onChange: (categoryId: string, categoryName: string) => void;
}

export function EbayCategoryPicker({ value, onChange }: EbayCategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);

  // Fetch matching categories
  const { data: categories, isLoading } = useQuery({
    queryKey: ["ebay-categories-search", debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.length < 2) {
        // Show popular top-level leaf categories
        const { data, error } = await supabase
          .from("ebay_categories")
          .select("category_id, category_name, is_leaf, category_level")
          .eq("is_leaf", true)
          .order("category_name")
          .limit(50);
        if (error) throw error;
        return data || [];
      }

      const { data, error } = await supabase
        .from("ebay_categories")
        .select("category_id, category_name, is_leaf, category_level")
        .ilike("category_name", `%${debouncedSearch}%`)
        .order("is_leaf", { ascending: false })
        .order("category_name")
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // Resolve selected category name
  const { data: selectedCat } = useQuery({
    queryKey: ["ebay-category-by-id", value],
    queryFn: async () => {
      if (!value) return null;
      const { data } = await supabase
        .from("ebay_categories")
        .select("category_id, category_name")
        .eq("category_id", value)
        .maybeSingle();
      return data;
    },
    enabled: !!value,
  });

  const displayText = selectedCat
    ? `${selectedCat.category_name} (${selectedCat.category_id})`
    : value || "Select category…";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal text-left h-auto min-h-10 py-2"
        >
          <span className="truncate">{displayText}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            placeholder="Search eBay categories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <ScrollArea className="h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : !categories?.length ? (
            <p className="text-center py-6 text-sm text-muted-foreground">
              {debouncedSearch ? "No categories found." : "Type to search categories…"}
            </p>
          ) : (
            <div className="p-1">
              {categories.map((cat) => (
                <button
                  key={cat.category_id}
                  onClick={() => {
                    onChange(cat.category_id!, cat.category_name!);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                    value === cat.category_id && "bg-accent"
                  )}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === cat.category_id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="flex-1 text-left truncate">{cat.category_name}</span>
                  <Badge variant="outline" className="ml-2 text-[10px] font-mono shrink-0">
                    {cat.category_id}
                  </Badge>
                  {cat.is_leaf && (
                    <Badge variant="secondary" className="ml-1 text-[10px] shrink-0">leaf</Badge>
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
