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
    };
  }
}
