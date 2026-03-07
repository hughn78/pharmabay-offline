import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import ScanSearch from "./pages/ScanSearch";
import Products from "./pages/Products";
import ReviewQueue from "./pages/ReviewQueue";
import Exports from "./pages/Exports";
import ImportStock from "./pages/ImportStock";
import ChannelSync from "./pages/ChannelSync";
import Settings from "./pages/Settings";
import AuditLog from "./pages/AuditLog";
import ProductEditor from "./pages/ProductEditor";
import ShopifyReconciliation from "./pages/ShopifyReconciliation";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<ScanSearch />} />
            <Route path="/products" element={<Products />} />
            <Route path="/products/:id" element={<ProductEditor />} />
            <Route path="/review" element={<ReviewQueue />} />
            <Route path="/exports" element={<Exports />} />
            <Route path="/import" element={<ImportStock />} />
            <Route path="/sync" element={<ChannelSync />} />
            <Route path="/reconciliation" element={<ShopifyReconciliation />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/audit" element={<AuditLog />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
