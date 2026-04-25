import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  dbQuery: (sql: string, params: any[]) => ipcRenderer.invoke('db-query', sql, params),
  migrateData: (url: string, key: string) => ipcRenderer.invoke('migrate-data', url, key),
  pickSqliteFile: () => ipcRenderer.invoke('pick-sqlite-file'),
  importSqlite: (filePath: string) => ipcRenderer.invoke('import-sqlite', filePath),
  aiGenerateDescription: (body: any) => ipcRenderer.invoke('ai-generate-description', body),
  marketResearch: (body: any) => ipcRenderer.invoke('market-research', body),
  getSetting: (key: string) => ipcRenderer.invoke('get-setting', key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('set-setting', key, value),

  // Shopify Admin API (direct, no Supabase)
  shopifyTestAuth: () => ipcRenderer.invoke('shopify-test-auth'),
  shopifyGetLocations: () => ipcRenderer.invoke('shopify-get-locations'),
  shopifyRefreshProducts: () => ipcRenderer.invoke('shopify-refresh-products'),
  shopifySyncPreview: () => ipcRenderer.invoke('shopify-sync-preview'),
  shopifySyncExecute: (body: any) => ipcRenderer.invoke('shopify-sync-execute', body),
  // eBay OAuth & API (direct — no Supabase)
  ebayGetAuthUrl: () => ipcRenderer.invoke('ebay-get-auth-url'),
  ebayExchangeCode: (code: string) => ipcRenderer.invoke('ebay-exchange-code', code),
  ebayRefreshToken: () => ipcRenderer.invoke('ebay-refresh-token'),
  ebayTestConnection: () => ipcRenderer.invoke('ebay-test-connection'),
  ebaySaveSettings: (settings: any) => ipcRenderer.invoke('ebay-save-settings', settings),
  ebayGetStatus: () => ipcRenderer.invoke('ebay-get-status'),
});
