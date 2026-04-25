export {};

declare global {
  interface Window {
    electronAPI: {
      dbQuery: (sql: string, params?: any[]) => Promise<{ data: any; error: string | null }>;
      migrateData: (url: string, key: string) => Promise<{ data: any; error: string | null }>;
      pickSqliteFile: () => Promise<{ data: string | null; error: string | null }>;
      importSqlite: (filePath: string) => Promise<{ data: any; error: string | null }>;
      aiGenerateDescription: (body: any) => Promise<{ data: any; error: any }>;
      marketResearch: (body: any) => Promise<{ data: any; error: any }>;
      getSetting: (key: string) => Promise<{ data: string | null; error: string | null }>;
      setSetting: (key: string, value: string) => Promise<{ data: boolean; error: string | null }>;

      // Shopify Admin API
      shopifyTestAuth: () => Promise<{ data: { ok: boolean; sampleProductCount: number } | null; error: string | null }>;
      shopifyGetLocations: () => Promise<{ data: { id: number; name: string; address1?: string }[] | null; error: string | null }>;
      shopifyRefreshProducts: () => Promise<{ data: { refreshed: number; variants: number; apiCalls: number } | null; error: string | null }>;
      shopifySyncPreview: () => Promise<{ data: { sync_run_id: string; total: number; matched: number; update_needed: number; no_match: number } | null; error: string | null }>;
      shopifySyncExecute: (body: { action: 'sync_matched' | 'sync_selected'; sync_run_id?: string; selected_item_ids?: string[] }) => Promise<{ data: { synced: number; failed: number; apiCalls: number } | null; error: string | null }>;

      // eBay OAuth & API
      ebayGetAuthUrl: () => Promise<{ data: { auth_url: string } | null; error: string | null }>;
      ebayExchangeCode: (code: string) => Promise<{ data: { success: boolean; message: string } | null; error: string | null }>;
      ebayRefreshToken: () => Promise<{ data: { success: boolean } | null; error: string | null }>;
      ebayTestConnection: () => Promise<{ data: { success: boolean; privileges: any } | null; error: string | null }>;
      ebaySaveSettings: (settings: Record<string, any>) => Promise<{ data: { success: boolean } | null; error: string | null }>;
      ebayGetStatus: () => Promise<{ data: { connected: boolean; status: string; username: string; environment: string; marketplace_id: string; merchant_location_key: string; fulfillment_policy_id: string; payment_policy_id: string; return_policy_id: string; ru_name: string; client_id: string; has_refresh_token: boolean; token_expires_at: string } | null; error: string | null }>;
    };
  }
}
