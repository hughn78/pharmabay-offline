import { supabase } from "@/integrations/supabase/client";

/**
 * Uploads a CSV string to Supabase storage and returns the public URL.
 * Falls back to a data-URI if storage upload fails.
 */
export async function uploadExportCsv(
  csvContent: string,
  filename: string
): Promise<string> {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const storagePath = `exports/${filename}`;

  const { error } = await supabase.storage
    .from("product-images")
    .upload(storagePath, blob, {
      contentType: "text/csv",
      upsert: true,
    });

  if (error) {
    console.warn("Storage upload failed, using data URI fallback:", error.message);
    // Fallback: base64 data URI
    const base64 = btoa(
      new Uint8Array(await blob.arrayBuffer()).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        ""
      )
    );
    return `data:text/csv;base64,${base64}`;
  }

  const { data: urlData } = supabase.storage
    .from("product-images")
    .getPublicUrl(storagePath);

  return urlData.publicUrl;
}
