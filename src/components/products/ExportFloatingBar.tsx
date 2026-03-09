import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { X, ArrowRight, Sparkles } from "lucide-react";
import { useExportCart } from "@/stores/useExportCart";
import { motion, AnimatePresence } from "framer-motion";

export function ExportFloatingBar() {
  const { count, clearAll } = useExportCart();
  const navigate = useNavigate();

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="flex items-center gap-3 rounded-full border bg-background/95 backdrop-blur px-5 py-2.5 shadow-lg">
            <span className="text-sm font-medium whitespace-nowrap">
              {count} product{count !== 1 ? "s" : ""} selected
            </span>
            <Button size="sm" variant="ghost" onClick={clearAll}>
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
            <Button
              size="sm"
              onClick={() => navigate("/exports/new")}
            >
              Review Export <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
