import { useState, useEffect, useRef, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, AlertCircle } from "lucide-react";

interface AutosaveStatusProps {
  /** Whether the form has unsaved changes */
  hasChanges: boolean;
  /** Async function to persist the data */
  onSave: () => Promise<void>;
  /** Interval in ms (default 30000 = 30s) */
  intervalMs?: number;
}

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Autosave hook + status display.
 * Saves every `intervalMs` if there are unsaved changes.
 * Also blocks navigation when there are unsaved changes.
 */
export function useAutosave({
  hasChanges,
  onSave,
  intervalMs = 30000,
}: AutosaveStatusProps) {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const hasChangesRef = useRef(hasChanges);
  hasChangesRef.current = hasChanges;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const doSave = useCallback(async () => {
    if (!hasChangesRef.current) return;
    setSaveState("saving");
    try {
      await onSaveRef.current();
      setSaveState("saved");
      setLastSaved(new Date());
    } catch {
      setSaveState("error");
    }
  }, []);

  // Autosave interval
  useEffect(() => {
    const timer = setInterval(() => {
      if (hasChangesRef.current) {
        doSave();
      }
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, doSave]);

  // Navigation protection
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasChangesRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  return { saveState, lastSaved, doSave };
}

export function AutosaveIndicator({
  saveState,
  lastSaved,
  hasChanges,
}: {
  saveState: SaveState;
  lastSaved: Date | null;
  hasChanges: boolean;
}) {
  const getTimeSince = () => {
    if (!lastSaved) return "";
    const secs = Math.floor((Date.now() - lastSaved.getTime()) / 1000);
    if (secs < 5) return "just now";
    if (secs < 60) return `${secs}s ago`;
    return `${Math.floor(secs / 60)}m ago`;
  };

  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 10000);
    return () => clearInterval(t);
  }, []);

  if (saveState === "saving") {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </Badge>
    );
  }

  if (saveState === "error") {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 border-destructive text-destructive">
        <AlertCircle className="h-3 w-3" /> Save failed
      </Badge>
    );
  }

  if (saveState === "saved" && lastSaved) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
        <Check className="h-3 w-3" /> Draft saved {getTimeSince()}
      </Badge>
    );
  }

  if (hasChanges) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
        Unsaved changes
      </Badge>
    );
  }

  return null;
}
