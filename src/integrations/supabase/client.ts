// This file acts as a drop-in replacement for the Supabase JS client.
// It intercepts standard PostgREST queries and routes them to the local SQLite DB via Electron IPC.

class SupabaseMockClient {
  auth = {
    getSession: async () => ({ data: { session: { user: { id: 'local-user' } } }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signOut: async () => ({ error: null }),
    signInWithPassword: async () => ({ data: { session: {} }, error: null }),
  };

  storage = {
    from: (bucket: string) => ({
      upload: async (path: string, file: any) => ({ data: { path }, error: null }),
      getPublicUrl: (path: string) => ({ data: { publicUrl: `file://local/storage/${bucket}/${path}` } }),
    })
  };

  functions = {
    invoke: async (functionName: string, options?: any) => {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI) {
        console.warn('Electron API not available for function:', functionName);
        return { data: null, error: null };
      }

      // Route AI functions to IPC handlers
      if (functionName === 'ai-generate-description' && electronAPI.aiGenerateDescription) {
        const result = await electronAPI.aiGenerateDescription(options?.body);
        return { data: result.data, error: result.error ? { message: result.error.message || result.error } : null };
      }
      if (functionName === 'market-research' && electronAPI.marketResearch) {
        const result = await electronAPI.marketResearch(options?.body);
        return { data: result.data, error: result.error ? { message: result.error.message || result.error } : null };
      }

      console.warn('Unhandled edge function:', functionName);
      return { data: null, error: null };
    }
  };

  from(tableName: string) {
    return new QueryBuilder(tableName);
  }
}

class QueryBuilder {
  private tableName: string;
  private action: 'select' | 'insert' | 'update' | 'upsert' | 'delete' | null = null;
  private selectedColumns: string = '*';
  private matchers: { col: string; op: string; val: any }[] = [];
  private orClauses: string[] = [];
  private orderFields: { col: string; ascending: boolean }[] = [];
  private limitCount: number | null = null;
  private offsetCount: number | null = null;
  private payload: any = null;
  private singleResult: boolean = false;
  private maybeSingleResult: boolean = false;
  private countMode: boolean = false;
  private headMode: boolean = false;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(cols: string = '*', options?: { count?: string; head?: boolean }) {
    this.action = 'select';
    this.selectedColumns = cols;
    if (options?.count) this.countMode = true;
    if (options?.head) this.headMode = true;
    return this;
  }

  insert(data: any | any[]) {
    this.action = 'insert';
    this.payload = data;
    return this;
  }

  update(data: any) {
    this.action = 'update';
    this.payload = data;
    return this;
  }

  upsert(data: any | any[], options?: any) {
    this.action = 'upsert';
    this.payload = data;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(col: string, val: any) { this.matchers.push({ col, op: '=', val }); return this; }
  neq(col: string, val: any) { this.matchers.push({ col, op: '!=', val }); return this; }
  gt(col: string, val: any) { this.matchers.push({ col, op: '>', val }); return this; }
  gte(col: string, val: any) { this.matchers.push({ col, op: '>=', val }); return this; }
  lt(col: string, val: any) { this.matchers.push({ col, op: '<', val }); return this; }
  lte(col: string, val: any) { this.matchers.push({ col, op: '<=', val }); return this; }
  in(col: string, vals: any[]) { this.matchers.push({ col, op: 'IN', val: vals }); return this; }
  not(col: string, op: string, val: any) { this.matchers.push({ col, op: `NOT ${op}`, val }); return this; }
  is(col: string, val: any) { this.matchers.push({ col, op: 'IS', val }); return this; }

  or(filterString: string) {
    // Parse PostgREST-style OR filter strings like "col1.ilike.%val%,col2.ilike.%val%"
    this.orClauses.push(filterString);
    return this;
  }

  order(col: string, options?: { ascending?: boolean }) {
    this.orderFields.push({ col, ascending: options?.ascending ?? true });
    return this;
  }

  range(from: number, to: number) {
    this.offsetCount = from;
    this.limitCount = to - from + 1;
    return this;
  }

  limit(count: number) { this.limitCount = count; return this; }
  single() { this.singleResult = true; return this; }
  maybeSingle() { this.maybeSingleResult = true; return this; }

  then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any): Promise<any> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private parseOrClause(clause: string, params: any[]): string {
    // Parse "col.ilike.%val%,col2.eq.val2" into SQL OR conditions
    const parts = clause.split(',');
    const conditions = parts.map(part => {
      const segments = part.split('.');
      if (segments.length < 3) return null;
      const col = segments[0];
      const op = segments[1];
      const val = segments.slice(2).join('.');

      switch (op) {
        case 'ilike':
          params.push(val);
          return `${col} LIKE ? COLLATE NOCASE`;
        case 'like':
          params.push(val);
          return `${col} LIKE ?`;
        case 'eq':
          params.push(val);
          return `${col} = ?`;
        case 'neq':
          params.push(val);
          return `${col} != ?`;
        case 'gt':
          params.push(val);
          return `${col} > ?`;
        case 'gte':
          params.push(val);
          return `${col} >= ?`;
        case 'lt':
          params.push(val);
          return `${col} < ?`;
        case 'lte':
          params.push(val);
          return `${col} <= ?`;
        case 'is':
          if (val === 'null') return `${col} IS NULL`;
          return `${col} IS ${val}`;
        default:
          return null;
      }
    }).filter(Boolean);

    return conditions.length > 0 ? `(${conditions.join(' OR ')})` : '';
  }

  private async execute() {
    try {
      if (!this.action && this.payload) this.action = 'insert';
      if (!this.action && !this.payload) this.action = 'select';
      
      let sql = '';
      let params: any[] = [];

      if (this.action === 'select') {
        if (this.countMode && this.headMode) {
          sql = `SELECT COUNT(*) as count FROM "${this.tableName}"`;
        } else {
          sql = `SELECT ${this.selectedColumns} FROM "${this.tableName}"`;
        }
      } else if (this.action === 'insert') {
        const isArray = Array.isArray(this.payload);
        const records = isArray ? this.payload : [this.payload];
        if (records.length === 0) return { data: [], error: null };
        const keys = Object.keys(records[0]);
        const placeholders = keys.map(() => '?').join(', ');
        sql = `INSERT INTO "${this.tableName}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES `;
        sql += records.map(() => `(${placeholders})`).join(', ');
        for (const row of records) keys.forEach(k => params.push(row[k] ?? null));
      } else if (this.action === 'update') {
        const keys = Object.keys(this.payload);
        const assignments = keys.map(k => `"${k}" = ?`).join(', ');
        sql = `UPDATE "${this.tableName}" SET ${assignments}`;
        keys.forEach(k => params.push(this.payload[k] ?? null));
      } else if (this.action === 'delete') {
        sql = `DELETE FROM "${this.tableName}"`;
      } else if (this.action === 'upsert') {
         const isArray = Array.isArray(this.payload);
         const records = isArray ? this.payload : [this.payload];
         if (records.length === 0) return { data: [], error: null };
         const keys = Object.keys(records[0]);
         const placeholders = keys.map(() => '?').join(', ');
         sql = `INSERT OR REPLACE INTO "${this.tableName}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES `;
         sql += records.map(() => `(${placeholders})`).join(', ');
         for (const row of records) keys.forEach(k => params.push(row[k] ?? null));
      }

      // Build WHERE clauses
      const whereConditions: string[] = [];

      if (this.matchers.length > 0 && this.action !== 'insert' && this.action !== 'upsert') {
        for (const m of this.matchers) {
          if (m.op === 'IN') {
            if (!m.val || m.val.length === 0) { whereConditions.push('FALSE'); continue; }
            const plist = m.val.map(() => '?').join(', ');
            params.push(...m.val);
            whereConditions.push(`"${m.col}" IN (${plist})`);
          } else if (m.val === null && (m.op === 'IS' || m.op === 'is')) {
            whereConditions.push(`"${m.col}" IS NULL`);
          } else if (m.val === null && m.op.startsWith('NOT')) {
            whereConditions.push(`"${m.col}" IS NOT NULL`);
          } else {
            params.push(m.val);
            whereConditions.push(`"${m.col}" ${m.op} ?`);
          }
        }
      }

      // Handle OR clauses
      for (const orClause of this.orClauses) {
        const orSql = this.parseOrClause(orClause, params);
        if (orSql) whereConditions.push(orSql);
      }

      if (whereConditions.length > 0) {
        sql += ' WHERE ' + whereConditions.join(' AND ');
      }

      if (this.orderFields.length > 0 && this.action === 'select') {
        sql += ' ORDER BY ' + this.orderFields.map(o => `"${o.col}" ${o.ascending ? 'ASC' : 'DESC'}`).join(', ');
      }

      if (this.limitCount !== null && this.action === 'select') {
        sql += ` LIMIT ${this.limitCount}`;
      }

      if (this.offsetCount !== null && this.action === 'select') {
        sql += ` OFFSET ${this.offsetCount}`;
      }

      const electronAPI = (window as any).electronAPI;
      if (!electronAPI || !electronAPI.dbQuery) {
        console.error('Electron API not available');
        return { data: null, error: new Error('Local database connection failed.') };
      }

      const result: any = await electronAPI.dbQuery(sql, params);
      
      if (result.error) return { data: null, error: result.error };
      
      let data = result.data;

      // Handle count mode
      if (this.countMode && this.headMode) {
        const count = data && data.length > 0 ? data[0].count : 0;
        return { data: null, count, error: null };
      }

      if (this.singleResult) {
        if (!data || data.length === 0) return { data: null, error: new Error('No rows found') };
        data = data[0];
      } else if (this.maybeSingleResult) {
        data = data && data.length > 0 ? data[0] : null;
      }
      return { data, error: null };
    } catch (e: any) {
      return { data: null, error: e };
    }
  }
}

export const supabase = new SupabaseMockClient();