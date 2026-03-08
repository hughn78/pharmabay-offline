import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export default function EbayCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Exchanging eBay authorization code...");

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      setStatus("error");
      setMessage("No authorization code found in URL. Did eBay redirect correctly?");
      return;
    }

    (async () => {
      try {
        const res = await supabase.functions.invoke("ebay-auth", {
          body: { action: "exchange_code", code },
        });
        if (res.error) throw new Error(res.error.message);
        if (res.data?.error) throw new Error(res.data.error);
        setStatus("success");
        setMessage("eBay account connected successfully! Redirecting to settings...");
        setTimeout(() => navigate("/settings"), 2000);
      } catch (err: any) {
        setStatus("error");
        setMessage(err.message || "Failed to exchange authorization code");
      }
    })();
  }, [searchParams, navigate]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          {status === "loading" && <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />}
          {status === "success" && <CheckCircle className="h-10 w-10 mx-auto text-emerald-500" />}
          {status === "error" && <XCircle className="h-10 w-10 mx-auto text-destructive" />}
          <p className="text-sm text-muted-foreground">{message}</p>
          {status === "error" && (
            <Button variant="outline" onClick={() => navigate("/settings")}>
              Back to Settings
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
