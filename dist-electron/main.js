import { app as Z, ipcMain as G, dialog as Xt, BrowserWindow as Pt } from "electron";
import ce from "path";
import rt from "better-sqlite3";
const zt = ce.join(Z.getPath("userData"), "pharmabay.sqlite"), $ = new rt(zt, { verbose: process.env.NODE_ENV === "development" ? console.log : void 0 });
function Jt() {
  $.pragma("journal_mode = WAL"), $.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      source_product_name TEXT,
      normalized_product_name TEXT,
      barcode TEXT,
      sku TEXT,
      brand TEXT,
      supplier TEXT,
      department TEXT,
      z_category TEXT,
      internal_category TEXT,
      product_type TEXT,
      product_form TEXT,
      strength TEXT,
      size_value TEXT,
      pack_size TEXT,
      flavour TEXT,
      variant TEXT,
      ingredients_summary TEXT,
      directions_summary TEXT,
      warnings_summary TEXT,
      claims_summary TEXT,
      artg_number TEXT,
      cost_price REAL,
      sell_price REAL,
      stock_on_hand REAL,
      stock_value REAL,
      units_sold_12m INTEGER,
      units_purchased_12m INTEGER,
      total_sales_value_12m REAL,
      total_cogs_12m REAL,
      gross_profit_percent REAL,
      last_purchased_at TEXT,
      last_sold_at TEXT,
      weight_grams INTEGER DEFAULT 200,
      quantity_reserved_for_store INTEGER DEFAULT 0,
      quantity_available_for_ebay INTEGER,
      quantity_available_for_shopify INTEGER,
      compliance_status TEXT,
      enrichment_status TEXT,
      enrichment_confidence TEXT,
      enrichment_summary TEXT,
      source_links TEXT,
      notes_internal TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS inventory_snapshots (
      id TEXT PRIMARY KEY,
      product_id TEXT,
      snapshot_date TEXT,
      stock_on_hand REAL,
      sell_price REAL,
      cost_price REAL,
      stock_value REAL,
      units_sold_12m INTEGER,
      source_batch_id TEXT,
      FOREIGN KEY(product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT PRIMARY KEY,
      filename TEXT,
      imported_at TEXT DEFAULT CURRENT_TIMESTAMP,
      imported_by TEXT,
      row_count INTEGER,
      new_count INTEGER,
      updated_count INTEGER,
      skipped_count INTEGER,
      error_count INTEGER,
      import_notes TEXT,
      raw_file_path TEXT
    );

    CREATE TABLE IF NOT EXISTS product_images (
      id TEXT PRIMARY KEY,
      product_id TEXT,
      source_type TEXT,
      source_page_url TEXT,
      original_url TEXT,
      local_storage_url TEXT,
      local_storage_path TEXT,
      width INTEGER,
      height INTEGER,
      alt_text TEXT,
      image_status TEXT,
      is_primary INTEGER DEFAULT 0,
      sort_order INTEGER,
      ebay_approved INTEGER DEFAULT 0,
      shopify_approved INTEGER DEFAULT 0,
      shopify_media_gid TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS ebay_drafts (
      id TEXT PRIMARY KEY,
      product_id TEXT,
      title TEXT,
      subtitle TEXT,
      description_html TEXT,
      description_plain TEXT,
      category_id TEXT,
      category_name TEXT,
      condition_id TEXT DEFAULT '1000',
      brand TEXT,
      mpn TEXT,
      epid TEXT,
      upc TEXT,
      ean TEXT,
      item_specifics TEXT,
      image_urls TEXT,
      quantity INTEGER,
      pricing_mode TEXT,
      start_price REAL,
      buy_it_now_price REAL,
      shipping_profile TEXT,
      return_profile TEXT,
      payment_profile TEXT,
      channel_status TEXT,
      validation_status TEXT,
      validation_errors TEXT,
      published_listing_id TEXT,
      created_by TEXT,
      approved_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS shopify_drafts (
      id TEXT PRIMARY KEY,
      product_id TEXT,
      shopify_product_gid TEXT,
      handle TEXT,
      title TEXT,
      description_html TEXT,
      vendor TEXT,
      product_category TEXT,
      product_type TEXT,
      tags TEXT,
      published_online_store INTEGER,
      status TEXT,
      seo_title TEXT,
      seo_description TEXT,
      google_product_category TEXT,
      google_gender TEXT,
      google_age_group TEXT,
      google_mpn TEXT,
      google_ad_group_name TEXT,
      google_ads_labels TEXT,
      google_condition TEXT,
      google_custom_product INTEGER,
      google_custom_label_0 TEXT,
      google_custom_label_1 TEXT,
      google_custom_label_2 TEXT,
      google_custom_label_3 TEXT,
      google_custom_label_4 TEXT,
      channel_status TEXT,
      validation_status TEXT,
      validation_errors TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}
function Yt(r, e = []) {
  return r.trim().toUpperCase().startsWith("SELECT") ? $.prepare(r).all(...e) : $.prepare(r).run(...e);
}
function Ne(r, e) {
  var t = {};
  for (var s in r) Object.prototype.hasOwnProperty.call(r, s) && e.indexOf(s) < 0 && (t[s] = r[s]);
  if (r != null && typeof Object.getOwnPropertySymbols == "function")
    for (var n = 0, s = Object.getOwnPropertySymbols(r); n < s.length; n++)
      e.indexOf(s[n]) < 0 && Object.prototype.propertyIsEnumerable.call(r, s[n]) && (t[s[n]] = r[s[n]]);
  return t;
}
function Qt(r, e, t, s) {
  function n(i) {
    return i instanceof t ? i : new t(function(a) {
      a(i);
    });
  }
  return new (t || (t = Promise))(function(i, a) {
    function o(u) {
      try {
        c(s.next(u));
      } catch (f) {
        a(f);
      }
    }
    function l(u) {
      try {
        c(s.throw(u));
      } catch (f) {
        a(f);
      }
    }
    function c(u) {
      u.done ? i(u.value) : n(u.value).then(o, l);
    }
    c((s = s.apply(r, e || [])).next());
  });
}
const Zt = (r) => r ? (...e) => r(...e) : (...e) => fetch(...e);
class st extends Error {
  constructor(e, t = "FunctionsError", s) {
    super(e), this.name = t, this.context = s;
  }
}
class er extends st {
  constructor(e) {
    super("Failed to send a request to the Edge Function", "FunctionsFetchError", e);
  }
}
class it extends st {
  constructor(e) {
    super("Relay Error invoking the Edge Function", "FunctionsRelayError", e);
  }
}
class at extends st {
  constructor(e) {
    super("Edge Function returned a non-2xx status code", "FunctionsHttpError", e);
  }
}
var Ge;
(function(r) {
  r.Any = "any", r.ApNortheast1 = "ap-northeast-1", r.ApNortheast2 = "ap-northeast-2", r.ApSouth1 = "ap-south-1", r.ApSoutheast1 = "ap-southeast-1", r.ApSoutheast2 = "ap-southeast-2", r.CaCentral1 = "ca-central-1", r.EuCentral1 = "eu-central-1", r.EuWest1 = "eu-west-1", r.EuWest2 = "eu-west-2", r.EuWest3 = "eu-west-3", r.SaEast1 = "sa-east-1", r.UsEast1 = "us-east-1", r.UsWest1 = "us-west-1", r.UsWest2 = "us-west-2";
})(Ge || (Ge = {}));
class tr {
  /**
   * Creates a new Functions client bound to an Edge Functions URL.
   *
   * @example
   * ```ts
   * import { FunctionsClient, FunctionRegion } from '@supabase/functions-js'
   *
   * const functions = new FunctionsClient('https://xyzcompany.supabase.co/functions/v1', {
   *   headers: { apikey: 'public-anon-key' },
   *   region: FunctionRegion.UsEast1,
   * })
   * ```
   */
  constructor(e, { headers: t = {}, customFetch: s, region: n = Ge.Any } = {}) {
    this.url = e, this.headers = t, this.region = n, this.fetch = Zt(s);
  }
  /**
   * Updates the authorization header
   * @param token - the new jwt token sent in the authorisation header
   * @example
   * ```ts
   * functions.setAuth(session.access_token)
   * ```
   */
  setAuth(e) {
    this.headers.Authorization = `Bearer ${e}`;
  }
  /**
   * Invokes a function
   * @param functionName - The name of the Function to invoke.
   * @param options - Options for invoking the Function.
   * @example
   * ```ts
   * const { data, error } = await functions.invoke('hello-world', {
   *   body: { name: 'Ada' },
   * })
   * ```
   */
  invoke(e) {
    return Qt(this, arguments, void 0, function* (t, s = {}) {
      var n;
      let i, a;
      try {
        const { headers: o, method: l, body: c, signal: u, timeout: f } = s;
        let d = {}, { region: h } = s;
        h || (h = this.region);
        const p = new URL(`${this.url}/${t}`);
        h && h !== "any" && (d["x-region"] = h, p.searchParams.set("forceFunctionRegion", h));
        let g;
        c && (o && !Object.prototype.hasOwnProperty.call(o, "Content-Type") || !o) ? typeof Blob < "u" && c instanceof Blob || c instanceof ArrayBuffer ? (d["Content-Type"] = "application/octet-stream", g = c) : typeof c == "string" ? (d["Content-Type"] = "text/plain", g = c) : typeof FormData < "u" && c instanceof FormData ? g = c : (d["Content-Type"] = "application/json", g = JSON.stringify(c)) : c && typeof c != "string" && !(typeof Blob < "u" && c instanceof Blob) && !(c instanceof ArrayBuffer) && !(typeof FormData < "u" && c instanceof FormData) ? g = JSON.stringify(c) : g = c;
        let _ = u;
        f && (a = new AbortController(), i = setTimeout(() => a.abort(), f), u ? (_ = a.signal, u.addEventListener("abort", () => a.abort())) : _ = a.signal);
        const y = yield this.fetch(p.toString(), {
          method: l || "POST",
          // headers priority is (high to low):
          // 1. invoke-level headers
          // 2. client-level headers
          // 3. default Content-Type header
          headers: Object.assign(Object.assign(Object.assign({}, d), this.headers), o),
          body: g,
          signal: _
        }).catch((R) => {
          throw new er(R);
        }), w = y.headers.get("x-relay-error");
        if (w && w === "true")
          throw new it(y);
        if (!y.ok)
          throw new at(y);
        let m = ((n = y.headers.get("Content-Type")) !== null && n !== void 0 ? n : "text/plain").split(";")[0].trim(), T;
        return m === "application/json" ? T = yield y.json() : m === "application/octet-stream" || m === "application/pdf" ? T = yield y.blob() : m === "text/event-stream" ? T = y : m === "multipart/form-data" ? T = yield y.formData() : T = yield y.text(), { data: T, error: null, response: y };
      } catch (o) {
        return {
          data: null,
          error: o,
          response: o instanceof at || o instanceof it ? o.context : void 0
        };
      } finally {
        i && clearTimeout(i);
      }
    });
  }
}
var rr = class extends Error {
  /**
  * @example
  * ```ts
  * import PostgrestError from '@supabase/postgrest-js'
  *
  * throw new PostgrestError({
  *   message: 'Row level security prevented the request',
  *   details: 'RLS denied the insert',
  *   hint: 'Check your policies',
  *   code: 'PGRST301',
  * })
  * ```
  */
  constructor(r) {
    super(r.message), this.name = "PostgrestError", this.details = r.details, this.hint = r.hint, this.code = r.code;
  }
}, sr = class {
  /**
  * Creates a builder configured for a specific PostgREST request.
  *
  * @example
  * ```ts
  * import PostgrestQueryBuilder from '@supabase/postgrest-js'
  *
  * const builder = new PostgrestQueryBuilder(
  *   new URL('https://xyzcompany.supabase.co/rest/v1/users'),
  *   { headers: new Headers({ apikey: 'public-anon-key' }) }
  * )
  * ```
  */
  constructor(r) {
    var e, t, s;
    this.shouldThrowOnError = !1, this.method = r.method, this.url = r.url, this.headers = new Headers(r.headers), this.schema = r.schema, this.body = r.body, this.shouldThrowOnError = (e = r.shouldThrowOnError) !== null && e !== void 0 ? e : !1, this.signal = r.signal, this.isMaybeSingle = (t = r.isMaybeSingle) !== null && t !== void 0 ? t : !1, this.urlLengthLimit = (s = r.urlLengthLimit) !== null && s !== void 0 ? s : 8e3, r.fetch ? this.fetch = r.fetch : this.fetch = fetch;
  }
  /**
  * If there's an error with the query, throwOnError will reject the promise by
  * throwing the error instead of returning it as part of a successful response.
  *
  * {@link https://github.com/supabase/supabase-js/issues/92}
  */
  throwOnError() {
    return this.shouldThrowOnError = !0, this;
  }
  /**
  * Set an HTTP header for the request.
  */
  setHeader(r, e) {
    return this.headers = new Headers(this.headers), this.headers.set(r, e), this;
  }
  then(r, e) {
    var t = this;
    this.schema === void 0 || (["GET", "HEAD"].includes(this.method) ? this.headers.set("Accept-Profile", this.schema) : this.headers.set("Content-Profile", this.schema)), this.method !== "GET" && this.method !== "HEAD" && this.headers.set("Content-Type", "application/json");
    const s = this.fetch;
    let n = s(this.url.toString(), {
      method: this.method,
      headers: this.headers,
      body: JSON.stringify(this.body),
      signal: this.signal
    }).then(async (i) => {
      let a = null, o = null, l = null, c = i.status, u = i.statusText;
      if (i.ok) {
        var f, d;
        if (t.method !== "HEAD") {
          var h;
          const y = await i.text();
          y === "" || (t.headers.get("Accept") === "text/csv" || t.headers.get("Accept") && (!((h = t.headers.get("Accept")) === null || h === void 0) && h.includes("application/vnd.pgrst.plan+text")) ? o = y : o = JSON.parse(y));
        }
        const g = (f = t.headers.get("Prefer")) === null || f === void 0 ? void 0 : f.match(/count=(exact|planned|estimated)/), _ = (d = i.headers.get("content-range")) === null || d === void 0 ? void 0 : d.split("/");
        g && _ && _.length > 1 && (l = parseInt(_[1])), t.isMaybeSingle && t.method === "GET" && Array.isArray(o) && (o.length > 1 ? (a = {
          code: "PGRST116",
          details: `Results contain ${o.length} rows, application/vnd.pgrst.object+json requires 1 row`,
          hint: null,
          message: "JSON object requested, multiple (or no) rows returned"
        }, o = null, l = null, c = 406, u = "Not Acceptable") : o.length === 1 ? o = o[0] : o = null);
      } else {
        var p;
        const g = await i.text();
        try {
          a = JSON.parse(g), Array.isArray(a) && i.status === 404 && (o = [], a = null, c = 200, u = "OK");
        } catch {
          i.status === 404 && g === "" ? (c = 204, u = "No Content") : a = { message: g };
        }
        if (a && t.isMaybeSingle && (!(a == null || (p = a.details) === null || p === void 0) && p.includes("0 rows")) && (a = null, c = 200, u = "OK"), a && t.shouldThrowOnError) throw new rr(a);
      }
      return {
        error: a,
        data: o,
        count: l,
        status: c,
        statusText: u
      };
    });
    return this.shouldThrowOnError || (n = n.catch((i) => {
      var a;
      let o = "", l = "", c = "";
      const u = i == null ? void 0 : i.cause;
      if (u) {
        var f, d, h, p;
        const y = (f = u == null ? void 0 : u.message) !== null && f !== void 0 ? f : "", w = (d = u == null ? void 0 : u.code) !== null && d !== void 0 ? d : "";
        o = `${(h = i == null ? void 0 : i.name) !== null && h !== void 0 ? h : "FetchError"}: ${i == null ? void 0 : i.message}`, o += `

Caused by: ${(p = u == null ? void 0 : u.name) !== null && p !== void 0 ? p : "Error"}: ${y}`, w && (o += ` (${w})`), u != null && u.stack && (o += `
${u.stack}`);
      } else {
        var g;
        o = (g = i == null ? void 0 : i.stack) !== null && g !== void 0 ? g : "";
      }
      const _ = this.url.toString().length;
      return (i == null ? void 0 : i.name) === "AbortError" || (i == null ? void 0 : i.code) === "ABORT_ERR" ? (c = "", l = "Request was aborted (timeout or manual cancellation)", _ > this.urlLengthLimit && (l += `. Note: Your request URL is ${_} characters, which may exceed server limits. If selecting many fields, consider using views. If filtering with large arrays (e.g., .in('id', [many IDs])), consider using an RPC function to pass values server-side.`)) : ((u == null ? void 0 : u.name) === "HeadersOverflowError" || (u == null ? void 0 : u.code) === "UND_ERR_HEADERS_OVERFLOW") && (c = "", l = "HTTP headers exceeded server limits (typically 16KB)", _ > this.urlLengthLimit && (l += `. Your request URL is ${_} characters. If selecting many fields, consider using views. If filtering with large arrays (e.g., .in('id', [200+ IDs])), consider using an RPC function instead.`)), {
        error: {
          message: `${(a = i == null ? void 0 : i.name) !== null && a !== void 0 ? a : "FetchError"}: ${i == null ? void 0 : i.message}`,
          details: o,
          hint: l,
          code: c
        },
        data: null,
        count: null,
        status: 0,
        statusText: ""
      };
    })), n.then(r, e);
  }
  /**
  * Override the type of the returned `data`.
  *
  * @typeParam NewResult - The new result type to override with
  * @deprecated Use overrideTypes<yourType, { merge: false }>() method at the end of your call chain instead
  */
  returns() {
    return this;
  }
  /**
  * Override the type of the returned `data` field in the response.
  *
  * @typeParam NewResult - The new type to cast the response data to
  * @typeParam Options - Optional type configuration (defaults to { merge: true })
  * @typeParam Options.merge - When true, merges the new type with existing return type. When false, replaces the existing types entirely (defaults to true)
  * @example
  * ```typescript
  * // Merge with existing types (default behavior)
  * const query = supabase
  *   .from('users')
  *   .select()
  *   .overrideTypes<{ custom_field: string }>()
  *
  * // Replace existing types completely
  * const replaceQuery = supabase
  *   .from('users')
  *   .select()
  *   .overrideTypes<{ id: number; name: string }, { merge: false }>()
  * ```
  * @returns A PostgrestBuilder instance with the new type
  */
  overrideTypes() {
    return this;
  }
}, nr = class extends sr {
  /**
  * Perform a SELECT on the query result.
  *
  * By default, `.insert()`, `.update()`, `.upsert()`, and `.delete()` do not
  * return modified rows. By calling this method, modified rows are returned in
  * `data`.
  *
  * @param columns - The columns to retrieve, separated by commas
  */
  select(r) {
    let e = !1;
    const t = (r ?? "*").split("").map((s) => /\s/.test(s) && !e ? "" : (s === '"' && (e = !e), s)).join("");
    return this.url.searchParams.set("select", t), this.headers.append("Prefer", "return=representation"), this;
  }
  /**
  * Order the query result by `column`.
  *
  * You can call this method multiple times to order by multiple columns.
  *
  * You can order referenced tables, but it only affects the ordering of the
  * parent table if you use `!inner` in the query.
  *
  * @param column - The column to order by
  * @param options - Named parameters
  * @param options.ascending - If `true`, the result will be in ascending order
  * @param options.nullsFirst - If `true`, `null`s appear first. If `false`,
  * `null`s appear last.
  * @param options.referencedTable - Set this to order a referenced table by
  * its columns
  * @param options.foreignTable - Deprecated, use `options.referencedTable`
  * instead
  */
  order(r, { ascending: e = !0, nullsFirst: t, foreignTable: s, referencedTable: n = s } = {}) {
    const i = n ? `${n}.order` : "order", a = this.url.searchParams.get(i);
    return this.url.searchParams.set(i, `${a ? `${a},` : ""}${r}.${e ? "asc" : "desc"}${t === void 0 ? "" : t ? ".nullsfirst" : ".nullslast"}`), this;
  }
  /**
  * Limit the query result by `count`.
  *
  * @param count - The maximum number of rows to return
  * @param options - Named parameters
  * @param options.referencedTable - Set this to limit rows of referenced
  * tables instead of the parent table
  * @param options.foreignTable - Deprecated, use `options.referencedTable`
  * instead
  */
  limit(r, { foreignTable: e, referencedTable: t = e } = {}) {
    const s = typeof t > "u" ? "limit" : `${t}.limit`;
    return this.url.searchParams.set(s, `${r}`), this;
  }
  /**
  * Limit the query result by starting at an offset `from` and ending at the offset `to`.
  * Only records within this range are returned.
  * This respects the query order and if there is no order clause the range could behave unexpectedly.
  * The `from` and `to` values are 0-based and inclusive: `range(1, 3)` will include the second, third
  * and fourth rows of the query.
  *
  * @param from - The starting index from which to limit the result
  * @param to - The last index to which to limit the result
  * @param options - Named parameters
  * @param options.referencedTable - Set this to limit rows of referenced
  * tables instead of the parent table
  * @param options.foreignTable - Deprecated, use `options.referencedTable`
  * instead
  */
  range(r, e, { foreignTable: t, referencedTable: s = t } = {}) {
    const n = typeof s > "u" ? "offset" : `${s}.offset`, i = typeof s > "u" ? "limit" : `${s}.limit`;
    return this.url.searchParams.set(n, `${r}`), this.url.searchParams.set(i, `${e - r + 1}`), this;
  }
  /**
  * Set the AbortSignal for the fetch request.
  *
  * @param signal - The AbortSignal to use for the fetch request
  */
  abortSignal(r) {
    return this.signal = r, this;
  }
  /**
  * Return `data` as a single object instead of an array of objects.
  *
  * Query result must be one row (e.g. using `.limit(1)`), otherwise this
  * returns an error.
  */
  single() {
    return this.headers.set("Accept", "application/vnd.pgrst.object+json"), this;
  }
  /**
  * Return `data` as a single object instead of an array of objects.
  *
  * Query result must be zero or one row (e.g. using `.limit(1)`), otherwise
  * this returns an error.
  */
  maybeSingle() {
    return this.method === "GET" ? this.headers.set("Accept", "application/json") : this.headers.set("Accept", "application/vnd.pgrst.object+json"), this.isMaybeSingle = !0, this;
  }
  /**
  * Return `data` as a string in CSV format.
  */
  csv() {
    return this.headers.set("Accept", "text/csv"), this;
  }
  /**
  * Return `data` as an object in [GeoJSON](https://geojson.org) format.
  */
  geojson() {
    return this.headers.set("Accept", "application/geo+json"), this;
  }
  /**
  * Return `data` as the EXPLAIN plan for the query.
  *
  * You need to enable the
  * [db_plan_enabled](https://supabase.com/docs/guides/database/debugging-performance#enabling-explain)
  * setting before using this method.
  *
  * @param options - Named parameters
  *
  * @param options.analyze - If `true`, the query will be executed and the
  * actual run time will be returned
  *
  * @param options.verbose - If `true`, the query identifier will be returned
  * and `data` will include the output columns of the query
  *
  * @param options.settings - If `true`, include information on configuration
  * parameters that affect query planning
  *
  * @param options.buffers - If `true`, include information on buffer usage
  *
  * @param options.wal - If `true`, include information on WAL record generation
  *
  * @param options.format - The format of the output, can be `"text"` (default)
  * or `"json"`
  */
  explain({ analyze: r = !1, verbose: e = !1, settings: t = !1, buffers: s = !1, wal: n = !1, format: i = "text" } = {}) {
    var a;
    const o = [
      r ? "analyze" : null,
      e ? "verbose" : null,
      t ? "settings" : null,
      s ? "buffers" : null,
      n ? "wal" : null
    ].filter(Boolean).join("|"), l = (a = this.headers.get("Accept")) !== null && a !== void 0 ? a : "application/json";
    return this.headers.set("Accept", `application/vnd.pgrst.plan+${i}; for="${l}"; options=${o};`), i === "json" ? this : this;
  }
  /**
  * Rollback the query.
  *
  * `data` will still be returned, but the query is not committed.
  */
  rollback() {
    return this.headers.append("Prefer", "tx=rollback"), this;
  }
  /**
  * Override the type of the returned `data`.
  *
  * @typeParam NewResult - The new result type to override with
  * @deprecated Use overrideTypes<yourType, { merge: false }>() method at the end of your call chain instead
  */
  returns() {
    return this;
  }
  /**
  * Set the maximum number of rows that can be affected by the query.
  * Only available in PostgREST v13+ and only works with PATCH and DELETE methods.
  *
  * @param value - The maximum number of rows that can be affected
  */
  maxAffected(r) {
    return this.headers.append("Prefer", "handling=strict"), this.headers.append("Prefer", `max-affected=${r}`), this;
  }
};
const ot = /* @__PURE__ */ new RegExp("[,()]");
var ae = class extends nr {
  /**
  * Match only rows where `column` is equal to `value`.
  *
  * To check if the value of `column` is NULL, you should use `.is()` instead.
  *
  * @param column - The column to filter on
  * @param value - The value to filter with
  */
  eq(r, e) {
    return this.url.searchParams.append(r, `eq.${e}`), this;
  }
  /**
  * Match only rows where `column` is not equal to `value`.
  *
  * @param column - The column to filter on
  * @param value - The value to filter with
  */
  neq(r, e) {
    return this.url.searchParams.append(r, `neq.${e}`), this;
  }
  /**
  * Match only rows where `column` is greater than `value`.
  *
  * @param column - The column to filter on
  * @param value - The value to filter with
  */
  gt(r, e) {
    return this.url.searchParams.append(r, `gt.${e}`), this;
  }
  /**
  * Match only rows where `column` is greater than or equal to `value`.
  *
  * @param column - The column to filter on
  * @param value - The value to filter with
  */
  gte(r, e) {
    return this.url.searchParams.append(r, `gte.${e}`), this;
  }
  /**
  * Match only rows where `column` is less than `value`.
  *
  * @param column - The column to filter on
  * @param value - The value to filter with
  */
  lt(r, e) {
    return this.url.searchParams.append(r, `lt.${e}`), this;
  }
  /**
  * Match only rows where `column` is less than or equal to `value`.
  *
  * @param column - The column to filter on
  * @param value - The value to filter with
  */
  lte(r, e) {
    return this.url.searchParams.append(r, `lte.${e}`), this;
  }
  /**
  * Match only rows where `column` matches `pattern` case-sensitively.
  *
  * @param column - The column to filter on
  * @param pattern - The pattern to match with
  */
  like(r, e) {
    return this.url.searchParams.append(r, `like.${e}`), this;
  }
  /**
  * Match only rows where `column` matches all of `patterns` case-sensitively.
  *
  * @param column - The column to filter on
  * @param patterns - The patterns to match with
  */
  likeAllOf(r, e) {
    return this.url.searchParams.append(r, `like(all).{${e.join(",")}}`), this;
  }
  /**
  * Match only rows where `column` matches any of `patterns` case-sensitively.
  *
  * @param column - The column to filter on
  * @param patterns - The patterns to match with
  */
  likeAnyOf(r, e) {
    return this.url.searchParams.append(r, `like(any).{${e.join(",")}}`), this;
  }
  /**
  * Match only rows where `column` matches `pattern` case-insensitively.
  *
  * @param column - The column to filter on
  * @param pattern - The pattern to match with
  */
  ilike(r, e) {
    return this.url.searchParams.append(r, `ilike.${e}`), this;
  }
  /**
  * Match only rows where `column` matches all of `patterns` case-insensitively.
  *
  * @param column - The column to filter on
  * @param patterns - The patterns to match with
  */
  ilikeAllOf(r, e) {
    return this.url.searchParams.append(r, `ilike(all).{${e.join(",")}}`), this;
  }
  /**
  * Match only rows where `column` matches any of `patterns` case-insensitively.
  *
  * @param column - The column to filter on
  * @param patterns - The patterns to match with
  */
  ilikeAnyOf(r, e) {
    return this.url.searchParams.append(r, `ilike(any).{${e.join(",")}}`), this;
  }
  /**
  * Match only rows where `column` matches the PostgreSQL regex `pattern`
  * case-sensitively (using the `~` operator).
  *
  * @param column - The column to filter on
  * @param pattern - The PostgreSQL regular expression pattern to match with
  */
  regexMatch(r, e) {
    return this.url.searchParams.append(r, `match.${e}`), this;
  }
  /**
  * Match only rows where `column` matches the PostgreSQL regex `pattern`
  * case-insensitively (using the `~*` operator).
  *
  * @param column - The column to filter on
  * @param pattern - The PostgreSQL regular expression pattern to match with
  */
  regexIMatch(r, e) {
    return this.url.searchParams.append(r, `imatch.${e}`), this;
  }
  /**
  * Match only rows where `column` IS `value`.
  *
  * For non-boolean columns, this is only relevant for checking if the value of
  * `column` is NULL by setting `value` to `null`.
  *
  * For boolean columns, you can also set `value` to `true` or `false` and it
  * will behave the same way as `.eq()`.
  *
  * @param column - The column to filter on
  * @param value - The value to filter with
  */
  is(r, e) {
    return this.url.searchParams.append(r, `is.${e}`), this;
  }
  /**
  * Match only rows where `column` IS DISTINCT FROM `value`.
  *
  * Unlike `.neq()`, this treats `NULL` as a comparable value. Two `NULL` values
  * are considered equal (not distinct), and comparing `NULL` with any non-NULL
  * value returns true (distinct).
  *
  * @param column - The column to filter on
  * @param value - The value to filter with
  */
  isDistinct(r, e) {
    return this.url.searchParams.append(r, `isdistinct.${e}`), this;
  }
  /**
  * Match only rows where `column` is included in the `values` array.
  *
  * @param column - The column to filter on
  * @param values - The values array to filter with
  */
  in(r, e) {
    const t = Array.from(new Set(e)).map((s) => typeof s == "string" && ot.test(s) ? `"${s}"` : `${s}`).join(",");
    return this.url.searchParams.append(r, `in.(${t})`), this;
  }
  /**
  * Match only rows where `column` is NOT included in the `values` array.
  *
  * @param column - The column to filter on
  * @param values - The values array to filter with
  */
  notIn(r, e) {
    const t = Array.from(new Set(e)).map((s) => typeof s == "string" && ot.test(s) ? `"${s}"` : `${s}`).join(",");
    return this.url.searchParams.append(r, `not.in.(${t})`), this;
  }
  /**
  * Only relevant for jsonb, array, and range columns. Match only rows where
  * `column` contains every element appearing in `value`.
  *
  * @param column - The jsonb, array, or range column to filter on
  * @param value - The jsonb, array, or range value to filter with
  */
  contains(r, e) {
    return typeof e == "string" ? this.url.searchParams.append(r, `cs.${e}`) : Array.isArray(e) ? this.url.searchParams.append(r, `cs.{${e.join(",")}}`) : this.url.searchParams.append(r, `cs.${JSON.stringify(e)}`), this;
  }
  /**
  * Only relevant for jsonb, array, and range columns. Match only rows where
  * every element appearing in `column` is contained by `value`.
  *
  * @param column - The jsonb, array, or range column to filter on
  * @param value - The jsonb, array, or range value to filter with
  */
  containedBy(r, e) {
    return typeof e == "string" ? this.url.searchParams.append(r, `cd.${e}`) : Array.isArray(e) ? this.url.searchParams.append(r, `cd.{${e.join(",")}}`) : this.url.searchParams.append(r, `cd.${JSON.stringify(e)}`), this;
  }
  /**
  * Only relevant for range columns. Match only rows where every element in
  * `column` is greater than any element in `range`.
  *
  * @param column - The range column to filter on
  * @param range - The range to filter with
  */
  rangeGt(r, e) {
    return this.url.searchParams.append(r, `sr.${e}`), this;
  }
  /**
  * Only relevant for range columns. Match only rows where every element in
  * `column` is either contained in `range` or greater than any element in
  * `range`.
  *
  * @param column - The range column to filter on
  * @param range - The range to filter with
  */
  rangeGte(r, e) {
    return this.url.searchParams.append(r, `nxl.${e}`), this;
  }
  /**
  * Only relevant for range columns. Match only rows where every element in
  * `column` is less than any element in `range`.
  *
  * @param column - The range column to filter on
  * @param range - The range to filter with
  */
  rangeLt(r, e) {
    return this.url.searchParams.append(r, `sl.${e}`), this;
  }
  /**
  * Only relevant for range columns. Match only rows where every element in
  * `column` is either contained in `range` or less than any element in
  * `range`.
  *
  * @param column - The range column to filter on
  * @param range - The range to filter with
  */
  rangeLte(r, e) {
    return this.url.searchParams.append(r, `nxr.${e}`), this;
  }
  /**
  * Only relevant for range columns. Match only rows where `column` is
  * mutually exclusive to `range` and there can be no element between the two
  * ranges.
  *
  * @param column - The range column to filter on
  * @param range - The range to filter with
  */
  rangeAdjacent(r, e) {
    return this.url.searchParams.append(r, `adj.${e}`), this;
  }
  /**
  * Only relevant for array and range columns. Match only rows where
  * `column` and `value` have an element in common.
  *
  * @param column - The array or range column to filter on
  * @param value - The array or range value to filter with
  */
  overlaps(r, e) {
    return typeof e == "string" ? this.url.searchParams.append(r, `ov.${e}`) : this.url.searchParams.append(r, `ov.{${e.join(",")}}`), this;
  }
  /**
  * Only relevant for text and tsvector columns. Match only rows where
  * `column` matches the query string in `query`.
  *
  * @param column - The text or tsvector column to filter on
  * @param query - The query text to match with
  * @param options - Named parameters
  * @param options.config - The text search configuration to use
  * @param options.type - Change how the `query` text is interpreted
  */
  textSearch(r, e, { config: t, type: s } = {}) {
    let n = "";
    s === "plain" ? n = "pl" : s === "phrase" ? n = "ph" : s === "websearch" && (n = "w");
    const i = t === void 0 ? "" : `(${t})`;
    return this.url.searchParams.append(r, `${n}fts${i}.${e}`), this;
  }
  /**
  * Match only rows where each column in `query` keys is equal to its
  * associated value. Shorthand for multiple `.eq()`s.
  *
  * @param query - The object to filter with, with column names as keys mapped
  * to their filter values
  */
  match(r) {
    return Object.entries(r).forEach(([e, t]) => {
      this.url.searchParams.append(e, `eq.${t}`);
    }), this;
  }
  /**
  * Match only rows which doesn't satisfy the filter.
  *
  * Unlike most filters, `opearator` and `value` are used as-is and need to
  * follow [PostgREST
  * syntax](https://postgrest.org/en/stable/api.html#operators). You also need
  * to make sure they are properly sanitized.
  *
  * @param column - The column to filter on
  * @param operator - The operator to be negated to filter with, following
  * PostgREST syntax
  * @param value - The value to filter with, following PostgREST syntax
  */
  not(r, e, t) {
    return this.url.searchParams.append(r, `not.${e}.${t}`), this;
  }
  /**
  * Match only rows which satisfy at least one of the filters.
  *
  * Unlike most filters, `filters` is used as-is and needs to follow [PostgREST
  * syntax](https://postgrest.org/en/stable/api.html#operators). You also need
  * to make sure it's properly sanitized.
  *
  * It's currently not possible to do an `.or()` filter across multiple tables.
  *
  * @param filters - The filters to use, following PostgREST syntax
  * @param options - Named parameters
  * @param options.referencedTable - Set this to filter on referenced tables
  * instead of the parent table
  * @param options.foreignTable - Deprecated, use `referencedTable` instead
  */
  or(r, { foreignTable: e, referencedTable: t = e } = {}) {
    const s = t ? `${t}.or` : "or";
    return this.url.searchParams.append(s, `(${r})`), this;
  }
  /**
  * Match only rows which satisfy the filter. This is an escape hatch - you
  * should use the specific filter methods wherever possible.
  *
  * Unlike most filters, `opearator` and `value` are used as-is and need to
  * follow [PostgREST
  * syntax](https://postgrest.org/en/stable/api.html#operators). You also need
  * to make sure they are properly sanitized.
  *
  * @param column - The column to filter on
  * @param operator - The operator to filter with, following PostgREST syntax
  * @param value - The value to filter with, following PostgREST syntax
  */
  filter(r, e, t) {
    return this.url.searchParams.append(r, `${e}.${t}`), this;
  }
}, ir = class {
  /**
  * Creates a query builder scoped to a Postgres table or view.
  *
  * @example
  * ```ts
  * import PostgrestQueryBuilder from '@supabase/postgrest-js'
  *
  * const query = new PostgrestQueryBuilder(
  *   new URL('https://xyzcompany.supabase.co/rest/v1/users'),
  *   { headers: { apikey: 'public-anon-key' } }
  * )
  * ```
  */
  constructor(r, { headers: e = {}, schema: t, fetch: s, urlLengthLimit: n = 8e3 }) {
    this.url = r, this.headers = new Headers(e), this.schema = t, this.fetch = s, this.urlLengthLimit = n;
  }
  /**
  * Clone URL and headers to prevent shared state between operations.
  */
  cloneRequestState() {
    return {
      url: new URL(this.url.toString()),
      headers: new Headers(this.headers)
    };
  }
  /**
  * Perform a SELECT query on the table or view.
  *
  * @param columns - The columns to retrieve, separated by commas. Columns can be renamed when returned with `customName:columnName`
  *
  * @param options - Named parameters
  *
  * @param options.head - When set to `true`, `data` will not be returned.
  * Useful if you only need the count.
  *
  * @param options.count - Count algorithm to use to count rows in the table or view.
  *
  * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
  * hood.
  *
  * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
  * statistics under the hood.
  *
  * `"estimated"`: Uses exact count for low numbers and planned count for high
  * numbers.
  *
  * @remarks
  * When using `count` with `.range()` or `.limit()`, the returned `count` is the total number of rows
  * that match your filters, not the number of rows in the current page. Use this to build pagination UI.
  
  * - By default, Supabase projects return a maximum of 1,000 rows. This setting can be changed in your project's [API settings](/dashboard/project/_/settings/api). It's recommended that you keep it low to limit the payload size of accidental or malicious requests. You can use `range()` queries to paginate through your data.
  * - `select()` can be combined with [Filters](/docs/reference/javascript/using-filters)
  * - `select()` can be combined with [Modifiers](/docs/reference/javascript/using-modifiers)
  * - `apikey` is a reserved keyword if you're using the [Supabase Platform](/docs/guides/platform) and [should be avoided as a column name](https://github.com/supabase/supabase/issues/5465). *
  * @category Database
  *
  * @example Getting your data
  * ```js
  * const { data, error } = await supabase
  *   .from('characters')
  *   .select()
  * ```
  *
  * @exampleSql Getting your data
  * ```sql
  * create table
  *   characters (id int8 primary key, name text);
  *
  * insert into
  *   characters (id, name)
  * values
  *   (1, 'Harry'),
  *   (2, 'Frodo'),
  *   (3, 'Katniss');
  * ```
  *
  * @exampleResponse Getting your data
  * ```json
  * {
  *   "data": [
  *     {
  *       "id": 1,
  *       "name": "Harry"
  *     },
  *     {
  *       "id": 2,
  *       "name": "Frodo"
  *     },
  *     {
  *       "id": 3,
  *       "name": "Katniss"
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @example Selecting specific columns
  * ```js
  * const { data, error } = await supabase
  *   .from('characters')
  *   .select('name')
  * ```
  *
  * @exampleSql Selecting specific columns
  * ```sql
  * create table
  *   characters (id int8 primary key, name text);
  *
  * insert into
  *   characters (id, name)
  * values
  *   (1, 'Frodo'),
  *   (2, 'Harry'),
  *   (3, 'Katniss');
  * ```
  *
  * @exampleResponse Selecting specific columns
  * ```json
  * {
  *   "data": [
  *     {
  *       "name": "Frodo"
  *     },
  *     {
  *       "name": "Harry"
  *     },
  *     {
  *       "name": "Katniss"
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @exampleDescription Query referenced tables
  * If your database has foreign key relationships, you can query related tables too.
  *
  * @example Query referenced tables
  * ```js
  * const { data, error } = await supabase
  *   .from('orchestral_sections')
  *   .select(`
  *     name,
  *     instruments (
  *       name
  *     )
  *   `)
  * ```
  *
  * @exampleSql Query referenced tables
  * ```sql
  * create table
  *   orchestral_sections (id int8 primary key, name text);
  * create table
  *   instruments (
  *     id int8 primary key,
  *     section_id int8 not null references orchestral_sections,
  *     name text
  *   );
  *
  * insert into
  *   orchestral_sections (id, name)
  * values
  *   (1, 'strings'),
  *   (2, 'woodwinds');
  * insert into
  *   instruments (id, section_id, name)
  * values
  *   (1, 2, 'flute'),
  *   (2, 1, 'violin');
  * ```
  *
  * @exampleResponse Query referenced tables
  * ```json
  * {
  *   "data": [
  *     {
  *       "name": "strings",
  *       "instruments": [
  *         {
  *           "name": "violin"
  *         }
  *       ]
  *     },
  *     {
  *       "name": "woodwinds",
  *       "instruments": [
  *         {
  *           "name": "flute"
  *         }
  *       ]
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @exampleDescription Query referenced tables with spaces in their names
  * If your table name contains spaces, you must use double quotes in the `select` statement to reference the table.
  *
  * @example Query referenced tables with spaces in their names
  * ```js
  * const { data, error } = await supabase
  *   .from('orchestral sections')
  *   .select(`
  *     name,
  *     "musical instruments" (
  *       name
  *     )
  *   `)
  * ```
  *
  * @exampleSql Query referenced tables with spaces in their names
  * ```sql
  * create table
  *   "orchestral sections" (id int8 primary key, name text);
  * create table
  *   "musical instruments" (
  *     id int8 primary key,
  *     section_id int8 not null references "orchestral sections",
  *     name text
  *   );
  *
  * insert into
  *   "orchestral sections" (id, name)
  * values
  *   (1, 'strings'),
  *   (2, 'woodwinds');
  * insert into
  *   "musical instruments" (id, section_id, name)
  * values
  *   (1, 2, 'flute'),
  *   (2, 1, 'violin');
  * ```
  *
  * @exampleResponse Query referenced tables with spaces in their names
  * ```json
  * {
  *   "data": [
  *     {
  *       "name": "strings",
  *       "musical instruments": [
  *         {
  *           "name": "violin"
  *         }
  *       ]
  *     },
  *     {
  *       "name": "woodwinds",
  *       "musical instruments": [
  *         {
  *           "name": "flute"
  *         }
  *       ]
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @exampleDescription Query referenced tables through a join table
  * If you're in a situation where your tables are **NOT** directly
  * related, but instead are joined by a _join table_, you can still use
  * the `select()` method to query the related data. The join table needs
  * to have the foreign keys as part of its composite primary key.
  *
  * @example Query referenced tables through a join table
  * ```ts
  * const { data, error } = await supabase
  *   .from('users')
  *   .select(`
  *     name,
  *     teams (
  *       name
  *     )
  *   `)
  *   
  * ```
  *
  * @exampleSql Query referenced tables through a join table
  * ```sql
  * create table
  *   users (
  *     id int8 primary key,
  *     name text
  *   );
  * create table
  *   teams (
  *     id int8 primary key,
  *     name text
  *   );
  * -- join table
  * create table
  *   users_teams (
  *     user_id int8 not null references users,
  *     team_id int8 not null references teams,
  *     -- both foreign keys must be part of a composite primary key
  *     primary key (user_id, team_id)
  *   );
  *
  * insert into
  *   users (id, name)
  * values
  *   (1, 'Kiran'),
  *   (2, 'Evan');
  * insert into
  *   teams (id, name)
  * values
  *   (1, 'Green'),
  *   (2, 'Blue');
  * insert into
  *   users_teams (user_id, team_id)
  * values
  *   (1, 1),
  *   (1, 2),
  *   (2, 2);
  * ```
  *
  * @exampleResponse Query referenced tables through a join table
  * ```json
  *   {
  *     "data": [
  *       {
  *         "name": "Kiran",
  *         "teams": [
  *           {
  *             "name": "Green"
  *           },
  *           {
  *             "name": "Blue"
  *           }
  *         ]
  *       },
  *       {
  *         "name": "Evan",
  *         "teams": [
  *           {
  *             "name": "Blue"
  *           }
  *         ]
  *       }
  *     ],
  *     "status": 200,
  *     "statusText": "OK"
  *   }
  *   
  * ```
  *
  * @exampleDescription Query the same referenced table multiple times
  * If you need to query the same referenced table twice, use the name of the
  * joined column to identify which join to use. You can also give each
  * column an alias.
  *
  * @example Query the same referenced table multiple times
  * ```ts
  * const { data, error } = await supabase
  *   .from('messages')
  *   .select(`
  *     content,
  *     from:sender_id(name),
  *     to:receiver_id(name)
  *   `)
  *
  * // To infer types, use the name of the table (in this case `users`) and
  * // the name of the foreign key constraint.
  * const { data, error } = await supabase
  *   .from('messages')
  *   .select(`
  *     content,
  *     from:users!messages_sender_id_fkey(name),
  *     to:users!messages_receiver_id_fkey(name)
  *   `)
  * ```
  *
  * @exampleSql Query the same referenced table multiple times
  * ```sql
  *  create table
  *  users (id int8 primary key, name text);
  *
  *  create table
  *    messages (
  *      sender_id int8 not null references users,
  *      receiver_id int8 not null references users,
  *      content text
  *    );
  *
  *  insert into
  *    users (id, name)
  *  values
  *    (1, 'Kiran'),
  *    (2, 'Evan');
  *
  *  insert into
  *    messages (sender_id, receiver_id, content)
  *  values
  *    (1, 2, '👋');
  *  ```
  * ```
  *
  * @exampleResponse Query the same referenced table multiple times
  * ```json
  * {
  *   "data": [
  *     {
  *       "content": "👋",
  *       "from": {
  *         "name": "Kiran"
  *       },
  *       "to": {
  *         "name": "Evan"
  *       }
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @exampleDescription Query nested foreign tables through a join table
  * You can use the result of a joined table to gather data in
  * another foreign table. With multiple references to the same foreign
  * table you must specify the column on which to conduct the join.
  *
  * @example Query nested foreign tables through a join table
  * ```ts
  *   const { data, error } = await supabase
  *     .from('games')
  *     .select(`
  *       game_id:id,
  *       away_team:teams!games_away_team_fkey (
  *         users (
  *           id,
  *           name
  *         )
  *       )
  *     `)
  *   
  * ```
  *
  * @exampleSql Query nested foreign tables through a join table
  * ```sql
  * ```sql
  * create table
  *   users (
  *     id int8 primary key,
  *     name text
  *   );
  * create table
  *   teams (
  *     id int8 primary key,
  *     name text
  *   );
  * -- join table
  * create table
  *   users_teams (
  *     user_id int8 not null references users,
  *     team_id int8 not null references teams,
  *
  *     primary key (user_id, team_id)
  *   );
  * create table
  *   games (
  *     id int8 primary key,
  *     home_team int8 not null references teams,
  *     away_team int8 not null references teams,
  *     name text
  *   );
  *
  * insert into users (id, name)
  * values
  *   (1, 'Kiran'),
  *   (2, 'Evan');
  * insert into
  *   teams (id, name)
  * values
  *   (1, 'Green'),
  *   (2, 'Blue');
  * insert into
  *   users_teams (user_id, team_id)
  * values
  *   (1, 1),
  *   (1, 2),
  *   (2, 2);
  * insert into
  *   games (id, home_team, away_team, name)
  * values
  *   (1, 1, 2, 'Green vs Blue'),
  *   (2, 2, 1, 'Blue vs Green');
  * ```
  *
  * @exampleResponse Query nested foreign tables through a join table
  * ```json
  *   {
  *     "data": [
  *       {
  *         "game_id": 1,
  *         "away_team": {
  *           "users": [
  *             {
  *               "id": 1,
  *               "name": "Kiran"
  *             },
  *             {
  *               "id": 2,
  *               "name": "Evan"
  *             }
  *           ]
  *         }
  *       },
  *       {
  *         "game_id": 2,
  *         "away_team": {
  *           "users": [
  *             {
  *               "id": 1,
  *               "name": "Kiran"
  *             }
  *           ]
  *         }
  *       }
  *     ],
  *     "status": 200,
  *     "statusText": "OK"
  *   }
  *   
  * ```
  *
  * @exampleDescription Filtering through referenced tables
  * If the filter on a referenced table's column is not satisfied, the referenced
  * table returns `[]` or `null` but the parent table is not filtered out.
  * If you want to filter out the parent table rows, use the `!inner` hint
  *
  * @example Filtering through referenced tables
  * ```ts
  * const { data, error } = await supabase
  *   .from('instruments')
  *   .select('name, orchestral_sections(*)')
  *   .eq('orchestral_sections.name', 'percussion')
  * ```
  *
  * @exampleSql Filtering through referenced tables
  * ```sql
  * create table
  *   orchestral_sections (id int8 primary key, name text);
  * create table
  *   instruments (
  *     id int8 primary key,
  *     section_id int8 not null references orchestral_sections,
  *     name text
  *   );
  *
  * insert into
  *   orchestral_sections (id, name)
  * values
  *   (1, 'strings'),
  *   (2, 'woodwinds');
  * insert into
  *   instruments (id, section_id, name)
  * values
  *   (1, 2, 'flute'),
  *   (2, 1, 'violin');
  * ```
  *
  * @exampleResponse Filtering through referenced tables
  * ```json
  * {
  *   "data": [
  *     {
  *       "name": "flute",
  *       "orchestral_sections": null
  *     },
  *     {
  *       "name": "violin",
  *       "orchestral_sections": null
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @exampleDescription Querying referenced table with count
  * You can get the number of rows in a related table by using the
  * **count** property.
  *
  * @example Querying referenced table with count
  * ```ts
  * const { data, error } = await supabase
  *   .from('orchestral_sections')
  *   .select(`*, instruments(count)`)
  * ```
  *
  * @exampleSql Querying referenced table with count
  * ```sql
  * create table orchestral_sections (
  *   "id" "uuid" primary key default "extensions"."uuid_generate_v4"() not null,
  *   "name" text
  * );
  *
  * create table characters (
  *   "id" "uuid" primary key default "extensions"."uuid_generate_v4"() not null,
  *   "name" text,
  *   "section_id" "uuid" references public.orchestral_sections on delete cascade
  * );
  *
  * with section as (
  *   insert into orchestral_sections (name)
  *   values ('strings') returning id
  * )
  * insert into instruments (name, section_id) values
  * ('violin', (select id from section)),
  * ('viola', (select id from section)),
  * ('cello', (select id from section)),
  * ('double bass', (select id from section));
  * ```
  *
  * @exampleResponse Querying referenced table with count
  * ```json
  * [
  *   {
  *     "id": "693694e7-d993-4360-a6d7-6294e325d9b6",
  *     "name": "strings",
  *     "instruments": [
  *       {
  *         "count": 4
  *       }
  *     ]
  *   }
  * ]
  * ```
  *
  * @exampleDescription Querying with count option
  * You can get the number of rows by using the
  * [count](/docs/reference/javascript/select#parameters) option.
  *
  * @example Querying with count option
  * ```ts
  * const { count, error } = await supabase
  *   .from('characters')
  *   .select('*', { count: 'exact', head: true })
  * ```
  *
  * @exampleSql Querying with count option
  * ```sql
  * create table
  *   characters (id int8 primary key, name text);
  *
  * insert into
  *   characters (id, name)
  * values
  *   (1, 'Luke'),
  *   (2, 'Leia'),
  *   (3, 'Han');
  * ```
  *
  * @exampleResponse Querying with count option
  * ```json
  * {
  *   "count": 3,
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @exampleDescription Querying JSON data
  * You can select and filter data inside of
  * [JSON](/docs/guides/database/json) columns. Postgres offers some
  * [operators](/docs/guides/database/json#query-the-jsonb-data) for
  * querying JSON data.
  *
  * @example Querying JSON data
  * ```ts
  * const { data, error } = await supabase
  *   .from('users')
  *   .select(`
  *     id, name,
  *     address->city
  *   `)
  * ```
  *
  * @exampleSql Querying JSON data
  * ```sql
  * create table
  *   users (
  *     id int8 primary key,
  *     name text,
  *     address jsonb
  *   );
  *
  * insert into
  *   users (id, name, address)
  * values
  *   (1, 'Frodo', '{"city":"Hobbiton"}');
  * ```
  *
  * @exampleResponse Querying JSON data
  * ```json
  * {
  *   "data": [
  *     {
  *       "id": 1,
  *       "name": "Frodo",
  *       "city": "Hobbiton"
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @exampleDescription Querying referenced table with inner join
  * If you don't want to return the referenced table contents, you can leave the parenthesis empty.
  * Like `.select('name, orchestral_sections!inner()')`.
  *
  * @example Querying referenced table with inner join
  * ```ts
  * const { data, error } = await supabase
  *   .from('instruments')
  *   .select('name, orchestral_sections!inner(name)')
  *   .eq('orchestral_sections.name', 'woodwinds')
  *   .limit(1)
  * ```
  *
  * @exampleSql Querying referenced table with inner join
  * ```sql
  * create table orchestral_sections (
  *   "id" "uuid" primary key default "extensions"."uuid_generate_v4"() not null,
  *   "name" text
  * );
  *
  * create table instruments (
  *   "id" "uuid" primary key default "extensions"."uuid_generate_v4"() not null,
  *   "name" text,
  *   "section_id" "uuid" references public.orchestral_sections on delete cascade
  * );
  *
  * with section as (
  *   insert into orchestral_sections (name)
  *   values ('woodwinds') returning id
  * )
  * insert into instruments (name, section_id) values
  * ('flute', (select id from section)),
  * ('clarinet', (select id from section)),
  * ('bassoon', (select id from section)),
  * ('piccolo', (select id from section));
  * ```
  *
  * @exampleResponse Querying referenced table with inner join
  * ```json
  * {
  *   "data": [
  *     {
  *       "name": "flute",
  *       "orchestral_sections": {"name": "woodwinds"}
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @exampleDescription Switching schemas per query
  * In addition to setting the schema during initialization, you can also switch schemas on a per-query basis.
  * Make sure you've set up your [database privileges and API settings](/docs/guides/api/using-custom-schemas).
  *
  * @example Switching schemas per query
  * ```ts
  * const { data, error } = await supabase
  *   .schema('myschema')
  *   .from('mytable')
  *   .select()
  * ```
  *
  * @exampleSql Switching schemas per query
  * ```sql
  * create schema myschema;
  *
  * create table myschema.mytable (
  *   id uuid primary key default gen_random_uuid(),
  *   data text
  * );
  *
  * insert into myschema.mytable (data) values ('mydata');
  * ```
  *
  * @exampleResponse Switching schemas per query
  * ```json
  * {
  *   "data": [
  *     {
  *       "id": "4162e008-27b0-4c0f-82dc-ccaeee9a624d",
  *       "data": "mydata"
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  */
  select(r, e) {
    const { head: t = !1, count: s } = e ?? {}, n = t ? "HEAD" : "GET";
    let i = !1;
    const a = (r ?? "*").split("").map((c) => /\s/.test(c) && !i ? "" : (c === '"' && (i = !i), c)).join(""), { url: o, headers: l } = this.cloneRequestState();
    return o.searchParams.set("select", a), s && l.append("Prefer", `count=${s}`), new ae({
      method: n,
      url: o,
      headers: l,
      schema: this.schema,
      fetch: this.fetch,
      urlLengthLimit: this.urlLengthLimit
    });
  }
  /**
  * Perform an INSERT into the table or view.
  *
  * By default, inserted rows are not returned. To return it, chain the call
  * with `.select()`.
  *
  * @param values - The values to insert. Pass an object to insert a single row
  * or an array to insert multiple rows.
  *
  * @param options - Named parameters
  *
  * @param options.count - Count algorithm to use to count inserted rows.
  *
  * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
  * hood.
  *
  * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
  * statistics under the hood.
  *
  * `"estimated"`: Uses exact count for low numbers and planned count for high
  * numbers.
  *
  * @param options.defaultToNull - Make missing fields default to `null`.
  * Otherwise, use the default value for the column. Only applies for bulk
  * inserts.
  *
  * @category Database
  *
  * @example Create a record
  * ```ts
  * const { error } = await supabase
  *   .from('countries')
  *   .insert({ id: 1, name: 'Mordor' })
  * ```
  *
  * @exampleSql Create a record
  * ```sql
  * create table
  *   countries (id int8 primary key, name text);
  * ```
  *
  * @exampleResponse Create a record
  * ```json
  * {
  *   "status": 201,
  *   "statusText": "Created"
  * }
  * ```
  *
  * @example Create a record and return it
  * ```ts
  * const { data, error } = await supabase
  *   .from('countries')
  *   .insert({ id: 1, name: 'Mordor' })
  *   .select()
  * ```
  *
  * @exampleSql Create a record and return it
  * ```sql
  * create table
  *   countries (id int8 primary key, name text);
  * ```
  *
  * @exampleResponse Create a record and return it
  * ```json
  * {
  *   "data": [
  *     {
  *       "id": 1,
  *       "name": "Mordor"
  *     }
  *   ],
  *   "status": 201,
  *   "statusText": "Created"
  * }
  * ```
  *
  * @exampleDescription Bulk create
  * A bulk create operation is handled in a single transaction.
  * If any of the inserts fail, none of the rows are inserted.
  *
  * @example Bulk create
  * ```ts
  * const { error } = await supabase
  *   .from('countries')
  *   .insert([
  *     { id: 1, name: 'Mordor' },
  *     { id: 1, name: 'The Shire' },
  *   ])
  * ```
  *
  * @exampleSql Bulk create
  * ```sql
  * create table
  *   countries (id int8 primary key, name text);
  * ```
  *
  * @exampleResponse Bulk create
  * ```json
  * {
  *   "error": {
  *     "code": "23505",
  *     "details": "Key (id)=(1) already exists.",
  *     "hint": null,
  *     "message": "duplicate key value violates unique constraint \"countries_pkey\""
  *   },
  *   "status": 409,
  *   "statusText": "Conflict"
  * }
  * ```
  */
  insert(r, { count: e, defaultToNull: t = !0 } = {}) {
    var s;
    const n = "POST", { url: i, headers: a } = this.cloneRequestState();
    if (e && a.append("Prefer", `count=${e}`), t || a.append("Prefer", "missing=default"), Array.isArray(r)) {
      const o = r.reduce((l, c) => l.concat(Object.keys(c)), []);
      if (o.length > 0) {
        const l = [...new Set(o)].map((c) => `"${c}"`);
        i.searchParams.set("columns", l.join(","));
      }
    }
    return new ae({
      method: n,
      url: i,
      headers: a,
      schema: this.schema,
      body: r,
      fetch: (s = this.fetch) !== null && s !== void 0 ? s : fetch,
      urlLengthLimit: this.urlLengthLimit
    });
  }
  /**
  * Perform an UPSERT on the table or view. Depending on the column(s) passed
  * to `onConflict`, `.upsert()` allows you to perform the equivalent of
  * `.insert()` if a row with the corresponding `onConflict` columns doesn't
  * exist, or if it does exist, perform an alternative action depending on
  * `ignoreDuplicates`.
  *
  * By default, upserted rows are not returned. To return it, chain the call
  * with `.select()`.
  *
  * @param values - The values to upsert with. Pass an object to upsert a
  * single row or an array to upsert multiple rows.
  *
  * @param options - Named parameters
  *
  * @param options.onConflict - Comma-separated UNIQUE column(s) to specify how
  * duplicate rows are determined. Two rows are duplicates if all the
  * `onConflict` columns are equal.
  *
  * @param options.ignoreDuplicates - If `true`, duplicate rows are ignored. If
  * `false`, duplicate rows are merged with existing rows.
  *
  * @param options.count - Count algorithm to use to count upserted rows.
  *
  * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
  * hood.
  *
  * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
  * statistics under the hood.
  *
  * `"estimated"`: Uses exact count for low numbers and planned count for high
  * numbers.
  *
  * @param options.defaultToNull - Make missing fields default to `null`.
  * Otherwise, use the default value for the column. This only applies when
  * inserting new rows, not when merging with existing rows under
  * `ignoreDuplicates: false`. This also only applies when doing bulk upserts.
  *
  * @example Upsert a single row using a unique key
  * ```ts
  * // Upserting a single row, overwriting based on the 'username' unique column
  * const { data, error } = await supabase
  *   .from('users')
  *   .upsert({ username: 'supabot' }, { onConflict: 'username' })
  *
  * // Example response:
  * // {
  * //   data: [
  * //     { id: 4, message: 'bar', username: 'supabot' }
  * //   ],
  * //   error: null
  * // }
  * ```
  *
  * @example Upsert with conflict resolution and exact row counting
  * ```ts
  * // Upserting and returning exact count
  * const { data, error, count } = await supabase
  *   .from('users')
  *   .upsert(
  *     {
  *       id: 3,
  *       message: 'foo',
  *       username: 'supabot'
  *     },
  *     {
  *       onConflict: 'username',
  *       count: 'exact'
  *     }
  *   )
  *
  * // Example response:
  * // {
  * //   data: [
  * //     {
  * //       id: 42,
  * //       handle: "saoirse",
  * //       display_name: "Saoirse"
  * //     }
  * //   ],
  * //   count: 1,
  * //   error: null
  * // }
  * ```
  *
  * @category Database
  *
  * @remarks
  * - Primary keys must be included in `values` to use upsert.
  *
  * @example Upsert your data
  * ```ts
  * const { data, error } = await supabase
  *   .from('instruments')
  *   .upsert({ id: 1, name: 'piano' })
  *   .select()
  * ```
  *
  * @exampleSql Upsert your data
  * ```sql
  * create table
  *   instruments (id int8 primary key, name text);
  *
  * insert into
  *   instruments (id, name)
  * values
  *   (1, 'harpsichord');
  * ```
  *
  * @exampleResponse Upsert your data
  * ```json
  * {
  *   "data": [
  *     {
  *       "id": 1,
  *       "name": "piano"
  *     }
  *   ],
  *   "status": 201,
  *   "statusText": "Created"
  * }
  * ```
  *
  * @example Bulk Upsert your data
  * ```ts
  * const { data, error } = await supabase
  *   .from('instruments')
  *   .upsert([
  *     { id: 1, name: 'piano' },
  *     { id: 2, name: 'harp' },
  *   ])
  *   .select()
  * ```
  *
  * @exampleSql Bulk Upsert your data
  * ```sql
  * create table
  *   instruments (id int8 primary key, name text);
  *
  * insert into
  *   instruments (id, name)
  * values
  *   (1, 'harpsichord');
  * ```
  *
  * @exampleResponse Bulk Upsert your data
  * ```json
  * {
  *   "data": [
  *     {
  *       "id": 1,
  *       "name": "piano"
  *     },
  *     {
  *       "id": 2,
  *       "name": "harp"
  *     }
  *   ],
  *   "status": 201,
  *   "statusText": "Created"
  * }
  * ```
  *
  * @exampleDescription Upserting into tables with constraints
  * In the following query, `upsert()` implicitly uses the `id`
  * (primary key) column to determine conflicts. If there is no existing
  * row with the same `id`, `upsert()` inserts a new row, which
  * will fail in this case as there is already a row with `handle` `"saoirse"`.
  * Using the `onConflict` option, you can instruct `upsert()` to use
  * another column with a unique constraint to determine conflicts.
  *
  * @example Upserting into tables with constraints
  * ```ts
  * const { data, error } = await supabase
  *   .from('users')
  *   .upsert({ id: 42, handle: 'saoirse', display_name: 'Saoirse' })
  *   .select()
  * ```
  *
  * @exampleSql Upserting into tables with constraints
  * ```sql
  * create table
  *   users (
  *     id int8 generated by default as identity primary key,
  *     handle text not null unique,
  *     display_name text
  *   );
  *
  * insert into
  *   users (id, handle, display_name)
  * values
  *   (1, 'saoirse', null);
  * ```
  *
  * @exampleResponse Upserting into tables with constraints
  * ```json
  * {
  *   "error": {
  *     "code": "23505",
  *     "details": "Key (handle)=(saoirse) already exists.",
  *     "hint": null,
  *     "message": "duplicate key value violates unique constraint \"users_handle_key\""
  *   },
  *   "status": 409,
  *   "statusText": "Conflict"
  * }
  * ```
  */
  upsert(r, { onConflict: e, ignoreDuplicates: t = !1, count: s, defaultToNull: n = !0 } = {}) {
    var i;
    const a = "POST", { url: o, headers: l } = this.cloneRequestState();
    if (l.append("Prefer", `resolution=${t ? "ignore" : "merge"}-duplicates`), e !== void 0 && o.searchParams.set("on_conflict", e), s && l.append("Prefer", `count=${s}`), n || l.append("Prefer", "missing=default"), Array.isArray(r)) {
      const c = r.reduce((u, f) => u.concat(Object.keys(f)), []);
      if (c.length > 0) {
        const u = [...new Set(c)].map((f) => `"${f}"`);
        o.searchParams.set("columns", u.join(","));
      }
    }
    return new ae({
      method: a,
      url: o,
      headers: l,
      schema: this.schema,
      body: r,
      fetch: (i = this.fetch) !== null && i !== void 0 ? i : fetch,
      urlLengthLimit: this.urlLengthLimit
    });
  }
  /**
  * Perform an UPDATE on the table or view.
  *
  * By default, updated rows are not returned. To return it, chain the call
  * with `.select()` after filters.
  *
  * @param values - The values to update with
  *
  * @param options - Named parameters
  *
  * @param options.count - Count algorithm to use to count updated rows.
  *
  * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
  * hood.
  *
  * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
  * statistics under the hood.
  *
  * `"estimated"`: Uses exact count for low numbers and planned count for high
  * numbers.
  *
  * @category Database
  *
  * @remarks
  * - `update()` should always be combined with [Filters](/docs/reference/javascript/using-filters) to target the item(s) you wish to update.
  *
  * @example Updating your data
  * ```ts
  * const { error } = await supabase
  *   .from('instruments')
  *   .update({ name: 'piano' })
  *   .eq('id', 1)
  * ```
  *
  * @exampleSql Updating your data
  * ```sql
  * create table
  *   instruments (id int8 primary key, name text);
  *
  * insert into
  *   instruments (id, name)
  * values
  *   (1, 'harpsichord');
  * ```
  *
  * @exampleResponse Updating your data
  * ```json
  * {
  *   "status": 204,
  *   "statusText": "No Content"
  * }
  * ```
  *
  * @example Update a record and return it
  * ```ts
  * const { data, error } = await supabase
  *   .from('instruments')
  *   .update({ name: 'piano' })
  *   .eq('id', 1)
  *   .select()
  * ```
  *
  * @exampleSql Update a record and return it
  * ```sql
  * create table
  *   instruments (id int8 primary key, name text);
  *
  * insert into
  *   instruments (id, name)
  * values
  *   (1, 'harpsichord');
  * ```
  *
  * @exampleResponse Update a record and return it
  * ```json
  * {
  *   "data": [
  *     {
  *       "id": 1,
  *       "name": "piano"
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  *
  * @exampleDescription Updating JSON data
  * Postgres offers some
  * [operators](/docs/guides/database/json#query-the-jsonb-data) for
  * working with JSON data. Currently, it is only possible to update the entire JSON document.
  *
  * @example Updating JSON data
  * ```ts
  * const { data, error } = await supabase
  *   .from('users')
  *   .update({
  *     address: {
  *       street: 'Melrose Place',
  *       postcode: 90210
  *     }
  *   })
  *   .eq('address->postcode', 90210)
  *   .select()
  * ```
  *
  * @exampleSql Updating JSON data
  * ```sql
  * create table
  *   users (
  *     id int8 primary key,
  *     name text,
  *     address jsonb
  *   );
  *
  * insert into
  *   users (id, name, address)
  * values
  *   (1, 'Michael', '{ "postcode": 90210 }');
  * ```
  *
  * @exampleResponse Updating JSON data
  * ```json
  * {
  *   "data": [
  *     {
  *       "id": 1,
  *       "name": "Michael",
  *       "address": {
  *         "street": "Melrose Place",
  *         "postcode": 90210
  *       }
  *     }
  *   ],
  *   "status": 200,
  *   "statusText": "OK"
  * }
  * ```
  */
  update(r, { count: e } = {}) {
    var t;
    const s = "PATCH", { url: n, headers: i } = this.cloneRequestState();
    return e && i.append("Prefer", `count=${e}`), new ae({
      method: s,
      url: n,
      headers: i,
      schema: this.schema,
      body: r,
      fetch: (t = this.fetch) !== null && t !== void 0 ? t : fetch,
      urlLengthLimit: this.urlLengthLimit
    });
  }
  /**
  * Perform a DELETE on the table or view.
  *
  * By default, deleted rows are not returned. To return it, chain the call
  * with `.select()` after filters.
  *
  * @param options - Named parameters
  *
  * @param options.count - Count algorithm to use to count deleted rows.
  *
  * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
  * hood.
  *
  * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
  * statistics under the hood.
  *
  * `"estimated"`: Uses exact count for low numbers and planned count for high
  * numbers.
  */
  delete({ count: r } = {}) {
    var e;
    const t = "DELETE", { url: s, headers: n } = this.cloneRequestState();
    return r && n.append("Prefer", `count=${r}`), new ae({
      method: t,
      url: s,
      headers: n,
      schema: this.schema,
      fetch: (e = this.fetch) !== null && e !== void 0 ? e : fetch,
      urlLengthLimit: this.urlLengthLimit
    });
  }
};
function me(r) {
  "@babel/helpers - typeof";
  return me = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
    return typeof e;
  } : function(e) {
    return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
  }, me(r);
}
function ar(r, e) {
  if (me(r) != "object" || !r) return r;
  var t = r[Symbol.toPrimitive];
  if (t !== void 0) {
    var s = t.call(r, e || "default");
    if (me(s) != "object") return s;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return (e === "string" ? String : Number)(r);
}
function or(r) {
  var e = ar(r, "string");
  return me(e) == "symbol" ? e : e + "";
}
function lr(r, e, t) {
  return (e = or(e)) in r ? Object.defineProperty(r, e, {
    value: t,
    enumerable: !0,
    configurable: !0,
    writable: !0
  }) : r[e] = t, r;
}
function lt(r, e) {
  var t = Object.keys(r);
  if (Object.getOwnPropertySymbols) {
    var s = Object.getOwnPropertySymbols(r);
    e && (s = s.filter(function(n) {
      return Object.getOwnPropertyDescriptor(r, n).enumerable;
    })), t.push.apply(t, s);
  }
  return t;
}
function Re(r) {
  for (var e = 1; e < arguments.length; e++) {
    var t = arguments[e] != null ? arguments[e] : {};
    e % 2 ? lt(Object(t), !0).forEach(function(s) {
      lr(r, s, t[s]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(r, Object.getOwnPropertyDescriptors(t)) : lt(Object(t)).forEach(function(s) {
      Object.defineProperty(r, s, Object.getOwnPropertyDescriptor(t, s));
    });
  }
  return r;
}
var cr = class Ct {
  /**
  * Creates a PostgREST client.
  *
  * @param url - URL of the PostgREST endpoint
  * @param options - Named parameters
  * @param options.headers - Custom headers
  * @param options.schema - Postgres schema to switch to
  * @param options.fetch - Custom fetch
  * @param options.timeout - Optional timeout in milliseconds for all requests. When set, requests will automatically abort after this duration to prevent indefinite hangs.
  * @param options.urlLengthLimit - Maximum URL length in characters before warnings/errors are triggered. Defaults to 8000.
  * @example
  * ```ts
  * import PostgrestClient from '@supabase/postgrest-js'
  *
  * const postgrest = new PostgrestClient('https://xyzcompany.supabase.co/rest/v1', {
  *   headers: { apikey: 'public-anon-key' },
  *   schema: 'public',
  *   timeout: 30000, // 30 second timeout
  * })
  * ```
  */
  constructor(e, { headers: t = {}, schema: s, fetch: n, timeout: i, urlLengthLimit: a = 8e3 } = {}) {
    this.url = e, this.headers = new Headers(t), this.schemaName = s, this.urlLengthLimit = a;
    const o = n ?? globalThis.fetch;
    i !== void 0 && i > 0 ? this.fetch = (l, c) => {
      const u = new AbortController(), f = setTimeout(() => u.abort(), i), d = c == null ? void 0 : c.signal;
      if (d) {
        if (d.aborted)
          return clearTimeout(f), o(l, c);
        const h = () => {
          clearTimeout(f), u.abort();
        };
        return d.addEventListener("abort", h, { once: !0 }), o(l, Re(Re({}, c), {}, { signal: u.signal })).finally(() => {
          clearTimeout(f), d.removeEventListener("abort", h);
        });
      }
      return o(l, Re(Re({}, c), {}, { signal: u.signal })).finally(() => clearTimeout(f));
    } : this.fetch = o;
  }
  /**
  * Perform a query on a table or a view.
  *
  * @param relation - The table or view name to query
  */
  from(e) {
    if (!e || typeof e != "string" || e.trim() === "") throw new Error("Invalid relation name: relation must be a non-empty string.");
    return new ir(new URL(`${this.url}/${e}`), {
      headers: new Headers(this.headers),
      schema: this.schemaName,
      fetch: this.fetch,
      urlLengthLimit: this.urlLengthLimit
    });
  }
  /**
  * Select a schema to query or perform an function (rpc) call.
  *
  * The schema needs to be on the list of exposed schemas inside Supabase.
  *
  * @param schema - The schema to query
  */
  schema(e) {
    return new Ct(this.url, {
      headers: this.headers,
      schema: e,
      fetch: this.fetch,
      urlLengthLimit: this.urlLengthLimit
    });
  }
  /**
  * Perform a function call.
  *
  * @param fn - The function name to call
  * @param args - The arguments to pass to the function call
  * @param options - Named parameters
  * @param options.head - When set to `true`, `data` will not be returned.
  * Useful if you only need the count.
  * @param options.get - When set to `true`, the function will be called with
  * read-only access mode.
  * @param options.count - Count algorithm to use to count rows returned by the
  * function. Only applicable for [set-returning
  * functions](https://www.postgresql.org/docs/current/functions-srf.html).
  *
  * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
  * hood.
  *
  * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
  * statistics under the hood.
  *
  * `"estimated"`: Uses exact count for low numbers and planned count for high
  * numbers.
  *
  * @example
  * ```ts
  * // For cross-schema functions where type inference fails, use overrideTypes:
  * const { data } = await supabase
  *   .schema('schema_b')
  *   .rpc('function_a', {})
  *   .overrideTypes<{ id: string; user_id: string }[]>()
  * ```
  */
  rpc(e, t = {}, { head: s = !1, get: n = !1, count: i } = {}) {
    var a;
    let o;
    const l = new URL(`${this.url}/rpc/${e}`);
    let c;
    const u = (h) => h !== null && typeof h == "object" && (!Array.isArray(h) || h.some(u)), f = s && Object.values(t).some(u);
    f ? (o = "POST", c = t) : s || n ? (o = s ? "HEAD" : "GET", Object.entries(t).filter(([h, p]) => p !== void 0).map(([h, p]) => [h, Array.isArray(p) ? `{${p.join(",")}}` : `${p}`]).forEach(([h, p]) => {
      l.searchParams.append(h, p);
    })) : (o = "POST", c = t);
    const d = new Headers(this.headers);
    return f ? d.set("Prefer", i ? `count=${i},return=minimal` : "return=minimal") : i && d.set("Prefer", `count=${i}`), new ae({
      method: o,
      url: l,
      headers: d,
      schema: this.schemaName,
      body: c,
      fetch: (a = this.fetch) !== null && a !== void 0 ? a : fetch,
      urlLengthLimit: this.urlLengthLimit
    });
  }
};
class ur {
  /**
   * Static-only utility – prevent instantiation.
   */
  constructor() {
  }
  static detectEnvironment() {
    var e;
    if (typeof WebSocket < "u")
      return { type: "native", constructor: WebSocket };
    if (typeof globalThis < "u" && typeof globalThis.WebSocket < "u")
      return { type: "native", constructor: globalThis.WebSocket };
    if (typeof global < "u" && typeof global.WebSocket < "u")
      return { type: "native", constructor: global.WebSocket };
    if (typeof globalThis < "u" && typeof globalThis.WebSocketPair < "u" && typeof globalThis.WebSocket > "u")
      return {
        type: "cloudflare",
        error: "Cloudflare Workers detected. WebSocket clients are not supported in Cloudflare Workers.",
        workaround: "Use Cloudflare Workers WebSocket API for server-side WebSocket handling, or deploy to a different runtime."
      };
    if (typeof globalThis < "u" && globalThis.EdgeRuntime || typeof navigator < "u" && (!((e = navigator.userAgent) === null || e === void 0) && e.includes("Vercel-Edge")))
      return {
        type: "unsupported",
        error: "Edge runtime detected (Vercel Edge/Netlify Edge). WebSockets are not supported in edge functions.",
        workaround: "Use serverless functions or a different deployment target for WebSocket functionality."
      };
    const t = globalThis.process;
    if (t) {
      const s = t.versions;
      if (s && s.node) {
        const n = s.node, i = parseInt(n.replace(/^v/, "").split(".")[0]);
        return i >= 22 ? typeof globalThis.WebSocket < "u" ? { type: "native", constructor: globalThis.WebSocket } : {
          type: "unsupported",
          error: `Node.js ${i} detected but native WebSocket not found.`,
          workaround: "Provide a WebSocket implementation via the transport option."
        } : {
          type: "unsupported",
          error: `Node.js ${i} detected without native WebSocket support.`,
          workaround: `For Node.js < 22, install "ws" package and provide it via the transport option:
import ws from "ws"
new RealtimeClient(url, { transport: ws })`
        };
      }
    }
    return {
      type: "unsupported",
      error: "Unknown JavaScript runtime without WebSocket support.",
      workaround: "Ensure you're running in a supported environment (browser, Node.js, Deno) or provide a custom WebSocket implementation."
    };
  }
  /**
   * Returns the best available WebSocket constructor for the current runtime.
   *
   * @example
   * ```ts
   * const WS = WebSocketFactory.getWebSocketConstructor()
   * const socket = new WS('wss://realtime.supabase.co/socket')
   * ```
   */
  static getWebSocketConstructor() {
    const e = this.detectEnvironment();
    if (e.constructor)
      return e.constructor;
    let t = e.error || "WebSocket not supported in this environment.";
    throw e.workaround && (t += `

Suggested solution: ${e.workaround}`), new Error(t);
  }
  /**
   * Creates a WebSocket using the detected constructor.
   *
   * @example
   * ```ts
   * const socket = WebSocketFactory.createWebSocket('wss://realtime.supabase.co/socket')
   * ```
   */
  static createWebSocket(e, t) {
    const s = this.getWebSocketConstructor();
    return new s(e, t);
  }
  /**
   * Detects whether the runtime can establish WebSocket connections.
   *
   * @example
   * ```ts
   * if (!WebSocketFactory.isWebSocketSupported()) {
   *   console.warn('Falling back to long polling')
   * }
   * ```
   */
  static isWebSocketSupported() {
    try {
      const e = this.detectEnvironment();
      return e.type === "native" || e.type === "ws";
    } catch {
      return !1;
    }
  }
}
const hr = "2.99.2", dr = `realtime-js/${hr}`, fr = "1.0.0", jt = "2.0.0", ct = jt, He = 1e4, pr = 1e3, gr = 100;
var K;
(function(r) {
  r[r.connecting = 0] = "connecting", r[r.open = 1] = "open", r[r.closing = 2] = "closing", r[r.closed = 3] = "closed";
})(K || (K = {}));
var P;
(function(r) {
  r.closed = "closed", r.errored = "errored", r.joined = "joined", r.joining = "joining", r.leaving = "leaving";
})(P || (P = {}));
var D;
(function(r) {
  r.close = "phx_close", r.error = "phx_error", r.join = "phx_join", r.reply = "phx_reply", r.leave = "phx_leave", r.access_token = "access_token";
})(D || (D = {}));
var Xe;
(function(r) {
  r.websocket = "websocket";
})(Xe || (Xe = {}));
var J;
(function(r) {
  r.Connecting = "connecting", r.Open = "open", r.Closing = "closing", r.Closed = "closed";
})(J || (J = {}));
class _r {
  constructor(e) {
    this.HEADER_LENGTH = 1, this.USER_BROADCAST_PUSH_META_LENGTH = 6, this.KINDS = { userBroadcastPush: 3, userBroadcast: 4 }, this.BINARY_ENCODING = 0, this.JSON_ENCODING = 1, this.BROADCAST_EVENT = "broadcast", this.allowedMetadataKeys = [], this.allowedMetadataKeys = e ?? [];
  }
  encode(e, t) {
    if (e.event === this.BROADCAST_EVENT && !(e.payload instanceof ArrayBuffer) && typeof e.payload.event == "string")
      return t(this._binaryEncodeUserBroadcastPush(e));
    let s = [e.join_ref, e.ref, e.topic, e.event, e.payload];
    return t(JSON.stringify(s));
  }
  _binaryEncodeUserBroadcastPush(e) {
    var t;
    return this._isArrayBuffer((t = e.payload) === null || t === void 0 ? void 0 : t.payload) ? this._encodeBinaryUserBroadcastPush(e) : this._encodeJsonUserBroadcastPush(e);
  }
  _encodeBinaryUserBroadcastPush(e) {
    var t, s;
    const n = (s = (t = e.payload) === null || t === void 0 ? void 0 : t.payload) !== null && s !== void 0 ? s : new ArrayBuffer(0);
    return this._encodeUserBroadcastPush(e, this.BINARY_ENCODING, n);
  }
  _encodeJsonUserBroadcastPush(e) {
    var t, s;
    const n = (s = (t = e.payload) === null || t === void 0 ? void 0 : t.payload) !== null && s !== void 0 ? s : {}, a = new TextEncoder().encode(JSON.stringify(n)).buffer;
    return this._encodeUserBroadcastPush(e, this.JSON_ENCODING, a);
  }
  _encodeUserBroadcastPush(e, t, s) {
    var n, i;
    const a = e.topic, o = (n = e.ref) !== null && n !== void 0 ? n : "", l = (i = e.join_ref) !== null && i !== void 0 ? i : "", c = e.payload.event, u = this.allowedMetadataKeys ? this._pick(e.payload, this.allowedMetadataKeys) : {}, f = Object.keys(u).length === 0 ? "" : JSON.stringify(u);
    if (l.length > 255)
      throw new Error(`joinRef length ${l.length} exceeds maximum of 255`);
    if (o.length > 255)
      throw new Error(`ref length ${o.length} exceeds maximum of 255`);
    if (a.length > 255)
      throw new Error(`topic length ${a.length} exceeds maximum of 255`);
    if (c.length > 255)
      throw new Error(`userEvent length ${c.length} exceeds maximum of 255`);
    if (f.length > 255)
      throw new Error(`metadata length ${f.length} exceeds maximum of 255`);
    const d = this.USER_BROADCAST_PUSH_META_LENGTH + l.length + o.length + a.length + c.length + f.length, h = new ArrayBuffer(this.HEADER_LENGTH + d);
    let p = new DataView(h), g = 0;
    p.setUint8(g++, this.KINDS.userBroadcastPush), p.setUint8(g++, l.length), p.setUint8(g++, o.length), p.setUint8(g++, a.length), p.setUint8(g++, c.length), p.setUint8(g++, f.length), p.setUint8(g++, t), Array.from(l, (y) => p.setUint8(g++, y.charCodeAt(0))), Array.from(o, (y) => p.setUint8(g++, y.charCodeAt(0))), Array.from(a, (y) => p.setUint8(g++, y.charCodeAt(0))), Array.from(c, (y) => p.setUint8(g++, y.charCodeAt(0))), Array.from(f, (y) => p.setUint8(g++, y.charCodeAt(0)));
    var _ = new Uint8Array(h.byteLength + s.byteLength);
    return _.set(new Uint8Array(h), 0), _.set(new Uint8Array(s), h.byteLength), _.buffer;
  }
  decode(e, t) {
    if (this._isArrayBuffer(e)) {
      let s = this._binaryDecode(e);
      return t(s);
    }
    if (typeof e == "string") {
      const s = JSON.parse(e), [n, i, a, o, l] = s;
      return t({ join_ref: n, ref: i, topic: a, event: o, payload: l });
    }
    return t({});
  }
  _binaryDecode(e) {
    const t = new DataView(e), s = t.getUint8(0), n = new TextDecoder();
    switch (s) {
      case this.KINDS.userBroadcast:
        return this._decodeUserBroadcast(e, t, n);
    }
  }
  _decodeUserBroadcast(e, t, s) {
    const n = t.getUint8(1), i = t.getUint8(2), a = t.getUint8(3), o = t.getUint8(4);
    let l = this.HEADER_LENGTH + 4;
    const c = s.decode(e.slice(l, l + n));
    l = l + n;
    const u = s.decode(e.slice(l, l + i));
    l = l + i;
    const f = s.decode(e.slice(l, l + a));
    l = l + a;
    const d = e.slice(l, e.byteLength), h = o === this.JSON_ENCODING ? JSON.parse(s.decode(d)) : d, p = {
      type: this.BROADCAST_EVENT,
      event: u,
      payload: h
    };
    return a > 0 && (p.meta = JSON.parse(f)), { join_ref: null, ref: null, topic: c, event: this.BROADCAST_EVENT, payload: p };
  }
  _isArrayBuffer(e) {
    var t;
    return e instanceof ArrayBuffer || ((t = e == null ? void 0 : e.constructor) === null || t === void 0 ? void 0 : t.name) === "ArrayBuffer";
  }
  _pick(e, t) {
    return !e || typeof e != "object" ? {} : Object.fromEntries(Object.entries(e).filter(([s]) => t.includes(s)));
  }
}
class $t {
  constructor(e, t) {
    this.callback = e, this.timerCalc = t, this.timer = void 0, this.tries = 0, this.callback = e, this.timerCalc = t;
  }
  reset() {
    this.tries = 0, clearTimeout(this.timer), this.timer = void 0;
  }
  // Cancels any previous scheduleTimeout and schedules callback
  scheduleTimeout() {
    clearTimeout(this.timer), this.timer = setTimeout(() => {
      this.tries = this.tries + 1, this.callback();
    }, this.timerCalc(this.tries + 1));
  }
}
var k;
(function(r) {
  r.abstime = "abstime", r.bool = "bool", r.date = "date", r.daterange = "daterange", r.float4 = "float4", r.float8 = "float8", r.int2 = "int2", r.int4 = "int4", r.int4range = "int4range", r.int8 = "int8", r.int8range = "int8range", r.json = "json", r.jsonb = "jsonb", r.money = "money", r.numeric = "numeric", r.oid = "oid", r.reltime = "reltime", r.text = "text", r.time = "time", r.timestamp = "timestamp", r.timestamptz = "timestamptz", r.timetz = "timetz", r.tsrange = "tsrange", r.tstzrange = "tstzrange";
})(k || (k = {}));
const ut = (r, e, t = {}) => {
  var s;
  const n = (s = t.skipTypes) !== null && s !== void 0 ? s : [];
  return e ? Object.keys(e).reduce((i, a) => (i[a] = yr(a, r, e, n), i), {}) : {};
}, yr = (r, e, t, s) => {
  const n = e.find((o) => o.name === r), i = n == null ? void 0 : n.type, a = t[r];
  return i && !s.includes(i) ? Ut(i, a) : ze(a);
}, Ut = (r, e) => {
  if (r.charAt(0) === "_") {
    const t = r.slice(1, r.length);
    return br(e, t);
  }
  switch (r) {
    case k.bool:
      return mr(e);
    case k.float4:
    case k.float8:
    case k.int2:
    case k.int4:
    case k.int8:
    case k.numeric:
    case k.oid:
      return vr(e);
    case k.json:
    case k.jsonb:
      return wr(e);
    case k.timestamp:
      return Er(e);
    case k.abstime:
    case k.date:
    case k.daterange:
    case k.int4range:
    case k.int8range:
    case k.money:
    case k.reltime:
    case k.text:
    case k.time:
    case k.timestamptz:
    case k.timetz:
    case k.tsrange:
    case k.tstzrange:
      return ze(e);
    default:
      return ze(e);
  }
}, ze = (r) => r, mr = (r) => {
  switch (r) {
    case "t":
      return !0;
    case "f":
      return !1;
    default:
      return r;
  }
}, vr = (r) => {
  if (typeof r == "string") {
    const e = parseFloat(r);
    if (!Number.isNaN(e))
      return e;
  }
  return r;
}, wr = (r) => {
  if (typeof r == "string")
    try {
      return JSON.parse(r);
    } catch {
      return r;
    }
  return r;
}, br = (r, e) => {
  if (typeof r != "string")
    return r;
  const t = r.length - 1, s = r[t];
  if (r[0] === "{" && s === "}") {
    let i;
    const a = r.slice(1, t);
    try {
      i = JSON.parse("[" + a + "]");
    } catch {
      i = a ? a.split(",") : [];
    }
    return i.map((o) => Ut(e, o));
  }
  return r;
}, Er = (r) => typeof r == "string" ? r.replace(" ", "T") : r, Nt = (r) => {
  const e = new URL(r);
  return e.protocol = e.protocol.replace(/^ws/i, "http"), e.pathname = e.pathname.replace(/\/+$/, "").replace(/\/socket\/websocket$/i, "").replace(/\/socket$/i, "").replace(/\/websocket$/i, ""), e.pathname === "" || e.pathname === "/" ? e.pathname = "/api/broadcast" : e.pathname = e.pathname + "/api/broadcast", e.href;
};
class Be {
  /**
   * Initializes the Push
   *
   * @param channel The Channel
   * @param event The event, for example `"phx_join"`
   * @param payload The payload, for example `{user_id: 123}`
   * @param timeout The push timeout in milliseconds
   */
  constructor(e, t, s = {}, n = He) {
    this.channel = e, this.event = t, this.payload = s, this.timeout = n, this.sent = !1, this.timeoutTimer = void 0, this.ref = "", this.receivedResp = null, this.recHooks = [], this.refEvent = null;
  }
  resend(e) {
    this.timeout = e, this._cancelRefEvent(), this.ref = "", this.refEvent = null, this.receivedResp = null, this.sent = !1, this.send();
  }
  send() {
    this._hasReceived("timeout") || (this.startTimeout(), this.sent = !0, this.channel.socket.push({
      topic: this.channel.topic,
      event: this.event,
      payload: this.payload,
      ref: this.ref,
      join_ref: this.channel._joinRef()
    }));
  }
  updatePayload(e) {
    this.payload = Object.assign(Object.assign({}, this.payload), e);
  }
  receive(e, t) {
    var s;
    return this._hasReceived(e) && t((s = this.receivedResp) === null || s === void 0 ? void 0 : s.response), this.recHooks.push({ status: e, callback: t }), this;
  }
  startTimeout() {
    if (this.timeoutTimer)
      return;
    this.ref = this.channel.socket._makeRef(), this.refEvent = this.channel._replyEventName(this.ref);
    const e = (t) => {
      this._cancelRefEvent(), this._cancelTimeout(), this.receivedResp = t, this._matchReceive(t);
    };
    this.channel._on(this.refEvent, {}, e), this.timeoutTimer = setTimeout(() => {
      this.trigger("timeout", {});
    }, this.timeout);
  }
  trigger(e, t) {
    this.refEvent && this.channel._trigger(this.refEvent, { status: e, response: t });
  }
  destroy() {
    this._cancelRefEvent(), this._cancelTimeout();
  }
  _cancelRefEvent() {
    this.refEvent && this.channel._off(this.refEvent, {});
  }
  _cancelTimeout() {
    clearTimeout(this.timeoutTimer), this.timeoutTimer = void 0;
  }
  _matchReceive({ status: e, response: t }) {
    this.recHooks.filter((s) => s.status === e).forEach((s) => s.callback(t));
  }
  _hasReceived(e) {
    return this.receivedResp && this.receivedResp.status === e;
  }
}
var ht;
(function(r) {
  r.SYNC = "sync", r.JOIN = "join", r.LEAVE = "leave";
})(ht || (ht = {}));
class _e {
  /**
   * Creates a Presence helper that keeps the local presence state in sync with the server.
   *
   * @param channel - The realtime channel to bind to.
   * @param opts - Optional custom event names, e.g. `{ events: { state: 'state', diff: 'diff' } }`.
   *
   * @example
   * ```ts
   * const presence = new RealtimePresence(channel)
   *
   * channel.on('presence', ({ event, key }) => {
   *   console.log(`Presence ${event} on ${key}`)
   * })
   * ```
   */
  constructor(e, t) {
    this.channel = e, this.state = {}, this.pendingDiffs = [], this.joinRef = null, this.enabled = !1, this.caller = {
      onJoin: () => {
      },
      onLeave: () => {
      },
      onSync: () => {
      }
    };
    const s = (t == null ? void 0 : t.events) || {
      state: "presence_state",
      diff: "presence_diff"
    };
    this.channel._on(s.state, {}, (n) => {
      const { onJoin: i, onLeave: a, onSync: o } = this.caller;
      this.joinRef = this.channel._joinRef(), this.state = _e.syncState(this.state, n, i, a), this.pendingDiffs.forEach((l) => {
        this.state = _e.syncDiff(this.state, l, i, a);
      }), this.pendingDiffs = [], o();
    }), this.channel._on(s.diff, {}, (n) => {
      const { onJoin: i, onLeave: a, onSync: o } = this.caller;
      this.inPendingSyncState() ? this.pendingDiffs.push(n) : (this.state = _e.syncDiff(this.state, n, i, a), o());
    }), this.onJoin((n, i, a) => {
      this.channel._trigger("presence", {
        event: "join",
        key: n,
        currentPresences: i,
        newPresences: a
      });
    }), this.onLeave((n, i, a) => {
      this.channel._trigger("presence", {
        event: "leave",
        key: n,
        currentPresences: i,
        leftPresences: a
      });
    }), this.onSync(() => {
      this.channel._trigger("presence", { event: "sync" });
    });
  }
  /**
   * Used to sync the list of presences on the server with the
   * client's state.
   *
   * An optional `onJoin` and `onLeave` callback can be provided to
   * react to changes in the client's local presences across
   * disconnects and reconnects with the server.
   *
   * @internal
   */
  static syncState(e, t, s, n) {
    const i = this.cloneDeep(e), a = this.transformState(t), o = {}, l = {};
    return this.map(i, (c, u) => {
      a[c] || (l[c] = u);
    }), this.map(a, (c, u) => {
      const f = i[c];
      if (f) {
        const d = u.map((_) => _.presence_ref), h = f.map((_) => _.presence_ref), p = u.filter((_) => h.indexOf(_.presence_ref) < 0), g = f.filter((_) => d.indexOf(_.presence_ref) < 0);
        p.length > 0 && (o[c] = p), g.length > 0 && (l[c] = g);
      } else
        o[c] = u;
    }), this.syncDiff(i, { joins: o, leaves: l }, s, n);
  }
  /**
   * Used to sync a diff of presence join and leave events from the
   * server, as they happen.
   *
   * Like `syncState`, `syncDiff` accepts optional `onJoin` and
   * `onLeave` callbacks to react to a user joining or leaving from a
   * device.
   *
   * @internal
   */
  static syncDiff(e, t, s, n) {
    const { joins: i, leaves: a } = {
      joins: this.transformState(t.joins),
      leaves: this.transformState(t.leaves)
    };
    return s || (s = () => {
    }), n || (n = () => {
    }), this.map(i, (o, l) => {
      var c;
      const u = (c = e[o]) !== null && c !== void 0 ? c : [];
      if (e[o] = this.cloneDeep(l), u.length > 0) {
        const f = e[o].map((h) => h.presence_ref), d = u.filter((h) => f.indexOf(h.presence_ref) < 0);
        e[o].unshift(...d);
      }
      s(o, u, l);
    }), this.map(a, (o, l) => {
      let c = e[o];
      if (!c)
        return;
      const u = l.map((f) => f.presence_ref);
      c = c.filter((f) => u.indexOf(f.presence_ref) < 0), e[o] = c, n(o, c, l), c.length === 0 && delete e[o];
    }), e;
  }
  /** @internal */
  static map(e, t) {
    return Object.getOwnPropertyNames(e).map((s) => t(s, e[s]));
  }
  /**
   * Remove 'metas' key
   * Change 'phx_ref' to 'presence_ref'
   * Remove 'phx_ref' and 'phx_ref_prev'
   *
   * @example
   * // returns {
   *  abc123: [
   *    { presence_ref: '2', user_id: 1 },
   *    { presence_ref: '3', user_id: 2 }
   *  ]
   * }
   * RealtimePresence.transformState({
   *  abc123: {
   *    metas: [
   *      { phx_ref: '2', phx_ref_prev: '1' user_id: 1 },
   *      { phx_ref: '3', user_id: 2 }
   *    ]
   *  }
   * })
   *
   * @internal
   */
  static transformState(e) {
    return e = this.cloneDeep(e), Object.getOwnPropertyNames(e).reduce((t, s) => {
      const n = e[s];
      return "metas" in n ? t[s] = n.metas.map((i) => (i.presence_ref = i.phx_ref, delete i.phx_ref, delete i.phx_ref_prev, i)) : t[s] = n, t;
    }, {});
  }
  /** @internal */
  static cloneDeep(e) {
    return JSON.parse(JSON.stringify(e));
  }
  /** @internal */
  onJoin(e) {
    this.caller.onJoin = e;
  }
  /** @internal */
  onLeave(e) {
    this.caller.onLeave = e;
  }
  /** @internal */
  onSync(e) {
    this.caller.onSync = e;
  }
  /** @internal */
  inPendingSyncState() {
    return !this.joinRef || this.joinRef !== this.channel._joinRef();
  }
}
var dt;
(function(r) {
  r.ALL = "*", r.INSERT = "INSERT", r.UPDATE = "UPDATE", r.DELETE = "DELETE";
})(dt || (dt = {}));
var ye;
(function(r) {
  r.BROADCAST = "broadcast", r.PRESENCE = "presence", r.POSTGRES_CHANGES = "postgres_changes", r.SYSTEM = "system";
})(ye || (ye = {}));
var M;
(function(r) {
  r.SUBSCRIBED = "SUBSCRIBED", r.TIMED_OUT = "TIMED_OUT", r.CLOSED = "CLOSED", r.CHANNEL_ERROR = "CHANNEL_ERROR";
})(M || (M = {}));
class ue {
  /**
   * Creates a channel that can broadcast messages, sync presence, and listen to Postgres changes.
   *
   * The topic determines which realtime stream you are subscribing to. Config options let you
   * enable acknowledgement for broadcasts, presence tracking, or private channels.
   *
   * @example
   * ```ts
   * import RealtimeClient from '@supabase/realtime-js'
   *
   * const client = new RealtimeClient('https://xyzcompany.supabase.co/realtime/v1', {
   *   params: { apikey: 'public-anon-key' },
   * })
   * const channel = new RealtimeChannel('realtime:public:messages', { config: {} }, client)
   * ```
   */
  constructor(e, t = { config: {} }, s) {
    var n, i;
    if (this.topic = e, this.params = t, this.socket = s, this.bindings = {}, this.state = P.closed, this.joinedOnce = !1, this.pushBuffer = [], this.subTopic = e.replace(/^realtime:/i, ""), this.params.config = Object.assign({
      broadcast: { ack: !1, self: !1 },
      presence: { key: "", enabled: !1 },
      private: !1
    }, t.config), this.timeout = this.socket.timeout, this.joinPush = new Be(this, D.join, this.params, this.timeout), this.rejoinTimer = new $t(() => this._rejoinUntilConnected(), this.socket.reconnectAfterMs), this.joinPush.receive("ok", () => {
      this.state = P.joined, this.rejoinTimer.reset(), this.pushBuffer.forEach((a) => a.send()), this.pushBuffer = [];
    }), this._onClose(() => {
      this.rejoinTimer.reset(), this.socket.log("channel", `close ${this.topic} ${this._joinRef()}`), this.state = P.closed, this.socket._remove(this);
    }), this._onError((a) => {
      this._isLeaving() || this._isClosed() || (this.socket.log("channel", `error ${this.topic}`, a), this.state = P.errored, this.rejoinTimer.scheduleTimeout());
    }), this.joinPush.receive("timeout", () => {
      this._isJoining() && (this.socket.log("channel", `timeout ${this.topic}`, this.joinPush.timeout), this.state = P.errored, this.rejoinTimer.scheduleTimeout());
    }), this.joinPush.receive("error", (a) => {
      this._isLeaving() || this._isClosed() || (this.socket.log("channel", `error ${this.topic}`, a), this.state = P.errored, this.rejoinTimer.scheduleTimeout());
    }), this._on(D.reply, {}, (a, o) => {
      this._trigger(this._replyEventName(o), a);
    }), this.presence = new _e(this), this.broadcastEndpointURL = Nt(this.socket.endPoint), this.private = this.params.config.private || !1, !this.private && (!((i = (n = this.params.config) === null || n === void 0 ? void 0 : n.broadcast) === null || i === void 0) && i.replay))
      throw `tried to use replay on public channel '${this.topic}'. It must be a private channel.`;
  }
  /** Subscribe registers your client with the server */
  subscribe(e, t = this.timeout) {
    var s, n, i;
    if (this.socket.isConnected() || this.socket.connect(), this.state == P.closed) {
      const { config: { broadcast: a, presence: o, private: l } } = this.params, c = (n = (s = this.bindings.postgres_changes) === null || s === void 0 ? void 0 : s.map((h) => h.filter)) !== null && n !== void 0 ? n : [], u = !!this.bindings[ye.PRESENCE] && this.bindings[ye.PRESENCE].length > 0 || ((i = this.params.config.presence) === null || i === void 0 ? void 0 : i.enabled) === !0, f = {}, d = {
        broadcast: a,
        presence: Object.assign(Object.assign({}, o), { enabled: u }),
        postgres_changes: c,
        private: l
      };
      this.socket.accessTokenValue && (f.access_token = this.socket.accessTokenValue), this._onError((h) => e == null ? void 0 : e(M.CHANNEL_ERROR, h)), this._onClose(() => e == null ? void 0 : e(M.CLOSED)), this.updateJoinPayload(Object.assign({ config: d }, f)), this.joinedOnce = !0, this._rejoin(t), this.joinPush.receive("ok", async ({ postgres_changes: h }) => {
        var p;
        if (this.socket._isManualToken() || this.socket.setAuth(), h === void 0) {
          e == null || e(M.SUBSCRIBED);
          return;
        } else {
          const g = this.bindings.postgres_changes, _ = (p = g == null ? void 0 : g.length) !== null && p !== void 0 ? p : 0, y = [];
          for (let w = 0; w < _; w++) {
            const m = g[w], { filter: { event: T, schema: R, table: S, filter: I } } = m, W = h && h[w];
            if (W && W.event === T && ue.isFilterValueEqual(W.schema, R) && ue.isFilterValueEqual(W.table, S) && ue.isFilterValueEqual(W.filter, I))
              y.push(Object.assign(Object.assign({}, m), { id: W.id }));
            else {
              this.unsubscribe(), this.state = P.errored, e == null || e(M.CHANNEL_ERROR, new Error("mismatch between server and client bindings for postgres changes"));
              return;
            }
          }
          this.bindings.postgres_changes = y, e && e(M.SUBSCRIBED);
          return;
        }
      }).receive("error", (h) => {
        this.state = P.errored, e == null || e(M.CHANNEL_ERROR, new Error(JSON.stringify(Object.values(h).join(", ") || "error")));
      }).receive("timeout", () => {
        e == null || e(M.TIMED_OUT);
      });
    }
    return this;
  }
  /**
   * Returns the current presence state for this channel.
   *
   * The shape is a map keyed by presence key (for example a user id) where each entry contains the
   * tracked metadata for that user.
   */
  presenceState() {
    return this.presence.state;
  }
  /**
   * Sends the supplied payload to the presence tracker so other subscribers can see that this
   * client is online. Use `untrack` to stop broadcasting presence for the same key.
   */
  async track(e, t = {}) {
    return await this.send({
      type: "presence",
      event: "track",
      payload: e
    }, t.timeout || this.timeout);
  }
  /**
   * Removes the current presence state for this client.
   */
  async untrack(e = {}) {
    return await this.send({
      type: "presence",
      event: "untrack"
    }, e);
  }
  on(e, t, s) {
    return this.state === P.joined && e === ye.PRESENCE && (this.socket.log("channel", `resubscribe to ${this.topic} due to change in presence callbacks on joined channel`), this.unsubscribe().then(async () => await this.subscribe())), this._on(e, t, s);
  }
  /**
   * Sends a broadcast message explicitly via REST API.
   *
   * This method always uses the REST API endpoint regardless of WebSocket connection state.
   * Useful when you want to guarantee REST delivery or when gradually migrating from implicit REST fallback.
   *
   * @param event The name of the broadcast event
   * @param payload Payload to be sent (required)
   * @param opts Options including timeout
   * @returns Promise resolving to object with success status, and error details if failed
   */
  async httpSend(e, t, s = {}) {
    var n;
    if (t == null)
      return Promise.reject("Payload is required for httpSend()");
    const i = {
      apikey: this.socket.apiKey ? this.socket.apiKey : "",
      "Content-Type": "application/json"
    };
    this.socket.accessTokenValue && (i.Authorization = `Bearer ${this.socket.accessTokenValue}`);
    const a = {
      method: "POST",
      headers: i,
      body: JSON.stringify({
        messages: [
          {
            topic: this.subTopic,
            event: e,
            payload: t,
            private: this.private
          }
        ]
      })
    }, o = await this._fetchWithTimeout(this.broadcastEndpointURL, a, (n = s.timeout) !== null && n !== void 0 ? n : this.timeout);
    if (o.status === 202)
      return { success: !0 };
    let l = o.statusText;
    try {
      const c = await o.json();
      l = c.error || c.message || l;
    } catch {
    }
    return Promise.reject(new Error(l));
  }
  /**
   * Sends a message into the channel.
   *
   * @param args Arguments to send to channel
   * @param args.type The type of event to send
   * @param args.event The name of the event being sent
   * @param args.payload Payload to be sent
   * @param opts Options to be used during the send process
   */
  async send(e, t = {}) {
    var s, n;
    if (!this._canPush() && e.type === "broadcast") {
      console.warn("Realtime send() is automatically falling back to REST API. This behavior will be deprecated in the future. Please use httpSend() explicitly for REST delivery.");
      const { event: i, payload: a } = e, o = {
        apikey: this.socket.apiKey ? this.socket.apiKey : "",
        "Content-Type": "application/json"
      };
      this.socket.accessTokenValue && (o.Authorization = `Bearer ${this.socket.accessTokenValue}`);
      const l = {
        method: "POST",
        headers: o,
        body: JSON.stringify({
          messages: [
            {
              topic: this.subTopic,
              event: i,
              payload: a,
              private: this.private
            }
          ]
        })
      };
      try {
        const c = await this._fetchWithTimeout(this.broadcastEndpointURL, l, (s = t.timeout) !== null && s !== void 0 ? s : this.timeout);
        return await ((n = c.body) === null || n === void 0 ? void 0 : n.cancel()), c.ok ? "ok" : "error";
      } catch (c) {
        return c.name === "AbortError" ? "timed out" : "error";
      }
    } else
      return new Promise((i) => {
        var a, o, l;
        const c = this._push(e.type, e, t.timeout || this.timeout);
        e.type === "broadcast" && !(!((l = (o = (a = this.params) === null || a === void 0 ? void 0 : a.config) === null || o === void 0 ? void 0 : o.broadcast) === null || l === void 0) && l.ack) && i("ok"), c.receive("ok", () => i("ok")), c.receive("error", () => i("error")), c.receive("timeout", () => i("timed out"));
      });
  }
  /**
   * Updates the payload that will be sent the next time the channel joins (reconnects).
   * Useful for rotating access tokens or updating config without re-creating the channel.
   */
  updateJoinPayload(e) {
    this.joinPush.updatePayload(e);
  }
  /**
   * Leaves the channel.
   *
   * Unsubscribes from server events, and instructs channel to terminate on server.
   * Triggers onClose() hooks.
   *
   * To receive leave acknowledgements, use the a `receive` hook to bind to the server ack, ie:
   * channel.unsubscribe().receive("ok", () => alert("left!") )
   */
  unsubscribe(e = this.timeout) {
    this.state = P.leaving;
    const t = () => {
      this.socket.log("channel", `leave ${this.topic}`), this._trigger(D.close, "leave", this._joinRef());
    };
    this.joinPush.destroy();
    let s = null;
    return new Promise((n) => {
      s = new Be(this, D.leave, {}, e), s.receive("ok", () => {
        t(), n("ok");
      }).receive("timeout", () => {
        t(), n("timed out");
      }).receive("error", () => {
        n("error");
      }), s.send(), this._canPush() || s.trigger("ok", {});
    }).finally(() => {
      s == null || s.destroy();
    });
  }
  /**
   * Teardown the channel.
   *
   * Destroys and stops related timers.
   */
  teardown() {
    this.pushBuffer.forEach((e) => e.destroy()), this.pushBuffer = [], this.rejoinTimer.reset(), this.joinPush.destroy(), this.state = P.closed, this.bindings = {};
  }
  /** @internal */
  async _fetchWithTimeout(e, t, s) {
    const n = new AbortController(), i = setTimeout(() => n.abort(), s), a = await this.socket.fetch(e, Object.assign(Object.assign({}, t), { signal: n.signal }));
    return clearTimeout(i), a;
  }
  /** @internal */
  _push(e, t, s = this.timeout) {
    if (!this.joinedOnce)
      throw `tried to push '${e}' to '${this.topic}' before joining. Use channel.subscribe() before pushing events`;
    let n = new Be(this, e, t, s);
    return this._canPush() ? n.send() : this._addToPushBuffer(n), n;
  }
  /** @internal */
  _addToPushBuffer(e) {
    if (e.startTimeout(), this.pushBuffer.push(e), this.pushBuffer.length > gr) {
      const t = this.pushBuffer.shift();
      t && (t.destroy(), this.socket.log("channel", `discarded push due to buffer overflow: ${t.event}`, t.payload));
    }
  }
  /**
   * Overridable message hook
   *
   * Receives all events for specialized message handling before dispatching to the channel callbacks.
   * Must return the payload, modified or unmodified.
   *
   * @internal
   */
  _onMessage(e, t, s) {
    return t;
  }
  /** @internal */
  _isMember(e) {
    return this.topic === e;
  }
  /** @internal */
  _joinRef() {
    return this.joinPush.ref;
  }
  /** @internal */
  _trigger(e, t, s) {
    var n, i;
    const a = e.toLocaleLowerCase(), { close: o, error: l, leave: c, join: u } = D;
    if (s && [o, l, c, u].indexOf(a) >= 0 && s !== this._joinRef())
      return;
    let d = this._onMessage(a, t, s);
    if (t && !d)
      throw "channel onMessage callbacks must return the payload, modified or unmodified";
    ["insert", "update", "delete"].includes(a) ? (n = this.bindings.postgres_changes) === null || n === void 0 || n.filter((h) => {
      var p, g, _;
      return ((p = h.filter) === null || p === void 0 ? void 0 : p.event) === "*" || ((_ = (g = h.filter) === null || g === void 0 ? void 0 : g.event) === null || _ === void 0 ? void 0 : _.toLocaleLowerCase()) === a;
    }).map((h) => h.callback(d, s)) : (i = this.bindings[a]) === null || i === void 0 || i.filter((h) => {
      var p, g, _, y, w, m;
      if (["broadcast", "presence", "postgres_changes"].includes(a))
        if ("id" in h) {
          const T = h.id, R = (p = h.filter) === null || p === void 0 ? void 0 : p.event;
          return T && ((g = t.ids) === null || g === void 0 ? void 0 : g.includes(T)) && (R === "*" || (R == null ? void 0 : R.toLocaleLowerCase()) === ((_ = t.data) === null || _ === void 0 ? void 0 : _.type.toLocaleLowerCase()));
        } else {
          const T = (w = (y = h == null ? void 0 : h.filter) === null || y === void 0 ? void 0 : y.event) === null || w === void 0 ? void 0 : w.toLocaleLowerCase();
          return T === "*" || T === ((m = t == null ? void 0 : t.event) === null || m === void 0 ? void 0 : m.toLocaleLowerCase());
        }
      else
        return h.type.toLocaleLowerCase() === a;
    }).map((h) => {
      if (typeof d == "object" && "ids" in d) {
        const p = d.data, { schema: g, table: _, commit_timestamp: y, type: w, errors: m } = p;
        d = Object.assign(Object.assign({}, {
          schema: g,
          table: _,
          commit_timestamp: y,
          eventType: w,
          new: {},
          old: {},
          errors: m
        }), this._getPayloadRecords(p));
      }
      h.callback(d, s);
    });
  }
  /** @internal */
  _isClosed() {
    return this.state === P.closed;
  }
  /** @internal */
  _isJoined() {
    return this.state === P.joined;
  }
  /** @internal */
  _isJoining() {
    return this.state === P.joining;
  }
  /** @internal */
  _isLeaving() {
    return this.state === P.leaving;
  }
  /** @internal */
  _replyEventName(e) {
    return `chan_reply_${e}`;
  }
  /** @internal */
  _on(e, t, s) {
    const n = e.toLocaleLowerCase(), i = {
      type: n,
      filter: t,
      callback: s
    };
    return this.bindings[n] ? this.bindings[n].push(i) : this.bindings[n] = [i], this;
  }
  /** @internal */
  _off(e, t) {
    const s = e.toLocaleLowerCase();
    return this.bindings[s] && (this.bindings[s] = this.bindings[s].filter((n) => {
      var i;
      return !(((i = n.type) === null || i === void 0 ? void 0 : i.toLocaleLowerCase()) === s && ue.isEqual(n.filter, t));
    })), this;
  }
  /** @internal */
  static isEqual(e, t) {
    if (Object.keys(e).length !== Object.keys(t).length)
      return !1;
    for (const s in e)
      if (e[s] !== t[s])
        return !1;
    return !0;
  }
  /**
   * Compares two optional filter values for equality.
   * Treats undefined, null, and empty string as equivalent empty values.
   * @internal
   */
  static isFilterValueEqual(e, t) {
    return (e ?? void 0) === (t ?? void 0);
  }
  /** @internal */
  _rejoinUntilConnected() {
    this.rejoinTimer.scheduleTimeout(), this.socket.isConnected() && this._rejoin();
  }
  /**
   * Registers a callback that will be executed when the channel closes.
   *
   * @internal
   */
  _onClose(e) {
    this._on(D.close, {}, e);
  }
  /**
   * Registers a callback that will be executed when the channel encounteres an error.
   *
   * @internal
   */
  _onError(e) {
    this._on(D.error, {}, (t) => e(t));
  }
  /**
   * Returns `true` if the socket is connected and the channel has been joined.
   *
   * @internal
   */
  _canPush() {
    return this.socket.isConnected() && this._isJoined();
  }
  /** @internal */
  _rejoin(e = this.timeout) {
    this._isLeaving() || (this.socket._leaveOpenTopic(this.topic), this.state = P.joining, this.joinPush.resend(e));
  }
  /** @internal */
  _getPayloadRecords(e) {
    const t = {
      new: {},
      old: {}
    };
    return (e.type === "INSERT" || e.type === "UPDATE") && (t.new = ut(e.columns, e.record)), (e.type === "UPDATE" || e.type === "DELETE") && (t.old = ut(e.columns, e.old_record)), t;
  }
}
const qe = () => {
}, Ae = {
  HEARTBEAT_INTERVAL: 25e3,
  RECONNECT_DELAY: 10,
  HEARTBEAT_TIMEOUT_FALLBACK: 100
}, Tr = [1e3, 2e3, 5e3, 1e4], Sr = 1e4, kr = `
  addEventListener("message", (e) => {
    if (e.data.event === "start") {
      setInterval(() => postMessage({ event: "keepAlive" }), e.data.interval);
    }
  });`;
class Rr {
  /**
   * Initializes the Socket.
   *
   * @param endPoint The string WebSocket endpoint, ie, "ws://example.com/socket", "wss://example.com", "/socket" (inherited host & protocol)
   * @param httpEndpoint The string HTTP endpoint, ie, "https://example.com", "/" (inherited host & protocol)
   * @param options.transport The Websocket Transport, for example WebSocket. This can be a custom implementation
   * @param options.timeout The default timeout in milliseconds to trigger push timeouts.
   * @param options.params The optional params to pass when connecting.
   * @param options.headers Deprecated: headers cannot be set on websocket connections and this option will be removed in the future.
   * @param options.heartbeatIntervalMs The millisec interval to send a heartbeat message.
   * @param options.heartbeatCallback The optional function to handle heartbeat status and latency.
   * @param options.logger The optional function for specialized logging, ie: logger: (kind, msg, data) => { console.log(`${kind}: ${msg}`, data) }
   * @param options.logLevel Sets the log level for Realtime
   * @param options.encode The function to encode outgoing messages. Defaults to JSON: (payload, callback) => callback(JSON.stringify(payload))
   * @param options.decode The function to decode incoming messages. Defaults to Serializer's decode.
   * @param options.reconnectAfterMs he optional function that returns the millsec reconnect interval. Defaults to stepped backoff off.
   * @param options.worker Use Web Worker to set a side flow. Defaults to false.
   * @param options.workerUrl The URL of the worker script. Defaults to https://realtime.supabase.com/worker.js that includes a heartbeat event call to keep the connection alive.
   * @param options.vsn The protocol version to use when connecting. Supported versions are "1.0.0" and "2.0.0". Defaults to "2.0.0".
   * @example
   * ```ts
   * import RealtimeClient from '@supabase/realtime-js'
   *
   * const client = new RealtimeClient('https://xyzcompany.supabase.co/realtime/v1', {
   *   params: { apikey: 'public-anon-key' },
   * })
   * client.connect()
   * ```
   */
  constructor(e, t) {
    var s;
    if (this.accessTokenValue = null, this.apiKey = null, this._manuallySetToken = !1, this.channels = new Array(), this.endPoint = "", this.httpEndpoint = "", this.headers = {}, this.params = {}, this.timeout = He, this.transport = null, this.heartbeatIntervalMs = Ae.HEARTBEAT_INTERVAL, this.heartbeatTimer = void 0, this.pendingHeartbeatRef = null, this.heartbeatCallback = qe, this.ref = 0, this.reconnectTimer = null, this.vsn = ct, this.logger = qe, this.conn = null, this.sendBuffer = [], this.serializer = new _r(), this.stateChangeCallbacks = {
      open: [],
      close: [],
      error: [],
      message: []
    }, this.accessToken = null, this._connectionState = "disconnected", this._wasManualDisconnect = !1, this._authPromise = null, this._heartbeatSentAt = null, this._resolveFetch = (n) => n ? (...i) => n(...i) : (...i) => fetch(...i), !(!((s = t == null ? void 0 : t.params) === null || s === void 0) && s.apikey))
      throw new Error("API key is required to connect to Realtime");
    this.apiKey = t.params.apikey, this.endPoint = `${e}/${Xe.websocket}`, this.httpEndpoint = Nt(e), this._initializeOptions(t), this._setupReconnectionTimer(), this.fetch = this._resolveFetch(t == null ? void 0 : t.fetch);
  }
  /**
   * Connects the socket, unless already connected.
   */
  connect() {
    if (!(this.isConnecting() || this.isDisconnecting() || this.conn !== null && this.isConnected())) {
      if (this._setConnectionState("connecting"), this.accessToken && !this._authPromise && this._setAuthSafely("connect"), this.transport)
        this.conn = new this.transport(this.endpointURL());
      else
        try {
          this.conn = ur.createWebSocket(this.endpointURL());
        } catch (e) {
          this._setConnectionState("disconnected");
          const t = e.message;
          throw t.includes("Node.js") ? new Error(`${t}

To use Realtime in Node.js, you need to provide a WebSocket implementation:

Option 1: Use Node.js 22+ which has native WebSocket support
Option 2: Install and provide the "ws" package:

  npm install ws

  import ws from "ws"
  const client = new RealtimeClient(url, {
    ...options,
    transport: ws
  })`) : new Error(`WebSocket not available: ${t}`);
        }
      this._setupConnectionHandlers();
    }
  }
  /**
   * Returns the URL of the websocket.
   * @returns string The URL of the websocket.
   */
  endpointURL() {
    return this._appendParams(this.endPoint, Object.assign({}, this.params, { vsn: this.vsn }));
  }
  /**
   * Disconnects the socket.
   *
   * @param code A numeric status code to send on disconnect.
   * @param reason A custom reason for the disconnect.
   */
  disconnect(e, t) {
    if (!this.isDisconnecting())
      if (this._setConnectionState("disconnecting", !0), this.conn) {
        const s = setTimeout(() => {
          this._setConnectionState("disconnected");
        }, 100);
        this.conn.onclose = () => {
          clearTimeout(s), this._setConnectionState("disconnected");
        }, typeof this.conn.close == "function" && (e ? this.conn.close(e, t ?? "") : this.conn.close()), this._teardownConnection();
      } else
        this._setConnectionState("disconnected");
  }
  /**
   * Returns all created channels
   */
  getChannels() {
    return this.channels;
  }
  /**
   * Unsubscribes and removes a single channel
   * @param channel A RealtimeChannel instance
   */
  async removeChannel(e) {
    const t = await e.unsubscribe();
    return this.channels.length === 0 && this.disconnect(), t;
  }
  /**
   * Unsubscribes and removes all channels
   */
  async removeAllChannels() {
    const e = await Promise.all(this.channels.map((t) => t.unsubscribe()));
    return this.channels = [], this.disconnect(), e;
  }
  /**
   * Logs the message.
   *
   * For customized logging, `this.logger` can be overridden.
   */
  log(e, t, s) {
    this.logger(e, t, s);
  }
  /**
   * Returns the current state of the socket.
   */
  connectionState() {
    switch (this.conn && this.conn.readyState) {
      case K.connecting:
        return J.Connecting;
      case K.open:
        return J.Open;
      case K.closing:
        return J.Closing;
      default:
        return J.Closed;
    }
  }
  /**
   * Returns `true` is the connection is open.
   */
  isConnected() {
    return this.connectionState() === J.Open;
  }
  /**
   * Returns `true` if the connection is currently connecting.
   */
  isConnecting() {
    return this._connectionState === "connecting";
  }
  /**
   * Returns `true` if the connection is currently disconnecting.
   */
  isDisconnecting() {
    return this._connectionState === "disconnecting";
  }
  /**
   * Creates (or reuses) a {@link RealtimeChannel} for the provided topic.
   *
   * Topics are automatically prefixed with `realtime:` to match the Realtime service.
   * If a channel with the same topic already exists it will be returned instead of creating
   * a duplicate connection.
   */
  channel(e, t = { config: {} }) {
    const s = `realtime:${e}`, n = this.getChannels().find((i) => i.topic === s);
    if (n)
      return n;
    {
      const i = new ue(`realtime:${e}`, t, this);
      return this.channels.push(i), i;
    }
  }
  /**
   * Push out a message if the socket is connected.
   *
   * If the socket is not connected, the message gets enqueued within a local buffer, and sent out when a connection is next established.
   */
  push(e) {
    const { topic: t, event: s, payload: n, ref: i } = e, a = () => {
      this.encode(e, (o) => {
        var l;
        (l = this.conn) === null || l === void 0 || l.send(o);
      });
    };
    this.log("push", `${t} ${s} (${i})`, n), this.isConnected() ? a() : this.sendBuffer.push(a);
  }
  /**
   * Sets the JWT access token used for channel subscription authorization and Realtime RLS.
   *
   * If param is null it will use the `accessToken` callback function or the token set on the client.
   *
   * On callback used, it will set the value of the token internal to the client.
   *
   * When a token is explicitly provided, it will be preserved across channel operations
   * (including removeChannel and resubscribe). The `accessToken` callback will not be
   * invoked until `setAuth()` is called without arguments.
   *
   * @param token A JWT string to override the token set on the client.
   *
   * @example
   * // Use a manual token (preserved across resubscribes, ignores accessToken callback)
   * client.realtime.setAuth('my-custom-jwt')
   *
   * // Switch back to using the accessToken callback
   * client.realtime.setAuth()
   */
  async setAuth(e = null) {
    this._authPromise = this._performAuth(e);
    try {
      await this._authPromise;
    } finally {
      this._authPromise = null;
    }
  }
  /**
   * Returns true if the current access token was explicitly set via setAuth(token),
   * false if it was obtained via the accessToken callback.
   * @internal
   */
  _isManualToken() {
    return this._manuallySetToken;
  }
  /**
   * Sends a heartbeat message if the socket is connected.
   */
  async sendHeartbeat() {
    var e;
    if (!this.isConnected()) {
      try {
        this.heartbeatCallback("disconnected");
      } catch (t) {
        this.log("error", "error in heartbeat callback", t);
      }
      return;
    }
    if (this.pendingHeartbeatRef) {
      this.pendingHeartbeatRef = null, this._heartbeatSentAt = null, this.log("transport", "heartbeat timeout. Attempting to re-establish connection");
      try {
        this.heartbeatCallback("timeout");
      } catch (t) {
        this.log("error", "error in heartbeat callback", t);
      }
      this._wasManualDisconnect = !1, (e = this.conn) === null || e === void 0 || e.close(pr, "heartbeat timeout"), setTimeout(() => {
        var t;
        this.isConnected() || (t = this.reconnectTimer) === null || t === void 0 || t.scheduleTimeout();
      }, Ae.HEARTBEAT_TIMEOUT_FALLBACK);
      return;
    }
    this._heartbeatSentAt = Date.now(), this.pendingHeartbeatRef = this._makeRef(), this.push({
      topic: "phoenix",
      event: "heartbeat",
      payload: {},
      ref: this.pendingHeartbeatRef
    });
    try {
      this.heartbeatCallback("sent");
    } catch (t) {
      this.log("error", "error in heartbeat callback", t);
    }
    this._setAuthSafely("heartbeat");
  }
  /**
   * Sets a callback that receives lifecycle events for internal heartbeat messages.
   * Useful for instrumenting connection health (e.g. sent/ok/timeout/disconnected).
   */
  onHeartbeat(e) {
    this.heartbeatCallback = e;
  }
  /**
   * Flushes send buffer
   */
  flushSendBuffer() {
    this.isConnected() && this.sendBuffer.length > 0 && (this.sendBuffer.forEach((e) => e()), this.sendBuffer = []);
  }
  /**
   * Return the next message ref, accounting for overflows
   *
   * @internal
   */
  _makeRef() {
    let e = this.ref + 1;
    return e === this.ref ? this.ref = 0 : this.ref = e, this.ref.toString();
  }
  /**
   * Unsubscribe from channels with the specified topic.
   *
   * @internal
   */
  _leaveOpenTopic(e) {
    let t = this.channels.find((s) => s.topic === e && (s._isJoined() || s._isJoining()));
    t && (this.log("transport", `leaving duplicate topic "${e}"`), t.unsubscribe());
  }
  /**
   * Removes a subscription from the socket.
   *
   * @param channel An open subscription.
   *
   * @internal
   */
  _remove(e) {
    this.channels = this.channels.filter((t) => t.topic !== e.topic);
  }
  /** @internal */
  _onConnMessage(e) {
    this.decode(e.data, (t) => {
      if (t.topic === "phoenix" && t.event === "phx_reply" && t.ref && t.ref === this.pendingHeartbeatRef) {
        const c = this._heartbeatSentAt ? Date.now() - this._heartbeatSentAt : void 0;
        try {
          this.heartbeatCallback(t.payload.status === "ok" ? "ok" : "error", c);
        } catch (u) {
          this.log("error", "error in heartbeat callback", u);
        }
        this._heartbeatSentAt = null, this.pendingHeartbeatRef = null;
      }
      const { topic: s, event: n, payload: i, ref: a } = t, o = a ? `(${a})` : "", l = i.status || "";
      this.log("receive", `${l} ${s} ${n} ${o}`.trim(), i), this.channels.filter((c) => c._isMember(s)).forEach((c) => c._trigger(n, i, a)), this._triggerStateCallbacks("message", t);
    });
  }
  /**
   * Clear specific timer
   * @internal
   */
  _clearTimer(e) {
    var t;
    e === "heartbeat" && this.heartbeatTimer ? (clearInterval(this.heartbeatTimer), this.heartbeatTimer = void 0) : e === "reconnect" && ((t = this.reconnectTimer) === null || t === void 0 || t.reset());
  }
  /**
   * Clear all timers
   * @internal
   */
  _clearAllTimers() {
    this._clearTimer("heartbeat"), this._clearTimer("reconnect");
  }
  /**
   * Setup connection handlers for WebSocket events
   * @internal
   */
  _setupConnectionHandlers() {
    this.conn && ("binaryType" in this.conn && (this.conn.binaryType = "arraybuffer"), this.conn.onopen = () => this._onConnOpen(), this.conn.onerror = (e) => this._onConnError(e), this.conn.onmessage = (e) => this._onConnMessage(e), this.conn.onclose = (e) => this._onConnClose(e), this.conn.readyState === K.open && this._onConnOpen());
  }
  /**
   * Teardown connection and cleanup resources
   * @internal
   */
  _teardownConnection() {
    if (this.conn) {
      if (this.conn.readyState === K.open || this.conn.readyState === K.connecting)
        try {
          this.conn.close();
        } catch (e) {
          this.log("error", "Error closing connection", e);
        }
      this.conn.onopen = null, this.conn.onerror = null, this.conn.onmessage = null, this.conn.onclose = null, this.conn = null;
    }
    this._clearAllTimers(), this._terminateWorker(), this.channels.forEach((e) => e.teardown());
  }
  /** @internal */
  _onConnOpen() {
    this._setConnectionState("connected"), this.log("transport", `connected to ${this.endpointURL()}`), (this._authPromise || (this.accessToken && !this.accessTokenValue ? this.setAuth() : Promise.resolve())).then(() => {
      this.accessTokenValue && (this.channels.forEach((t) => {
        t.updateJoinPayload({ access_token: this.accessTokenValue });
      }), this.sendBuffer = [], this.channels.forEach((t) => {
        t._isJoining() && (t.joinPush.sent = !1, t.joinPush.send());
      })), this.flushSendBuffer();
    }).catch((t) => {
      this.log("error", "error waiting for auth on connect", t), this.flushSendBuffer();
    }), this._clearTimer("reconnect"), this.worker ? this.workerRef || this._startWorkerHeartbeat() : this._startHeartbeat(), this._triggerStateCallbacks("open");
  }
  /** @internal */
  _startHeartbeat() {
    this.heartbeatTimer && clearInterval(this.heartbeatTimer), this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), this.heartbeatIntervalMs);
  }
  /** @internal */
  _startWorkerHeartbeat() {
    this.workerUrl ? this.log("worker", `starting worker for from ${this.workerUrl}`) : this.log("worker", "starting default worker");
    const e = this._workerObjectUrl(this.workerUrl);
    this.workerRef = new Worker(e), this.workerRef.onerror = (t) => {
      this.log("worker", "worker error", t.message), this._terminateWorker();
    }, this.workerRef.onmessage = (t) => {
      t.data.event === "keepAlive" && this.sendHeartbeat();
    }, this.workerRef.postMessage({
      event: "start",
      interval: this.heartbeatIntervalMs
    });
  }
  /**
   * Terminate the Web Worker and clear the reference
   * @internal
   */
  _terminateWorker() {
    this.workerRef && (this.log("worker", "terminating worker"), this.workerRef.terminate(), this.workerRef = void 0);
  }
  /** @internal */
  _onConnClose(e) {
    var t;
    this._setConnectionState("disconnected"), this.log("transport", "close", e), this._triggerChanError(), this._clearTimer("heartbeat"), this._wasManualDisconnect || (t = this.reconnectTimer) === null || t === void 0 || t.scheduleTimeout(), this._triggerStateCallbacks("close", e);
  }
  /** @internal */
  _onConnError(e) {
    this._setConnectionState("disconnected"), this.log("transport", `${e}`), this._triggerChanError(), this._triggerStateCallbacks("error", e);
    try {
      this.heartbeatCallback("error");
    } catch (t) {
      this.log("error", "error in heartbeat callback", t);
    }
  }
  /** @internal */
  _triggerChanError() {
    this.channels.forEach((e) => e._trigger(D.error));
  }
  /** @internal */
  _appendParams(e, t) {
    if (Object.keys(t).length === 0)
      return e;
    const s = e.match(/\?/) ? "&" : "?", n = new URLSearchParams(t);
    return `${e}${s}${n}`;
  }
  _workerObjectUrl(e) {
    let t;
    if (e)
      t = e;
    else {
      const s = new Blob([kr], { type: "application/javascript" });
      t = URL.createObjectURL(s);
    }
    return t;
  }
  /**
   * Set connection state with proper state management
   * @internal
   */
  _setConnectionState(e, t = !1) {
    this._connectionState = e, e === "connecting" ? this._wasManualDisconnect = !1 : e === "disconnecting" && (this._wasManualDisconnect = t);
  }
  /**
   * Perform the actual auth operation
   * @internal
   */
  async _performAuth(e = null) {
    let t, s = !1;
    if (e)
      t = e, s = !0;
    else if (this.accessToken)
      try {
        t = await this.accessToken();
      } catch (n) {
        this.log("error", "Error fetching access token from callback", n), t = this.accessTokenValue;
      }
    else
      t = this.accessTokenValue;
    s ? this._manuallySetToken = !0 : this.accessToken && (this._manuallySetToken = !1), this.accessTokenValue != t && (this.accessTokenValue = t, this.channels.forEach((n) => {
      const i = {
        access_token: t,
        version: dr
      };
      t && n.updateJoinPayload(i), n.joinedOnce && n._isJoined() && n._push(D.access_token, {
        access_token: t
      });
    }));
  }
  /**
   * Wait for any in-flight auth operations to complete
   * @internal
   */
  async _waitForAuthIfNeeded() {
    this._authPromise && await this._authPromise;
  }
  /**
   * Safely call setAuth with standardized error handling
   * @internal
   */
  _setAuthSafely(e = "general") {
    this._isManualToken() || this.setAuth().catch((t) => {
      this.log("error", `Error setting auth in ${e}`, t);
    });
  }
  /**
   * Trigger state change callbacks with proper error handling
   * @internal
   */
  _triggerStateCallbacks(e, t) {
    try {
      this.stateChangeCallbacks[e].forEach((s) => {
        try {
          s(t);
        } catch (n) {
          this.log("error", `error in ${e} callback`, n);
        }
      });
    } catch (s) {
      this.log("error", `error triggering ${e} callbacks`, s);
    }
  }
  /**
   * Setup reconnection timer with proper configuration
   * @internal
   */
  _setupReconnectionTimer() {
    this.reconnectTimer = new $t(async () => {
      setTimeout(async () => {
        await this._waitForAuthIfNeeded(), this.isConnected() || this.connect();
      }, Ae.RECONNECT_DELAY);
    }, this.reconnectAfterMs);
  }
  /**
   * Initialize client options with defaults
   * @internal
   */
  _initializeOptions(e) {
    var t, s, n, i, a, o, l, c, u, f, d, h;
    switch (this.transport = (t = e == null ? void 0 : e.transport) !== null && t !== void 0 ? t : null, this.timeout = (s = e == null ? void 0 : e.timeout) !== null && s !== void 0 ? s : He, this.heartbeatIntervalMs = (n = e == null ? void 0 : e.heartbeatIntervalMs) !== null && n !== void 0 ? n : Ae.HEARTBEAT_INTERVAL, this.worker = (i = e == null ? void 0 : e.worker) !== null && i !== void 0 ? i : !1, this.accessToken = (a = e == null ? void 0 : e.accessToken) !== null && a !== void 0 ? a : null, this.heartbeatCallback = (o = e == null ? void 0 : e.heartbeatCallback) !== null && o !== void 0 ? o : qe, this.vsn = (l = e == null ? void 0 : e.vsn) !== null && l !== void 0 ? l : ct, e != null && e.params && (this.params = e.params), e != null && e.logger && (this.logger = e.logger), (e != null && e.logLevel || e != null && e.log_level) && (this.logLevel = e.logLevel || e.log_level, this.params = Object.assign(Object.assign({}, this.params), { log_level: this.logLevel })), this.reconnectAfterMs = (c = e == null ? void 0 : e.reconnectAfterMs) !== null && c !== void 0 ? c : (p) => Tr[p - 1] || Sr, this.vsn) {
      case fr:
        this.encode = (u = e == null ? void 0 : e.encode) !== null && u !== void 0 ? u : (p, g) => g(JSON.stringify(p)), this.decode = (f = e == null ? void 0 : e.decode) !== null && f !== void 0 ? f : (p, g) => g(JSON.parse(p));
        break;
      case jt:
        this.encode = (d = e == null ? void 0 : e.encode) !== null && d !== void 0 ? d : this.serializer.encode.bind(this.serializer), this.decode = (h = e == null ? void 0 : e.decode) !== null && h !== void 0 ? h : this.serializer.decode.bind(this.serializer);
        break;
      default:
        throw new Error(`Unsupported serializer version: ${this.vsn}`);
    }
    if (this.worker) {
      if (typeof window < "u" && !window.Worker)
        throw new Error("Web Worker is not supported");
      this.workerUrl = e == null ? void 0 : e.workerUrl;
    }
  }
}
var ve = class extends Error {
  constructor(r, e) {
    var t;
    super(r), this.name = "IcebergError", this.status = e.status, this.icebergType = e.icebergType, this.icebergCode = e.icebergCode, this.details = e.details, this.isCommitStateUnknown = e.icebergType === "CommitStateUnknownException" || [500, 502, 504].includes(e.status) && ((t = e.icebergType) == null ? void 0 : t.includes("CommitState")) === !0;
  }
  /**
   * Returns true if the error is a 404 Not Found error.
   */
  isNotFound() {
    return this.status === 404;
  }
  /**
   * Returns true if the error is a 409 Conflict error.
   */
  isConflict() {
    return this.status === 409;
  }
  /**
   * Returns true if the error is a 419 Authentication Timeout error.
   */
  isAuthenticationTimeout() {
    return this.status === 419;
  }
};
function Ar(r, e, t) {
  const s = new URL(e, r);
  if (t)
    for (const [n, i] of Object.entries(t))
      i !== void 0 && s.searchParams.set(n, i);
  return s.toString();
}
async function Or(r) {
  return !r || r.type === "none" ? {} : r.type === "bearer" ? { Authorization: `Bearer ${r.token}` } : r.type === "header" ? { [r.name]: r.value } : r.type === "custom" ? await r.getHeaders() : {};
}
function Ir(r) {
  const e = r.fetchImpl ?? globalThis.fetch;
  return {
    async request({
      method: t,
      path: s,
      query: n,
      body: i,
      headers: a
    }) {
      const o = Ar(r.baseUrl, s, n), l = await Or(r.auth), c = await e(o, {
        method: t,
        headers: {
          ...i ? { "Content-Type": "application/json" } : {},
          ...l,
          ...a
        },
        body: i ? JSON.stringify(i) : void 0
      }), u = await c.text(), f = (c.headers.get("content-type") || "").includes("application/json"), d = f && u ? JSON.parse(u) : u;
      if (!c.ok) {
        const h = f ? d : void 0, p = h == null ? void 0 : h.error;
        throw new ve(
          (p == null ? void 0 : p.message) ?? `Request failed with status ${c.status}`,
          {
            status: c.status,
            icebergType: p == null ? void 0 : p.type,
            icebergCode: p == null ? void 0 : p.code,
            details: h
          }
        );
      }
      return { status: c.status, headers: c.headers, data: d };
    }
  };
}
function Oe(r) {
  return r.join("");
}
var Pr = class {
  constructor(r, e = "") {
    this.client = r, this.prefix = e;
  }
  async listNamespaces(r) {
    const e = r ? { parent: Oe(r.namespace) } : void 0;
    return (await this.client.request({
      method: "GET",
      path: `${this.prefix}/namespaces`,
      query: e
    })).data.namespaces.map((s) => ({ namespace: s }));
  }
  async createNamespace(r, e) {
    const t = {
      namespace: r.namespace,
      properties: e == null ? void 0 : e.properties
    };
    return (await this.client.request({
      method: "POST",
      path: `${this.prefix}/namespaces`,
      body: t
    })).data;
  }
  async dropNamespace(r) {
    await this.client.request({
      method: "DELETE",
      path: `${this.prefix}/namespaces/${Oe(r.namespace)}`
    });
  }
  async loadNamespaceMetadata(r) {
    return {
      properties: (await this.client.request({
        method: "GET",
        path: `${this.prefix}/namespaces/${Oe(r.namespace)}`
      })).data.properties
    };
  }
  async namespaceExists(r) {
    try {
      return await this.client.request({
        method: "HEAD",
        path: `${this.prefix}/namespaces/${Oe(r.namespace)}`
      }), !0;
    } catch (e) {
      if (e instanceof ve && e.status === 404)
        return !1;
      throw e;
    }
  }
  async createNamespaceIfNotExists(r, e) {
    try {
      return await this.createNamespace(r, e);
    } catch (t) {
      if (t instanceof ve && t.status === 409)
        return;
      throw t;
    }
  }
};
function ee(r) {
  return r.join("");
}
var Cr = class {
  constructor(r, e = "", t) {
    this.client = r, this.prefix = e, this.accessDelegation = t;
  }
  async listTables(r) {
    return (await this.client.request({
      method: "GET",
      path: `${this.prefix}/namespaces/${ee(r.namespace)}/tables`
    })).data.identifiers;
  }
  async createTable(r, e) {
    const t = {};
    return this.accessDelegation && (t["X-Iceberg-Access-Delegation"] = this.accessDelegation), (await this.client.request({
      method: "POST",
      path: `${this.prefix}/namespaces/${ee(r.namespace)}/tables`,
      body: e,
      headers: t
    })).data.metadata;
  }
  async updateTable(r, e) {
    const t = await this.client.request({
      method: "POST",
      path: `${this.prefix}/namespaces/${ee(r.namespace)}/tables/${r.name}`,
      body: e
    });
    return {
      "metadata-location": t.data["metadata-location"],
      metadata: t.data.metadata
    };
  }
  async dropTable(r, e) {
    await this.client.request({
      method: "DELETE",
      path: `${this.prefix}/namespaces/${ee(r.namespace)}/tables/${r.name}`,
      query: { purgeRequested: String((e == null ? void 0 : e.purge) ?? !1) }
    });
  }
  async loadTable(r) {
    const e = {};
    return this.accessDelegation && (e["X-Iceberg-Access-Delegation"] = this.accessDelegation), (await this.client.request({
      method: "GET",
      path: `${this.prefix}/namespaces/${ee(r.namespace)}/tables/${r.name}`,
      headers: e
    })).data.metadata;
  }
  async tableExists(r) {
    const e = {};
    this.accessDelegation && (e["X-Iceberg-Access-Delegation"] = this.accessDelegation);
    try {
      return await this.client.request({
        method: "HEAD",
        path: `${this.prefix}/namespaces/${ee(r.namespace)}/tables/${r.name}`,
        headers: e
      }), !0;
    } catch (t) {
      if (t instanceof ve && t.status === 404)
        return !1;
      throw t;
    }
  }
  async createTableIfNotExists(r, e) {
    try {
      return await this.createTable(r, e);
    } catch (t) {
      if (t instanceof ve && t.status === 409)
        return await this.loadTable({ namespace: r.namespace, name: e.name });
      throw t;
    }
  }
}, jr = class {
  /**
   * Creates a new Iceberg REST Catalog client.
   *
   * @param options - Configuration options for the catalog client
   */
  constructor(r) {
    var s;
    let e = "v1";
    r.catalogName && (e += `/${r.catalogName}`);
    const t = r.baseUrl.endsWith("/") ? r.baseUrl : `${r.baseUrl}/`;
    this.client = Ir({
      baseUrl: t,
      auth: r.auth,
      fetchImpl: r.fetch
    }), this.accessDelegation = (s = r.accessDelegation) == null ? void 0 : s.join(","), this.namespaceOps = new Pr(this.client, e), this.tableOps = new Cr(this.client, e, this.accessDelegation);
  }
  /**
   * Lists all namespaces in the catalog.
   *
   * @param parent - Optional parent namespace to list children under
   * @returns Array of namespace identifiers
   *
   * @example
   * ```typescript
   * // List all top-level namespaces
   * const namespaces = await catalog.listNamespaces();
   *
   * // List namespaces under a parent
   * const children = await catalog.listNamespaces({ namespace: ['analytics'] });
   * ```
   */
  async listNamespaces(r) {
    return this.namespaceOps.listNamespaces(r);
  }
  /**
   * Creates a new namespace in the catalog.
   *
   * @param id - Namespace identifier to create
   * @param metadata - Optional metadata properties for the namespace
   * @returns Response containing the created namespace and its properties
   *
   * @example
   * ```typescript
   * const response = await catalog.createNamespace(
   *   { namespace: ['analytics'] },
   *   { properties: { owner: 'data-team' } }
   * );
   * console.log(response.namespace); // ['analytics']
   * console.log(response.properties); // { owner: 'data-team', ... }
   * ```
   */
  async createNamespace(r, e) {
    return this.namespaceOps.createNamespace(r, e);
  }
  /**
   * Drops a namespace from the catalog.
   *
   * The namespace must be empty (contain no tables) before it can be dropped.
   *
   * @param id - Namespace identifier to drop
   *
   * @example
   * ```typescript
   * await catalog.dropNamespace({ namespace: ['analytics'] });
   * ```
   */
  async dropNamespace(r) {
    await this.namespaceOps.dropNamespace(r);
  }
  /**
   * Loads metadata for a namespace.
   *
   * @param id - Namespace identifier to load
   * @returns Namespace metadata including properties
   *
   * @example
   * ```typescript
   * const metadata = await catalog.loadNamespaceMetadata({ namespace: ['analytics'] });
   * console.log(metadata.properties);
   * ```
   */
  async loadNamespaceMetadata(r) {
    return this.namespaceOps.loadNamespaceMetadata(r);
  }
  /**
   * Lists all tables in a namespace.
   *
   * @param namespace - Namespace identifier to list tables from
   * @returns Array of table identifiers
   *
   * @example
   * ```typescript
   * const tables = await catalog.listTables({ namespace: ['analytics'] });
   * console.log(tables); // [{ namespace: ['analytics'], name: 'events' }, ...]
   * ```
   */
  async listTables(r) {
    return this.tableOps.listTables(r);
  }
  /**
   * Creates a new table in the catalog.
   *
   * @param namespace - Namespace to create the table in
   * @param request - Table creation request including name, schema, partition spec, etc.
   * @returns Table metadata for the created table
   *
   * @example
   * ```typescript
   * const metadata = await catalog.createTable(
   *   { namespace: ['analytics'] },
   *   {
   *     name: 'events',
   *     schema: {
   *       type: 'struct',
   *       fields: [
   *         { id: 1, name: 'id', type: 'long', required: true },
   *         { id: 2, name: 'timestamp', type: 'timestamp', required: true }
   *       ],
   *       'schema-id': 0
   *     },
   *     'partition-spec': {
   *       'spec-id': 0,
   *       fields: [
   *         { source_id: 2, field_id: 1000, name: 'ts_day', transform: 'day' }
   *       ]
   *     }
   *   }
   * );
   * ```
   */
  async createTable(r, e) {
    return this.tableOps.createTable(r, e);
  }
  /**
   * Updates an existing table's metadata.
   *
   * Can update the schema, partition spec, or properties of a table.
   *
   * @param id - Table identifier to update
   * @param request - Update request with fields to modify
   * @returns Response containing the metadata location and updated table metadata
   *
   * @example
   * ```typescript
   * const response = await catalog.updateTable(
   *   { namespace: ['analytics'], name: 'events' },
   *   {
   *     properties: { 'read.split.target-size': '134217728' }
   *   }
   * );
   * console.log(response['metadata-location']); // s3://...
   * console.log(response.metadata); // TableMetadata object
   * ```
   */
  async updateTable(r, e) {
    return this.tableOps.updateTable(r, e);
  }
  /**
   * Drops a table from the catalog.
   *
   * @param id - Table identifier to drop
   *
   * @example
   * ```typescript
   * await catalog.dropTable({ namespace: ['analytics'], name: 'events' });
   * ```
   */
  async dropTable(r, e) {
    await this.tableOps.dropTable(r, e);
  }
  /**
   * Loads metadata for a table.
   *
   * @param id - Table identifier to load
   * @returns Table metadata including schema, partition spec, location, etc.
   *
   * @example
   * ```typescript
   * const metadata = await catalog.loadTable({ namespace: ['analytics'], name: 'events' });
   * console.log(metadata.schema);
   * console.log(metadata.location);
   * ```
   */
  async loadTable(r) {
    return this.tableOps.loadTable(r);
  }
  /**
   * Checks if a namespace exists in the catalog.
   *
   * @param id - Namespace identifier to check
   * @returns True if the namespace exists, false otherwise
   *
   * @example
   * ```typescript
   * const exists = await catalog.namespaceExists({ namespace: ['analytics'] });
   * console.log(exists); // true or false
   * ```
   */
  async namespaceExists(r) {
    return this.namespaceOps.namespaceExists(r);
  }
  /**
   * Checks if a table exists in the catalog.
   *
   * @param id - Table identifier to check
   * @returns True if the table exists, false otherwise
   *
   * @example
   * ```typescript
   * const exists = await catalog.tableExists({ namespace: ['analytics'], name: 'events' });
   * console.log(exists); // true or false
   * ```
   */
  async tableExists(r) {
    return this.tableOps.tableExists(r);
  }
  /**
   * Creates a namespace if it does not exist.
   *
   * If the namespace already exists, returns void. If created, returns the response.
   *
   * @param id - Namespace identifier to create
   * @param metadata - Optional metadata properties for the namespace
   * @returns Response containing the created namespace and its properties, or void if it already exists
   *
   * @example
   * ```typescript
   * const response = await catalog.createNamespaceIfNotExists(
   *   { namespace: ['analytics'] },
   *   { properties: { owner: 'data-team' } }
   * );
   * if (response) {
   *   console.log('Created:', response.namespace);
   * } else {
   *   console.log('Already exists');
   * }
   * ```
   */
  async createNamespaceIfNotExists(r, e) {
    return this.namespaceOps.createNamespaceIfNotExists(r, e);
  }
  /**
   * Creates a table if it does not exist.
   *
   * If the table already exists, returns its metadata instead.
   *
   * @param namespace - Namespace to create the table in
   * @param request - Table creation request including name, schema, partition spec, etc.
   * @returns Table metadata for the created or existing table
   *
   * @example
   * ```typescript
   * const metadata = await catalog.createTableIfNotExists(
   *   { namespace: ['analytics'] },
   *   {
   *     name: 'events',
   *     schema: {
   *       type: 'struct',
   *       fields: [
   *         { id: 1, name: 'id', type: 'long', required: true },
   *         { id: 2, name: 'timestamp', type: 'timestamp', required: true }
   *       ],
   *       'schema-id': 0
   *     }
   *   }
   * );
   * ```
   */
  async createTableIfNotExists(r, e) {
    return this.tableOps.createTableIfNotExists(r, e);
  }
}, xe = class extends Error {
  constructor(r, e = "storage", t, s) {
    super(r), this.__isStorageError = !0, this.namespace = e, this.name = e === "vectors" ? "StorageVectorsError" : "StorageError", this.status = t, this.statusCode = s;
  }
};
function Le(r) {
  return typeof r == "object" && r !== null && "__isStorageError" in r;
}
var pe = class extends xe {
  constructor(r, e, t, s = "storage") {
    super(r, s, e, t), this.name = s === "vectors" ? "StorageVectorsApiError" : "StorageApiError", this.status = e, this.statusCode = t;
  }
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      statusCode: this.statusCode
    };
  }
}, xt = class extends xe {
  constructor(r, e, t = "storage") {
    super(r, t), this.name = t === "vectors" ? "StorageVectorsUnknownError" : "StorageUnknownError", this.originalError = e;
  }
};
const $r = (r) => r ? (...e) => r(...e) : (...e) => fetch(...e), Ur = (r) => {
  if (typeof r != "object" || r === null) return !1;
  const e = Object.getPrototypeOf(r);
  return (e === null || e === Object.prototype || Object.getPrototypeOf(e) === null) && !(Symbol.toStringTag in r) && !(Symbol.iterator in r);
}, Je = (r) => {
  if (Array.isArray(r)) return r.map((t) => Je(t));
  if (typeof r == "function" || r !== Object(r)) return r;
  const e = {};
  return Object.entries(r).forEach(([t, s]) => {
    const n = t.replace(/([-_][a-z])/gi, (i) => i.toUpperCase().replace(/[-_]/g, ""));
    e[n] = Je(s);
  }), e;
}, Nr = (r) => !r || typeof r != "string" || r.length === 0 || r.length > 100 || r.trim() !== r || r.includes("/") || r.includes("\\") ? !1 : /^[\w!.\*'() &$@=;:+,?-]+$/.test(r);
function we(r) {
  "@babel/helpers - typeof";
  return we = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
    return typeof e;
  } : function(e) {
    return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
  }, we(r);
}
function xr(r, e) {
  if (we(r) != "object" || !r) return r;
  var t = r[Symbol.toPrimitive];
  if (t !== void 0) {
    var s = t.call(r, e || "default");
    if (we(s) != "object") return s;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return (e === "string" ? String : Number)(r);
}
function Lr(r) {
  var e = xr(r, "string");
  return we(e) == "symbol" ? e : e + "";
}
function Dr(r, e, t) {
  return (e = Lr(e)) in r ? Object.defineProperty(r, e, {
    value: t,
    enumerable: !0,
    configurable: !0,
    writable: !0
  }) : r[e] = t, r;
}
function ft(r, e) {
  var t = Object.keys(r);
  if (Object.getOwnPropertySymbols) {
    var s = Object.getOwnPropertySymbols(r);
    e && (s = s.filter(function(n) {
      return Object.getOwnPropertyDescriptor(r, n).enumerable;
    })), t.push.apply(t, s);
  }
  return t;
}
function E(r) {
  for (var e = 1; e < arguments.length; e++) {
    var t = arguments[e] != null ? arguments[e] : {};
    e % 2 ? ft(Object(t), !0).forEach(function(s) {
      Dr(r, s, t[s]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(r, Object.getOwnPropertyDescriptors(t)) : ft(Object(t)).forEach(function(s) {
      Object.defineProperty(r, s, Object.getOwnPropertyDescriptor(t, s));
    });
  }
  return r;
}
const pt = (r) => {
  var e;
  return r.msg || r.message || r.error_description || (typeof r.error == "string" ? r.error : (e = r.error) === null || e === void 0 ? void 0 : e.message) || JSON.stringify(r);
}, Br = async (r, e, t, s) => {
  if (r && typeof r == "object" && "status" in r && "ok" in r && typeof r.status == "number") {
    const n = r, i = n.status || 500;
    if (typeof n.json == "function") n.json().then((a) => {
      const o = (a == null ? void 0 : a.statusCode) || (a == null ? void 0 : a.code) || i + "";
      e(new pe(pt(a), i, o, s));
    }).catch(() => {
      if (s === "vectors") {
        const a = i + "";
        e(new pe(n.statusText || `HTTP ${i} error`, i, a, s));
      } else {
        const a = i + "";
        e(new pe(n.statusText || `HTTP ${i} error`, i, a, s));
      }
    });
    else {
      const a = i + "";
      e(new pe(n.statusText || `HTTP ${i} error`, i, a, s));
    }
  } else e(new xt(pt(r), r, s));
}, qr = (r, e, t, s) => {
  const n = {
    method: r,
    headers: (e == null ? void 0 : e.headers) || {}
  };
  return r === "GET" || r === "HEAD" || !s ? E(E({}, n), t) : (Ur(s) ? (n.headers = E({ "Content-Type": "application/json" }, e == null ? void 0 : e.headers), n.body = JSON.stringify(s)) : n.body = s, e != null && e.duplex && (n.duplex = e.duplex), E(E({}, n), t));
};
async function fe(r, e, t, s, n, i, a) {
  return new Promise((o, l) => {
    r(t, qr(e, s, n, i)).then((c) => {
      if (!c.ok) throw c;
      if (s != null && s.noResolveJson) return c;
      if (a === "vectors") {
        const u = c.headers.get("content-type");
        if (c.headers.get("content-length") === "0" || c.status === 204) return {};
        if (!u || !u.includes("application/json")) return {};
      }
      return c.json();
    }).then((c) => o(c)).catch((c) => Br(c, l, s, a));
  });
}
function Lt(r = "storage") {
  return {
    get: async (e, t, s, n) => fe(e, "GET", t, s, n, void 0, r),
    post: async (e, t, s, n, i) => fe(e, "POST", t, n, i, s, r),
    put: async (e, t, s, n, i) => fe(e, "PUT", t, n, i, s, r),
    head: async (e, t, s, n) => fe(e, "HEAD", t, E(E({}, s), {}, { noResolveJson: !0 }), n, void 0, r),
    remove: async (e, t, s, n, i) => fe(e, "DELETE", t, n, i, s, r)
  };
}
const Mr = Lt("storage"), { get: be, post: L, put: Ye, head: Fr, remove: nt } = Mr, N = Lt("vectors");
var de = class {
  /**
  * Creates a new BaseApiClient instance
  * @param url - Base URL for API requests
  * @param headers - Default headers for API requests
  * @param fetch - Optional custom fetch implementation
  * @param namespace - Error namespace ('storage' or 'vectors')
  */
  constructor(r, e = {}, t, s = "storage") {
    this.shouldThrowOnError = !1, this.url = r, this.headers = e, this.fetch = $r(t), this.namespace = s;
  }
  /**
  * Enable throwing errors instead of returning them.
  * When enabled, errors are thrown instead of returned in { data, error } format.
  *
  * @returns this - For method chaining
  */
  throwOnError() {
    return this.shouldThrowOnError = !0, this;
  }
  /**
  * Set an HTTP header for the request.
  * Creates a shallow copy of headers to avoid mutating shared state.
  *
  * @param name - Header name
  * @param value - Header value
  * @returns this - For method chaining
  */
  setHeader(r, e) {
    return this.headers = E(E({}, this.headers), {}, { [r]: e }), this;
  }
  /**
  * Handles API operation with standardized error handling
  * Eliminates repetitive try-catch blocks across all API methods
  *
  * This wrapper:
  * 1. Executes the operation
  * 2. Returns { data, error: null } on success
  * 3. Returns { data: null, error } on failure (if shouldThrowOnError is false)
  * 4. Throws error on failure (if shouldThrowOnError is true)
  *
  * @typeParam T - The expected data type from the operation
  * @param operation - Async function that performs the API call
  * @returns Promise with { data, error } tuple
  *
  * @example
  * ```typescript
  * async listBuckets() {
  *   return this.handleOperation(async () => {
  *     return await get(this.fetch, `${this.url}/bucket`, {
  *       headers: this.headers,
  *     })
  *   })
  * }
  * ```
  */
  async handleOperation(r) {
    var e = this;
    try {
      return {
        data: await r(),
        error: null
      };
    } catch (t) {
      if (e.shouldThrowOnError) throw t;
      if (Le(t)) return {
        data: null,
        error: t
      };
      throw t;
    }
  }
}, Wr = class {
  constructor(r, e) {
    this.downloadFn = r, this.shouldThrowOnError = e;
  }
  then(r, e) {
    return this.execute().then(r, e);
  }
  async execute() {
    var r = this;
    try {
      return {
        data: (await r.downloadFn()).body,
        error: null
      };
    } catch (e) {
      if (r.shouldThrowOnError) throw e;
      if (Le(e)) return {
        data: null,
        error: e
      };
      throw e;
    }
  }
};
let Dt;
Dt = Symbol.toStringTag;
var Kr = class {
  constructor(r, e) {
    this.downloadFn = r, this.shouldThrowOnError = e, this[Dt] = "BlobDownloadBuilder", this.promise = null;
  }
  asStream() {
    return new Wr(this.downloadFn, this.shouldThrowOnError);
  }
  then(r, e) {
    return this.getPromise().then(r, e);
  }
  catch(r) {
    return this.getPromise().catch(r);
  }
  finally(r) {
    return this.getPromise().finally(r);
  }
  getPromise() {
    return this.promise || (this.promise = this.execute()), this.promise;
  }
  async execute() {
    var r = this;
    try {
      return {
        data: await (await r.downloadFn()).blob(),
        error: null
      };
    } catch (e) {
      if (r.shouldThrowOnError) throw e;
      if (Le(e)) return {
        data: null,
        error: e
      };
      throw e;
    }
  }
};
const Vr = {
  limit: 100,
  offset: 0,
  sortBy: {
    column: "name",
    order: "asc"
  }
}, gt = {
  cacheControl: "3600",
  contentType: "text/plain;charset=UTF-8",
  upsert: !1
};
var Gr = class extends de {
  constructor(r, e = {}, t, s) {
    super(r, e, s, "storage"), this.bucketId = t;
  }
  /**
  * Uploads a file to an existing bucket or replaces an existing file at the specified path with a new one.
  *
  * @param method HTTP method.
  * @param path The relative file path. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to upload.
  * @param fileBody The body of the file to be stored in the bucket.
  */
  async uploadOrUpdate(r, e, t, s) {
    var n = this;
    return n.handleOperation(async () => {
      let i;
      const a = E(E({}, gt), s);
      let o = E(E({}, n.headers), r === "POST" && { "x-upsert": String(a.upsert) });
      const l = a.metadata;
      typeof Blob < "u" && t instanceof Blob ? (i = new FormData(), i.append("cacheControl", a.cacheControl), l && i.append("metadata", n.encodeMetadata(l)), i.append("", t)) : typeof FormData < "u" && t instanceof FormData ? (i = t, i.has("cacheControl") || i.append("cacheControl", a.cacheControl), l && !i.has("metadata") && i.append("metadata", n.encodeMetadata(l))) : (i = t, o["cache-control"] = `max-age=${a.cacheControl}`, o["content-type"] = a.contentType, l && (o["x-metadata"] = n.toBase64(n.encodeMetadata(l))), (typeof ReadableStream < "u" && i instanceof ReadableStream || i && typeof i == "object" && "pipe" in i && typeof i.pipe == "function") && !a.duplex && (a.duplex = "half")), s != null && s.headers && (o = E(E({}, o), s.headers));
      const c = n._removeEmptyFolders(e), u = n._getFinalPath(c), f = await (r == "PUT" ? Ye : L)(n.fetch, `${n.url}/object/${u}`, i, E({ headers: o }, a != null && a.duplex ? { duplex: a.duplex } : {}));
      return {
        path: c,
        id: f.Id,
        fullPath: f.Key
      };
    });
  }
  /**
  * Uploads a file to an existing bucket.
  *
  * @category File Buckets
  * @param path The file path, including the file name. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to upload.
  * @param fileBody The body of the file to be stored in the bucket.
  * @param fileOptions Optional file upload options including cacheControl, contentType, upsert, and metadata.
  * @returns Promise with response containing file path, id, and fullPath or error
  *
  * @example Upload file
  * ```js
  * const avatarFile = event.target.files[0]
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .upload('public/avatar1.png', avatarFile, {
  *     cacheControl: '3600',
  *     upsert: false
  *   })
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "path": "public/avatar1.png",
  *     "fullPath": "avatars/public/avatar1.png"
  *   },
  *   "error": null
  * }
  * ```
  *
  * @example Upload file using `ArrayBuffer` from base64 file data
  * ```js
  * import { decode } from 'base64-arraybuffer'
  *
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .upload('public/avatar1.png', decode('base64FileData'), {
  *     contentType: 'image/png'
  *   })
  * ```
  */
  async upload(r, e, t) {
    return this.uploadOrUpdate("POST", r, e, t);
  }
  /**
  * Upload a file with a token generated from `createSignedUploadUrl`.
  *
  * @category File Buckets
  * @param path The file path, including the file name. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to upload.
  * @param token The token generated from `createSignedUploadUrl`
  * @param fileBody The body of the file to be stored in the bucket.
  * @param fileOptions HTTP headers (cacheControl, contentType, etc.).
  * **Note:** The `upsert` option has no effect here. To enable upsert behavior,
  * pass `{ upsert: true }` when calling `createSignedUploadUrl()` instead.
  * @returns Promise with response containing file path and fullPath or error
  *
  * @example Upload to a signed URL
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .uploadToSignedUrl('folder/cat.jpg', 'token-from-createSignedUploadUrl', file)
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "path": "folder/cat.jpg",
  *     "fullPath": "avatars/folder/cat.jpg"
  *   },
  *   "error": null
  * }
  * ```
  */
  async uploadToSignedUrl(r, e, t, s) {
    var n = this;
    const i = n._removeEmptyFolders(r), a = n._getFinalPath(i), o = new URL(n.url + `/object/upload/sign/${a}`);
    return o.searchParams.set("token", e), n.handleOperation(async () => {
      let l;
      const c = E({ upsert: gt.upsert }, s), u = E(E({}, n.headers), { "x-upsert": String(c.upsert) });
      return typeof Blob < "u" && t instanceof Blob ? (l = new FormData(), l.append("cacheControl", c.cacheControl), l.append("", t)) : typeof FormData < "u" && t instanceof FormData ? (l = t, l.append("cacheControl", c.cacheControl)) : (l = t, u["cache-control"] = `max-age=${c.cacheControl}`, u["content-type"] = c.contentType), {
        path: i,
        fullPath: (await Ye(n.fetch, o.toString(), l, { headers: u })).Key
      };
    });
  }
  /**
  * Creates a signed upload URL.
  * Signed upload URLs can be used to upload files to the bucket without further authentication.
  * They are valid for 2 hours.
  *
  * @category File Buckets
  * @param path The file path, including the current file name. For example `folder/image.png`.
  * @param options.upsert If set to true, allows the file to be overwritten if it already exists.
  * @returns Promise with response containing signed upload URL, token, and path or error
  *
  * @example Create Signed Upload URL
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .createSignedUploadUrl('folder/cat.jpg')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "signedUrl": "https://example.supabase.co/storage/v1/object/upload/sign/avatars/folder/cat.jpg?token=<TOKEN>",
  *     "path": "folder/cat.jpg",
  *     "token": "<TOKEN>"
  *   },
  *   "error": null
  * }
  * ```
  */
  async createSignedUploadUrl(r, e) {
    var t = this;
    return t.handleOperation(async () => {
      let s = t._getFinalPath(r);
      const n = E({}, t.headers);
      e != null && e.upsert && (n["x-upsert"] = "true");
      const i = await L(t.fetch, `${t.url}/object/upload/sign/${s}`, {}, { headers: n }), a = new URL(t.url + i.url), o = a.searchParams.get("token");
      if (!o) throw new xe("No token returned by API");
      return {
        signedUrl: a.toString(),
        path: r,
        token: o
      };
    });
  }
  /**
  * Replaces an existing file at the specified path with a new one.
  *
  * @category File Buckets
  * @param path The relative file path. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to update.
  * @param fileBody The body of the file to be stored in the bucket.
  * @param fileOptions Optional file upload options including cacheControl, contentType, upsert, and metadata.
  * @returns Promise with response containing file path, id, and fullPath or error
  *
  * @example Update file
  * ```js
  * const avatarFile = event.target.files[0]
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .update('public/avatar1.png', avatarFile, {
  *     cacheControl: '3600',
  *     upsert: true
  *   })
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "path": "public/avatar1.png",
  *     "fullPath": "avatars/public/avatar1.png"
  *   },
  *   "error": null
  * }
  * ```
  *
  * @example Update file using `ArrayBuffer` from base64 file data
  * ```js
  * import {decode} from 'base64-arraybuffer'
  *
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .update('public/avatar1.png', decode('base64FileData'), {
  *     contentType: 'image/png'
  *   })
  * ```
  */
  async update(r, e, t) {
    return this.uploadOrUpdate("PUT", r, e, t);
  }
  /**
  * Moves an existing file to a new path in the same bucket.
  *
  * @category File Buckets
  * @param fromPath The original file path, including the current file name. For example `folder/image.png`.
  * @param toPath The new file path, including the new file name. For example `folder/image-new.png`.
  * @param options The destination options.
  * @returns Promise with response containing success message or error
  *
  * @example Move file
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .move('public/avatar1.png', 'private/avatar2.png')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "message": "Successfully moved"
  *   },
  *   "error": null
  * }
  * ```
  */
  async move(r, e, t) {
    var s = this;
    return s.handleOperation(async () => await L(s.fetch, `${s.url}/object/move`, {
      bucketId: s.bucketId,
      sourceKey: r,
      destinationKey: e,
      destinationBucket: t == null ? void 0 : t.destinationBucket
    }, { headers: s.headers }));
  }
  /**
  * Copies an existing file to a new path in the same bucket.
  *
  * @category File Buckets
  * @param fromPath The original file path, including the current file name. For example `folder/image.png`.
  * @param toPath The new file path, including the new file name. For example `folder/image-copy.png`.
  * @param options The destination options.
  * @returns Promise with response containing copied file path or error
  *
  * @example Copy file
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .copy('public/avatar1.png', 'private/avatar2.png')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "path": "avatars/private/avatar2.png"
  *   },
  *   "error": null
  * }
  * ```
  */
  async copy(r, e, t) {
    var s = this;
    return s.handleOperation(async () => ({ path: (await L(s.fetch, `${s.url}/object/copy`, {
      bucketId: s.bucketId,
      sourceKey: r,
      destinationKey: e,
      destinationBucket: t == null ? void 0 : t.destinationBucket
    }, { headers: s.headers })).Key }));
  }
  /**
  * Creates a signed URL. Use a signed URL to share a file for a fixed amount of time.
  *
  * @category File Buckets
  * @param path The file path, including the current file name. For example `folder/image.png`.
  * @param expiresIn The number of seconds until the signed URL expires. For example, `60` for a URL which is valid for one minute.
  * @param options.download triggers the file as a download if set to true. Set this parameter as the name of the file if you want to trigger the download with a different filename.
  * @param options.transform Transform the asset before serving it to the client.
  * @returns Promise with response containing signed URL or error
  *
  * @example Create Signed URL
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .createSignedUrl('folder/avatar1.png', 60)
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "signedUrl": "https://example.supabase.co/storage/v1/object/sign/avatars/folder/avatar1.png?token=<TOKEN>"
  *   },
  *   "error": null
  * }
  * ```
  *
  * @example Create a signed URL for an asset with transformations
  * ```js
  * const { data } = await supabase
  *   .storage
  *   .from('avatars')
  *   .createSignedUrl('folder/avatar1.png', 60, {
  *     transform: {
  *       width: 100,
  *       height: 100,
  *     }
  *   })
  * ```
  *
  * @example Create a signed URL which triggers the download of the asset
  * ```js
  * const { data } = await supabase
  *   .storage
  *   .from('avatars')
  *   .createSignedUrl('folder/avatar1.png', 60, {
  *     download: true,
  *   })
  * ```
  */
  async createSignedUrl(r, e, t) {
    var s = this;
    return s.handleOperation(async () => {
      let n = s._getFinalPath(r);
      const i = typeof (t == null ? void 0 : t.transform) == "object" && t.transform !== null && Object.keys(t.transform).length > 0;
      let a = await L(s.fetch, `${s.url}/object/sign/${n}`, E({ expiresIn: e }, i ? { transform: t.transform } : {}), { headers: s.headers });
      const o = t != null && t.download ? `&download=${t.download === !0 ? "" : t.download}` : "", l = i && a.signedURL.includes("/object/sign/") ? a.signedURL.replace("/object/sign/", "/render/image/sign/") : a.signedURL;
      return { signedUrl: encodeURI(`${s.url}${l}${o}`) };
    });
  }
  /**
  * Creates multiple signed URLs. Use a signed URL to share a file for a fixed amount of time.
  *
  * @category File Buckets
  * @param paths The file paths to be downloaded, including the current file names. For example `['folder/image.png', 'folder2/image2.png']`.
  * @param expiresIn The number of seconds until the signed URLs expire. For example, `60` for URLs which are valid for one minute.
  * @param options.download triggers the file as a download if set to true. Set this parameter as the name of the file if you want to trigger the download with a different filename.
  * @returns Promise with response containing array of objects with signedUrl, path, and error or error
  *
  * @example Create Signed URLs
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .createSignedUrls(['folder/avatar1.png', 'folder/avatar2.png'], 60)
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": [
  *     {
  *       "error": null,
  *       "path": "folder/avatar1.png",
  *       "signedURL": "/object/sign/avatars/folder/avatar1.png?token=<TOKEN>",
  *       "signedUrl": "https://example.supabase.co/storage/v1/object/sign/avatars/folder/avatar1.png?token=<TOKEN>"
  *     },
  *     {
  *       "error": null,
  *       "path": "folder/avatar2.png",
  *       "signedURL": "/object/sign/avatars/folder/avatar2.png?token=<TOKEN>",
  *       "signedUrl": "https://example.supabase.co/storage/v1/object/sign/avatars/folder/avatar2.png?token=<TOKEN>"
  *     }
  *   ],
  *   "error": null
  * }
  * ```
  */
  async createSignedUrls(r, e, t) {
    var s = this;
    return s.handleOperation(async () => {
      const n = await L(s.fetch, `${s.url}/object/sign/${s.bucketId}`, {
        expiresIn: e,
        paths: r
      }, { headers: s.headers }), i = t != null && t.download ? `&download=${t.download === !0 ? "" : t.download}` : "";
      return n.map((a) => E(E({}, a), {}, { signedUrl: a.signedURL ? encodeURI(`${s.url}${a.signedURL}${i}`) : null }));
    });
  }
  /**
  * Downloads a file from a private bucket. For public buckets, make a request to the URL returned from `getPublicUrl` instead.
  *
  * @category File Buckets
  * @param path The full path and file name of the file to be downloaded. For example `folder/image.png`.
  * @param options.transform Transform the asset before serving it to the client.
  * @param parameters Additional fetch parameters like signal for cancellation. Supports standard fetch options including cache control.
  * @returns BlobDownloadBuilder instance for downloading the file
  *
  * @example Download file
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .download('folder/avatar1.png')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": <BLOB>,
  *   "error": null
  * }
  * ```
  *
  * @example Download file with transformations
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .download('folder/avatar1.png', {
  *     transform: {
  *       width: 100,
  *       height: 100,
  *       quality: 80
  *     }
  *   })
  * ```
  *
  * @example Download with cache control (useful in Edge Functions)
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .download('folder/avatar1.png', {}, { cache: 'no-store' })
  * ```
  *
  * @example Download with abort signal
  * ```js
  * const controller = new AbortController()
  * setTimeout(() => controller.abort(), 5000)
  *
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .download('folder/avatar1.png', {}, { signal: controller.signal })
  * ```
  */
  download(r, e, t) {
    const s = typeof (e == null ? void 0 : e.transform) < "u" ? "render/image/authenticated" : "object", n = this.transformOptsToQueryString((e == null ? void 0 : e.transform) || {}), i = n ? `?${n}` : "", a = this._getFinalPath(r), o = () => be(this.fetch, `${this.url}/${s}/${a}${i}`, {
      headers: this.headers,
      noResolveJson: !0
    }, t);
    return new Kr(o, this.shouldThrowOnError);
  }
  /**
  * Retrieves the details of an existing file.
  *
  * Returns detailed file metadata including size, content type, and timestamps.
  * Note: The API returns `last_modified` field, not `updated_at`.
  *
  * @category File Buckets
  * @param path The file path, including the file name. For example `folder/image.png`.
  * @returns Promise with response containing file metadata or error
  *
  * @example Get file info
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .info('folder/avatar1.png')
  *
  * if (data) {
  *   console.log('Last modified:', data.lastModified)
  *   console.log('Size:', data.size)
  * }
  * ```
  */
  async info(r) {
    var e = this;
    const t = e._getFinalPath(r);
    return e.handleOperation(async () => Je(await be(e.fetch, `${e.url}/object/info/${t}`, { headers: e.headers })));
  }
  /**
  * Checks the existence of a file.
  *
  * @category File Buckets
  * @param path The file path, including the file name. For example `folder/image.png`.
  * @returns Promise with response containing boolean indicating file existence or error
  *
  * @example Check file existence
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .exists('folder/avatar1.png')
  * ```
  */
  async exists(r) {
    var e = this;
    const t = e._getFinalPath(r);
    try {
      return await Fr(e.fetch, `${e.url}/object/${t}`, { headers: e.headers }), {
        data: !0,
        error: null
      };
    } catch (n) {
      if (e.shouldThrowOnError) throw n;
      if (Le(n)) {
        var s;
        const i = n instanceof pe ? n.status : n instanceof xt ? (s = n.originalError) === null || s === void 0 ? void 0 : s.status : void 0;
        if (i !== void 0 && [400, 404].includes(i)) return {
          data: !1,
          error: n
        };
      }
      throw n;
    }
  }
  /**
  * A simple convenience function to get the URL for an asset in a public bucket. If you do not want to use this function, you can construct the public URL by concatenating the bucket URL with the path to the asset.
  * This function does not verify if the bucket is public. If a public URL is created for a bucket which is not public, you will not be able to download the asset.
  *
  * @category File Buckets
  * @param path The path and name of the file to generate the public URL for. For example `folder/image.png`.
  * @param options.download Triggers the file as a download if set to true. Set this parameter as the name of the file if you want to trigger the download with a different filename.
  * @param options.transform Transform the asset before serving it to the client.
  * @returns Object with public URL
  *
  * @example Returns the URL for an asset in a public bucket
  * ```js
  * const { data } = supabase
  *   .storage
  *   .from('public-bucket')
  *   .getPublicUrl('folder/avatar1.png')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "publicUrl": "https://example.supabase.co/storage/v1/object/public/public-bucket/folder/avatar1.png"
  *   }
  * }
  * ```
  *
  * @example Returns the URL for an asset in a public bucket with transformations
  * ```js
  * const { data } = supabase
  *   .storage
  *   .from('public-bucket')
  *   .getPublicUrl('folder/avatar1.png', {
  *     transform: {
  *       width: 100,
  *       height: 100,
  *     }
  *   })
  * ```
  *
  * @example Returns the URL which triggers the download of an asset in a public bucket
  * ```js
  * const { data } = supabase
  *   .storage
  *   .from('public-bucket')
  *   .getPublicUrl('folder/avatar1.png', {
  *     download: true,
  *   })
  * ```
  */
  getPublicUrl(r, e) {
    const t = this._getFinalPath(r), s = [], n = e != null && e.download ? `download=${e.download === !0 ? "" : e.download}` : "";
    n !== "" && s.push(n);
    const i = typeof (e == null ? void 0 : e.transform) < "u" ? "render/image" : "object", a = this.transformOptsToQueryString((e == null ? void 0 : e.transform) || {});
    a !== "" && s.push(a);
    let o = s.join("&");
    return o !== "" && (o = `?${o}`), { data: { publicUrl: encodeURI(`${this.url}/${i}/public/${t}${o}`) } };
  }
  /**
  * Deletes files within the same bucket
  *
  * Returns an array of FileObject entries for the deleted files. Note that deprecated
  * fields like `bucket_id` may or may not be present in the response - do not rely on them.
  *
  * @category File Buckets
  * @param paths An array of files to delete, including the path and file name. For example [`'folder/image.png'`].
  * @returns Promise with response containing array of deleted file objects or error
  *
  * @example Delete file
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .remove(['folder/avatar1.png'])
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": [],
  *   "error": null
  * }
  * ```
  */
  async remove(r) {
    var e = this;
    return e.handleOperation(async () => await nt(e.fetch, `${e.url}/object/${e.bucketId}`, { prefixes: r }, { headers: e.headers }));
  }
  /**
  * Get file metadata
  * @param id the file id to retrieve metadata
  */
  /**
  * Update file metadata
  * @param id the file id to update metadata
  * @param meta the new file metadata
  */
  /**
  * Lists all the files and folders within a path of the bucket.
  *
  * **Important:** For folder entries, fields like `id`, `updated_at`, `created_at`,
  * `last_accessed_at`, and `metadata` will be `null`. Only files have these fields populated.
  * Additionally, deprecated fields like `bucket_id`, `owner`, and `buckets` are NOT returned
  * by this method.
  *
  * @category File Buckets
  * @param path The folder path.
  * @param options Search options including limit (defaults to 100), offset, sortBy, and search
  * @param parameters Optional fetch parameters including signal for cancellation
  * @returns Promise with response containing array of files/folders or error
  *
  * @example List files in a bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .list('folder', {
  *     limit: 100,
  *     offset: 0,
  *     sortBy: { column: 'name', order: 'asc' },
  *   })
  *
  * // Handle files vs folders
  * data?.forEach(item => {
  *   if (item.id !== null) {
  *     // It's a file
  *     console.log('File:', item.name, 'Size:', item.metadata?.size)
  *   } else {
  *     // It's a folder
  *     console.log('Folder:', item.name)
  *   }
  * })
  * ```
  *
  * Response (file entry):
  * ```json
  * {
  *   "data": [
  *     {
  *       "name": "avatar1.png",
  *       "id": "e668cf7f-821b-4a2f-9dce-7dfa5dd1cfd2",
  *       "updated_at": "2024-05-22T23:06:05.580Z",
  *       "created_at": "2024-05-22T23:04:34.443Z",
  *       "last_accessed_at": "2024-05-22T23:04:34.443Z",
  *       "metadata": {
  *         "eTag": "\"c5e8c553235d9af30ef4f6e280790b92\"",
  *         "size": 32175,
  *         "mimetype": "image/png",
  *         "cacheControl": "max-age=3600",
  *         "lastModified": "2024-05-22T23:06:05.574Z",
  *         "contentLength": 32175,
  *         "httpStatusCode": 200
  *       }
  *     }
  *   ],
  *   "error": null
  * }
  * ```
  *
  * @example Search files in a bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .list('folder', {
  *     limit: 100,
  *     offset: 0,
  *     sortBy: { column: 'name', order: 'asc' },
  *     search: 'jon'
  *   })
  * ```
  */
  async list(r, e, t) {
    var s = this;
    return s.handleOperation(async () => {
      const n = E(E(E({}, Vr), e), {}, { prefix: r || "" });
      return await L(s.fetch, `${s.url}/object/list/${s.bucketId}`, n, { headers: s.headers }, t);
    });
  }
  /**
  * Lists all the files and folders within a bucket using the V2 API with pagination support.
  *
  * **Important:** Folder entries in the `folders` array only contain `name` and optionally `key` —
  * they have no `id`, timestamps, or `metadata` fields. Full file metadata is only available
  * on entries in the `objects` array.
  *
  * @experimental this method signature might change in the future
  *
  * @category File Buckets
  * @param options Search options including prefix, cursor for pagination, limit, with_delimiter
  * @param parameters Optional fetch parameters including signal for cancellation
  * @returns Promise with response containing folders/objects arrays with pagination info or error
  *
  * @example List files with pagination
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .from('avatars')
  *   .listV2({
  *     prefix: 'folder/',
  *     limit: 100,
  *   })
  *
  * // Handle pagination
  * if (data?.hasNext) {
  *   const nextPage = await supabase
  *     .storage
  *     .from('avatars')
  *     .listV2({
  *       prefix: 'folder/',
  *       cursor: data.nextCursor,
  *     })
  * }
  *
  * // Handle files vs folders
  * data?.objects.forEach(file => {
  *   if (file.id !== null) {
  *     console.log('File:', file.name, 'Size:', file.metadata?.size)
  *   }
  * })
  * data?.folders.forEach(folder => {
  *   console.log('Folder:', folder.name)
  * })
  * ```
  */
  async listV2(r, e) {
    var t = this;
    return t.handleOperation(async () => {
      const s = E({}, r);
      return await L(t.fetch, `${t.url}/object/list-v2/${t.bucketId}`, s, { headers: t.headers }, e);
    });
  }
  encodeMetadata(r) {
    return JSON.stringify(r);
  }
  toBase64(r) {
    return typeof Buffer < "u" ? Buffer.from(r).toString("base64") : btoa(r);
  }
  _getFinalPath(r) {
    return `${this.bucketId}/${r.replace(/^\/+/, "")}`;
  }
  _removeEmptyFolders(r) {
    return r.replace(/^\/|\/$/g, "").replace(/\/+/g, "/");
  }
  transformOptsToQueryString(r) {
    const e = [];
    return r.width && e.push(`width=${r.width}`), r.height && e.push(`height=${r.height}`), r.resize && e.push(`resize=${r.resize}`), r.format && e.push(`format=${r.format}`), r.quality && e.push(`quality=${r.quality}`), e.join("&");
  }
};
const Hr = "2.99.2", ke = { "X-Client-Info": `storage-js/${Hr}` };
var Xr = class extends de {
  constructor(r, e = {}, t, s) {
    const n = new URL(r);
    s != null && s.useNewHostname && /supabase\.(co|in|red)$/.test(n.hostname) && !n.hostname.includes("storage.supabase.") && (n.hostname = n.hostname.replace("supabase.", "storage.supabase."));
    const i = n.href.replace(/\/$/, ""), a = E(E({}, ke), e);
    super(i, a, t, "storage");
  }
  /**
  * Retrieves the details of all Storage buckets within an existing project.
  *
  * @category File Buckets
  * @param options Query parameters for listing buckets
  * @param options.limit Maximum number of buckets to return
  * @param options.offset Number of buckets to skip
  * @param options.sortColumn Column to sort by ('id', 'name', 'created_at', 'updated_at')
  * @param options.sortOrder Sort order ('asc' or 'desc')
  * @param options.search Search term to filter bucket names
  * @returns Promise with response containing array of buckets or error
  *
  * @example List buckets
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .listBuckets()
  * ```
  *
  * @example List buckets with options
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .listBuckets({
  *     limit: 10,
  *     offset: 0,
  *     sortColumn: 'created_at',
  *     sortOrder: 'desc',
  *     search: 'prod'
  *   })
  * ```
  */
  async listBuckets(r) {
    var e = this;
    return e.handleOperation(async () => {
      const t = e.listBucketOptionsToQueryString(r);
      return await be(e.fetch, `${e.url}/bucket${t}`, { headers: e.headers });
    });
  }
  /**
  * Retrieves the details of an existing Storage bucket.
  *
  * @category File Buckets
  * @param id The unique identifier of the bucket you would like to retrieve.
  * @returns Promise with response containing bucket details or error
  *
  * @example Get bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .getBucket('avatars')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "id": "avatars",
  *     "name": "avatars",
  *     "owner": "",
  *     "public": false,
  *     "file_size_limit": 1024,
  *     "allowed_mime_types": [
  *       "image/png"
  *     ],
  *     "created_at": "2024-05-22T22:26:05.100Z",
  *     "updated_at": "2024-05-22T22:26:05.100Z"
  *   },
  *   "error": null
  * }
  * ```
  */
  async getBucket(r) {
    var e = this;
    return e.handleOperation(async () => await be(e.fetch, `${e.url}/bucket/${r}`, { headers: e.headers }));
  }
  /**
  * Creates a new Storage bucket
  *
  * @category File Buckets
  * @param id A unique identifier for the bucket you are creating.
  * @param options.public The visibility of the bucket. Public buckets don't require an authorization token to download objects, but still require a valid token for all other operations. By default, buckets are private.
  * @param options.fileSizeLimit specifies the max file size in bytes that can be uploaded to this bucket.
  * The global file size limit takes precedence over this value.
  * The default value is null, which doesn't set a per bucket file size limit.
  * @param options.allowedMimeTypes specifies the allowed mime types that this bucket can accept during upload.
  * The default value is null, which allows files with all mime types to be uploaded.
  * Each mime type specified can be a wildcard, e.g. image/*, or a specific mime type, e.g. image/png.
  * @param options.type (private-beta) specifies the bucket type. see `BucketType` for more details.
  *   - default bucket type is `STANDARD`
  * @returns Promise with response containing newly created bucket name or error
  *
  * @example Create bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .createBucket('avatars', {
  *     public: false,
  *     allowedMimeTypes: ['image/png'],
  *     fileSizeLimit: 1024
  *   })
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "name": "avatars"
  *   },
  *   "error": null
  * }
  * ```
  */
  async createBucket(r, e = { public: !1 }) {
    var t = this;
    return t.handleOperation(async () => await L(t.fetch, `${t.url}/bucket`, {
      id: r,
      name: r,
      type: e.type,
      public: e.public,
      file_size_limit: e.fileSizeLimit,
      allowed_mime_types: e.allowedMimeTypes
    }, { headers: t.headers }));
  }
  /**
  * Updates a Storage bucket
  *
  * @category File Buckets
  * @param id A unique identifier for the bucket you are updating.
  * @param options.public The visibility of the bucket. Public buckets don't require an authorization token to download objects, but still require a valid token for all other operations.
  * @param options.fileSizeLimit specifies the max file size in bytes that can be uploaded to this bucket.
  * The global file size limit takes precedence over this value.
  * The default value is null, which doesn't set a per bucket file size limit.
  * @param options.allowedMimeTypes specifies the allowed mime types that this bucket can accept during upload.
  * The default value is null, which allows files with all mime types to be uploaded.
  * Each mime type specified can be a wildcard, e.g. image/*, or a specific mime type, e.g. image/png.
  * @returns Promise with response containing success message or error
  *
  * @example Update bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .updateBucket('avatars', {
  *     public: false,
  *     allowedMimeTypes: ['image/png'],
  *     fileSizeLimit: 1024
  *   })
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "message": "Successfully updated"
  *   },
  *   "error": null
  * }
  * ```
  */
  async updateBucket(r, e) {
    var t = this;
    return t.handleOperation(async () => await Ye(t.fetch, `${t.url}/bucket/${r}`, {
      id: r,
      name: r,
      public: e.public,
      file_size_limit: e.fileSizeLimit,
      allowed_mime_types: e.allowedMimeTypes
    }, { headers: t.headers }));
  }
  /**
  * Removes all objects inside a single bucket.
  *
  * @category File Buckets
  * @param id The unique identifier of the bucket you would like to empty.
  * @returns Promise with success message or error
  *
  * @example Empty bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .emptyBucket('avatars')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "message": "Successfully emptied"
  *   },
  *   "error": null
  * }
  * ```
  */
  async emptyBucket(r) {
    var e = this;
    return e.handleOperation(async () => await L(e.fetch, `${e.url}/bucket/${r}/empty`, {}, { headers: e.headers }));
  }
  /**
  * Deletes an existing bucket. A bucket can't be deleted with existing objects inside it.
  * You must first `empty()` the bucket.
  *
  * @category File Buckets
  * @param id The unique identifier of the bucket you would like to delete.
  * @returns Promise with success message or error
  *
  * @example Delete bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .deleteBucket('avatars')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "message": "Successfully deleted"
  *   },
  *   "error": null
  * }
  * ```
  */
  async deleteBucket(r) {
    var e = this;
    return e.handleOperation(async () => await nt(e.fetch, `${e.url}/bucket/${r}`, {}, { headers: e.headers }));
  }
  listBucketOptionsToQueryString(r) {
    const e = {};
    return r && ("limit" in r && (e.limit = String(r.limit)), "offset" in r && (e.offset = String(r.offset)), r.search && (e.search = r.search), r.sortColumn && (e.sortColumn = r.sortColumn), r.sortOrder && (e.sortOrder = r.sortOrder)), Object.keys(e).length > 0 ? "?" + new URLSearchParams(e).toString() : "";
  }
}, zr = class extends de {
  /**
  * @alpha
  *
  * Creates a new StorageAnalyticsClient instance
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Analytics Buckets
  * @param url - The base URL for the storage API
  * @param headers - HTTP headers to include in requests
  * @param fetch - Optional custom fetch implementation
  *
  * @example
  * ```typescript
  * const client = new StorageAnalyticsClient(url, headers)
  * ```
  */
  constructor(r, e = {}, t) {
    const s = r.replace(/\/$/, ""), n = E(E({}, ke), e);
    super(s, n, t, "storage");
  }
  /**
  * @alpha
  *
  * Creates a new analytics bucket using Iceberg tables
  * Analytics buckets are optimized for analytical queries and data processing
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Analytics Buckets
  * @param name A unique name for the bucket you are creating
  * @returns Promise with response containing newly created analytics bucket or error
  *
  * @example Create analytics bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .analytics
  *   .createBucket('analytics-data')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "name": "analytics-data",
  *     "type": "ANALYTICS",
  *     "format": "iceberg",
  *     "created_at": "2024-05-22T22:26:05.100Z",
  *     "updated_at": "2024-05-22T22:26:05.100Z"
  *   },
  *   "error": null
  * }
  * ```
  */
  async createBucket(r) {
    var e = this;
    return e.handleOperation(async () => await L(e.fetch, `${e.url}/bucket`, { name: r }, { headers: e.headers }));
  }
  /**
  * @alpha
  *
  * Retrieves the details of all Analytics Storage buckets within an existing project
  * Only returns buckets of type 'ANALYTICS'
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Analytics Buckets
  * @param options Query parameters for listing buckets
  * @param options.limit Maximum number of buckets to return
  * @param options.offset Number of buckets to skip
  * @param options.sortColumn Column to sort by ('name', 'created_at', 'updated_at')
  * @param options.sortOrder Sort order ('asc' or 'desc')
  * @param options.search Search term to filter bucket names
  * @returns Promise with response containing array of analytics buckets or error
  *
  * @example List analytics buckets
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .analytics
  *   .listBuckets({
  *     limit: 10,
  *     offset: 0,
  *     sortColumn: 'created_at',
  *     sortOrder: 'desc'
  *   })
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": [
  *     {
  *       "name": "analytics-data",
  *       "type": "ANALYTICS",
  *       "format": "iceberg",
  *       "created_at": "2024-05-22T22:26:05.100Z",
  *       "updated_at": "2024-05-22T22:26:05.100Z"
  *     }
  *   ],
  *   "error": null
  * }
  * ```
  */
  async listBuckets(r) {
    var e = this;
    return e.handleOperation(async () => {
      const t = new URLSearchParams();
      (r == null ? void 0 : r.limit) !== void 0 && t.set("limit", r.limit.toString()), (r == null ? void 0 : r.offset) !== void 0 && t.set("offset", r.offset.toString()), r != null && r.sortColumn && t.set("sortColumn", r.sortColumn), r != null && r.sortOrder && t.set("sortOrder", r.sortOrder), r != null && r.search && t.set("search", r.search);
      const s = t.toString(), n = s ? `${e.url}/bucket?${s}` : `${e.url}/bucket`;
      return await be(e.fetch, n, { headers: e.headers });
    });
  }
  /**
  * @alpha
  *
  * Deletes an existing analytics bucket
  * A bucket can't be deleted with existing objects inside it
  * You must first empty the bucket before deletion
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Analytics Buckets
  * @param bucketName The unique identifier of the bucket you would like to delete
  * @returns Promise with response containing success message or error
  *
  * @example Delete analytics bucket
  * ```js
  * const { data, error } = await supabase
  *   .storage
  *   .analytics
  *   .deleteBucket('analytics-data')
  * ```
  *
  * Response:
  * ```json
  * {
  *   "data": {
  *     "message": "Successfully deleted"
  *   },
  *   "error": null
  * }
  * ```
  */
  async deleteBucket(r) {
    var e = this;
    return e.handleOperation(async () => await nt(e.fetch, `${e.url}/bucket/${r}`, {}, { headers: e.headers }));
  }
  /**
  * @alpha
  *
  * Get an Iceberg REST Catalog client configured for a specific analytics bucket
  * Use this to perform advanced table and namespace operations within the bucket
  * The returned client provides full access to the Apache Iceberg REST Catalog API
  * with the Supabase `{ data, error }` pattern for consistent error handling on all operations.
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Analytics Buckets
  * @param bucketName - The name of the analytics bucket (warehouse) to connect to
  * @returns The wrapped Iceberg catalog client
  * @throws {StorageError} If the bucket name is invalid
  *
  * @example Get catalog and create table
  * ```js
  * // First, create an analytics bucket
  * const { data: bucket, error: bucketError } = await supabase
  *   .storage
  *   .analytics
  *   .createBucket('analytics-data')
  *
  * // Get the Iceberg catalog for that bucket
  * const catalog = supabase.storage.analytics.from('analytics-data')
  *
  * // Create a namespace
  * const { error: nsError } = await catalog.createNamespace({ namespace: ['default'] })
  *
  * // Create a table with schema
  * const { data: tableMetadata, error: tableError } = await catalog.createTable(
  *   { namespace: ['default'] },
  *   {
  *     name: 'events',
  *     schema: {
  *       type: 'struct',
  *       fields: [
  *         { id: 1, name: 'id', type: 'long', required: true },
  *         { id: 2, name: 'timestamp', type: 'timestamp', required: true },
  *         { id: 3, name: 'user_id', type: 'string', required: false }
  *       ],
  *       'schema-id': 0,
  *       'identifier-field-ids': [1]
  *     },
  *     'partition-spec': {
  *       'spec-id': 0,
  *       fields: []
  *     },
  *     'write-order': {
  *       'order-id': 0,
  *       fields: []
  *     },
  *     properties: {
  *       'write.format.default': 'parquet'
  *     }
  *   }
  * )
  * ```
  *
  * @example List tables in namespace
  * ```js
  * const catalog = supabase.storage.analytics.from('analytics-data')
  *
  * // List all tables in the default namespace
  * const { data: tables, error: listError } = await catalog.listTables({ namespace: ['default'] })
  * if (listError) {
  *   if (listError.isNotFound()) {
  *     console.log('Namespace not found')
  *   }
  *   return
  * }
  * console.log(tables) // [{ namespace: ['default'], name: 'events' }]
  * ```
  *
  * @example Working with namespaces
  * ```js
  * const catalog = supabase.storage.analytics.from('analytics-data')
  *
  * // List all namespaces
  * const { data: namespaces } = await catalog.listNamespaces()
  *
  * // Create namespace with properties
  * await catalog.createNamespace(
  *   { namespace: ['production'] },
  *   { properties: { owner: 'data-team', env: 'prod' } }
  * )
  * ```
  *
  * @example Cleanup operations
  * ```js
  * const catalog = supabase.storage.analytics.from('analytics-data')
  *
  * // Drop table with purge option (removes all data)
  * const { error: dropError } = await catalog.dropTable(
  *   { namespace: ['default'], name: 'events' },
  *   { purge: true }
  * )
  *
  * if (dropError?.isNotFound()) {
  *   console.log('Table does not exist')
  * }
  *
  * // Drop namespace (must be empty)
  * await catalog.dropNamespace({ namespace: ['default'] })
  * ```
  *
  * @remarks
  * This method provides a bridge between Supabase's bucket management and the standard
  * Apache Iceberg REST Catalog API. The bucket name maps to the Iceberg warehouse parameter.
  * All authentication and configuration is handled automatically using your Supabase credentials.
  *
  * **Error Handling**: Invalid bucket names throw immediately. All catalog
  * operations return `{ data, error }` where errors are `IcebergError` instances from iceberg-js.
  * Use helper methods like `error.isNotFound()` or check `error.status` for specific error handling.
  * Use `.throwOnError()` on the analytics client if you prefer exceptions for catalog operations.
  *
  * **Cleanup Operations**: When using `dropTable`, the `purge: true` option permanently
  * deletes all table data. Without it, the table is marked as deleted but data remains.
  *
  * **Library Dependency**: The returned catalog wraps `IcebergRestCatalog` from iceberg-js.
  * For complete API documentation and advanced usage, refer to the
  * [iceberg-js documentation](https://supabase.github.io/iceberg-js/).
  */
  from(r) {
    var e = this;
    if (!Nr(r)) throw new xe("Invalid bucket name: File, folder, and bucket names must follow AWS object key naming guidelines and should avoid the use of any other characters.");
    const t = new jr({
      baseUrl: this.url,
      catalogName: r,
      auth: {
        type: "custom",
        getHeaders: async () => e.headers
      },
      fetch: this.fetch
    }), s = this.shouldThrowOnError;
    return new Proxy(t, { get(n, i) {
      const a = n[i];
      return typeof a != "function" ? a : async (...o) => {
        try {
          return {
            data: await a.apply(n, o),
            error: null
          };
        } catch (l) {
          if (s) throw l;
          return {
            data: null,
            error: l
          };
        }
      };
    } });
  }
}, Jr = class extends de {
  /** Creates a new VectorIndexApi instance */
  constructor(r, e = {}, t) {
    const s = r.replace(/\/$/, ""), n = E(E({}, ke), {}, { "Content-Type": "application/json" }, e);
    super(s, n, t, "vectors");
  }
  /** Creates a new vector index within a bucket */
  async createIndex(r) {
    var e = this;
    return e.handleOperation(async () => await N.post(e.fetch, `${e.url}/CreateIndex`, r, { headers: e.headers }) || {});
  }
  /** Retrieves metadata for a specific vector index */
  async getIndex(r, e) {
    var t = this;
    return t.handleOperation(async () => await N.post(t.fetch, `${t.url}/GetIndex`, {
      vectorBucketName: r,
      indexName: e
    }, { headers: t.headers }));
  }
  /** Lists vector indexes within a bucket with optional filtering and pagination */
  async listIndexes(r) {
    var e = this;
    return e.handleOperation(async () => await N.post(e.fetch, `${e.url}/ListIndexes`, r, { headers: e.headers }));
  }
  /** Deletes a vector index and all its data */
  async deleteIndex(r, e) {
    var t = this;
    return t.handleOperation(async () => await N.post(t.fetch, `${t.url}/DeleteIndex`, {
      vectorBucketName: r,
      indexName: e
    }, { headers: t.headers }) || {});
  }
}, Yr = class extends de {
  /** Creates a new VectorDataApi instance */
  constructor(r, e = {}, t) {
    const s = r.replace(/\/$/, ""), n = E(E({}, ke), {}, { "Content-Type": "application/json" }, e);
    super(s, n, t, "vectors");
  }
  /** Inserts or updates vectors in batch (1-500 per request) */
  async putVectors(r) {
    var e = this;
    if (r.vectors.length < 1 || r.vectors.length > 500) throw new Error("Vector batch size must be between 1 and 500 items");
    return e.handleOperation(async () => await N.post(e.fetch, `${e.url}/PutVectors`, r, { headers: e.headers }) || {});
  }
  /** Retrieves vectors by their keys in batch */
  async getVectors(r) {
    var e = this;
    return e.handleOperation(async () => await N.post(e.fetch, `${e.url}/GetVectors`, r, { headers: e.headers }));
  }
  /** Lists vectors in an index with pagination */
  async listVectors(r) {
    var e = this;
    if (r.segmentCount !== void 0) {
      if (r.segmentCount < 1 || r.segmentCount > 16) throw new Error("segmentCount must be between 1 and 16");
      if (r.segmentIndex !== void 0 && (r.segmentIndex < 0 || r.segmentIndex >= r.segmentCount))
        throw new Error(`segmentIndex must be between 0 and ${r.segmentCount - 1}`);
    }
    return e.handleOperation(async () => await N.post(e.fetch, `${e.url}/ListVectors`, r, { headers: e.headers }));
  }
  /** Queries for similar vectors using approximate nearest neighbor search */
  async queryVectors(r) {
    var e = this;
    return e.handleOperation(async () => await N.post(e.fetch, `${e.url}/QueryVectors`, r, { headers: e.headers }));
  }
  /** Deletes vectors by their keys in batch (1-500 per request) */
  async deleteVectors(r) {
    var e = this;
    if (r.keys.length < 1 || r.keys.length > 500) throw new Error("Keys batch size must be between 1 and 500 items");
    return e.handleOperation(async () => await N.post(e.fetch, `${e.url}/DeleteVectors`, r, { headers: e.headers }) || {});
  }
}, Qr = class extends de {
  /** Creates a new VectorBucketApi instance */
  constructor(r, e = {}, t) {
    const s = r.replace(/\/$/, ""), n = E(E({}, ke), {}, { "Content-Type": "application/json" }, e);
    super(s, n, t, "vectors");
  }
  /** Creates a new vector bucket */
  async createBucket(r) {
    var e = this;
    return e.handleOperation(async () => await N.post(e.fetch, `${e.url}/CreateVectorBucket`, { vectorBucketName: r }, { headers: e.headers }) || {});
  }
  /** Retrieves metadata for a specific vector bucket */
  async getBucket(r) {
    var e = this;
    return e.handleOperation(async () => await N.post(e.fetch, `${e.url}/GetVectorBucket`, { vectorBucketName: r }, { headers: e.headers }));
  }
  /** Lists vector buckets with optional filtering and pagination */
  async listBuckets(r = {}) {
    var e = this;
    return e.handleOperation(async () => await N.post(e.fetch, `${e.url}/ListVectorBuckets`, r, { headers: e.headers }));
  }
  /** Deletes a vector bucket (must be empty first) */
  async deleteBucket(r) {
    var e = this;
    return e.handleOperation(async () => await N.post(e.fetch, `${e.url}/DeleteVectorBucket`, { vectorBucketName: r }, { headers: e.headers }) || {});
  }
}, Zr = class extends Qr {
  /**
  * @alpha
  *
  * Creates a StorageVectorsClient that can manage buckets, indexes, and vectors.
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param url - Base URL of the Storage Vectors REST API.
  * @param options.headers - Optional headers (for example `Authorization`) applied to every request.
  * @param options.fetch - Optional custom `fetch` implementation for non-browser runtimes.
  *
  * @example
  * ```typescript
  * const client = new StorageVectorsClient(url, options)
  * ```
  */
  constructor(r, e = {}) {
    super(r, e.headers || {}, e.fetch);
  }
  /**
  *
  * @alpha
  *
  * Access operations for a specific vector bucket
  * Returns a scoped client for index and vector operations within the bucket
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param vectorBucketName - Name of the vector bucket
  * @returns Bucket-scoped client with index and vector operations
  *
  * @example
  * ```typescript
  * const bucket = supabase.storage.vectors.from('embeddings-prod')
  * ```
  */
  from(r) {
    return new es(this.url, this.headers, r, this.fetch);
  }
  /**
  *
  * @alpha
  *
  * Creates a new vector bucket
  * Vector buckets are containers for vector indexes and their data
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param vectorBucketName - Unique name for the vector bucket
  * @returns Promise with empty response on success or error
  *
  * @example
  * ```typescript
  * const { data, error } = await supabase
  *   .storage
  *   .vectors
  *   .createBucket('embeddings-prod')
  * ```
  */
  async createBucket(r) {
    var e = () => super.createBucket, t = this;
    return e().call(t, r);
  }
  /**
  *
  * @alpha
  *
  * Retrieves metadata for a specific vector bucket
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param vectorBucketName - Name of the vector bucket
  * @returns Promise with bucket metadata or error
  *
  * @example
  * ```typescript
  * const { data, error } = await supabase
  *   .storage
  *   .vectors
  *   .getBucket('embeddings-prod')
  *
  * console.log('Bucket created:', data?.vectorBucket.creationTime)
  * ```
  */
  async getBucket(r) {
    var e = () => super.getBucket, t = this;
    return e().call(t, r);
  }
  /**
  *
  * @alpha
  *
  * Lists all vector buckets with optional filtering and pagination
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param options - Optional filters (prefix, maxResults, nextToken)
  * @returns Promise with list of buckets or error
  *
  * @example
  * ```typescript
  * const { data, error } = await supabase
  *   .storage
  *   .vectors
  *   .listBuckets({ prefix: 'embeddings-' })
  *
  * data?.vectorBuckets.forEach(bucket => {
  *   console.log(bucket.vectorBucketName)
  * })
  * ```
  */
  async listBuckets(r = {}) {
    var e = () => super.listBuckets, t = this;
    return e().call(t, r);
  }
  /**
  *
  * @alpha
  *
  * Deletes a vector bucket (bucket must be empty)
  * All indexes must be deleted before deleting the bucket
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param vectorBucketName - Name of the vector bucket to delete
  * @returns Promise with empty response on success or error
  *
  * @example
  * ```typescript
  * const { data, error } = await supabase
  *   .storage
  *   .vectors
  *   .deleteBucket('embeddings-old')
  * ```
  */
  async deleteBucket(r) {
    var e = () => super.deleteBucket, t = this;
    return e().call(t, r);
  }
}, es = class extends Jr {
  /**
  * @alpha
  *
  * Creates a helper that automatically scopes all index operations to the provided bucket.
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @example
  * ```typescript
  * const bucket = supabase.storage.vectors.from('embeddings-prod')
  * ```
  */
  constructor(r, e, t, s) {
    super(r, e, s), this.vectorBucketName = t;
  }
  /**
  *
  * @alpha
  *
  * Creates a new vector index in this bucket
  * Convenience method that automatically includes the bucket name
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param options - Index configuration (vectorBucketName is automatically set)
  * @returns Promise with empty response on success or error
  *
  * @example
  * ```typescript
  * const bucket = supabase.storage.vectors.from('embeddings-prod')
  * await bucket.createIndex({
  *   indexName: 'documents-openai',
  *   dataType: 'float32',
  *   dimension: 1536,
  *   distanceMetric: 'cosine',
  *   metadataConfiguration: {
  *     nonFilterableMetadataKeys: ['raw_text']
  *   }
  * })
  * ```
  */
  async createIndex(r) {
    var e = () => super.createIndex, t = this;
    return e().call(t, E(E({}, r), {}, { vectorBucketName: t.vectorBucketName }));
  }
  /**
  *
  * @alpha
  *
  * Lists indexes in this bucket
  * Convenience method that automatically includes the bucket name
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param options - Listing options (vectorBucketName is automatically set)
  * @returns Promise with response containing indexes array and pagination token or error
  *
  * @example
  * ```typescript
  * const bucket = supabase.storage.vectors.from('embeddings-prod')
  * const { data } = await bucket.listIndexes({ prefix: 'documents-' })
  * ```
  */
  async listIndexes(r = {}) {
    var e = () => super.listIndexes, t = this;
    return e().call(t, E(E({}, r), {}, { vectorBucketName: t.vectorBucketName }));
  }
  /**
  *
  * @alpha
  *
  * Retrieves metadata for a specific index in this bucket
  * Convenience method that automatically includes the bucket name
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param indexName - Name of the index to retrieve
  * @returns Promise with index metadata or error
  *
  * @example
  * ```typescript
  * const bucket = supabase.storage.vectors.from('embeddings-prod')
  * const { data } = await bucket.getIndex('documents-openai')
  * console.log('Dimension:', data?.index.dimension)
  * ```
  */
  async getIndex(r) {
    var e = () => super.getIndex, t = this;
    return e().call(t, t.vectorBucketName, r);
  }
  /**
  *
  * @alpha
  *
  * Deletes an index from this bucket
  * Convenience method that automatically includes the bucket name
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param indexName - Name of the index to delete
  * @returns Promise with empty response on success or error
  *
  * @example
  * ```typescript
  * const bucket = supabase.storage.vectors.from('embeddings-prod')
  * await bucket.deleteIndex('old-index')
  * ```
  */
  async deleteIndex(r) {
    var e = () => super.deleteIndex, t = this;
    return e().call(t, t.vectorBucketName, r);
  }
  /**
  *
  * @alpha
  *
  * Access operations for a specific index within this bucket
  * Returns a scoped client for vector data operations
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param indexName - Name of the index
  * @returns Index-scoped client with vector data operations
  *
  * @example
  * ```typescript
  * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
  *
  * // Insert vectors
  * await index.putVectors({
  *   vectors: [
  *     { key: 'doc-1', data: { float32: [...] }, metadata: { title: 'Intro' } }
  *   ]
  * })
  *
  * // Query similar vectors
  * const { data } = await index.queryVectors({
  *   queryVector: { float32: [...] },
  *   topK: 5
  * })
  * ```
  */
  index(r) {
    return new ts(this.url, this.headers, this.vectorBucketName, r, this.fetch);
  }
}, ts = class extends Yr {
  /**
  *
  * @alpha
  *
  * Creates a helper that automatically scopes all vector operations to the provided bucket/index names.
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @example
  * ```typescript
  * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
  * ```
  */
  constructor(r, e, t, s, n) {
    super(r, e, n), this.vectorBucketName = t, this.indexName = s;
  }
  /**
  *
  * @alpha
  *
  * Inserts or updates vectors in this index
  * Convenience method that automatically includes bucket and index names
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param options - Vector insertion options (bucket and index names automatically set)
  * @returns Promise with empty response on success or error
  *
  * @example
  * ```typescript
  * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
  * await index.putVectors({
  *   vectors: [
  *     {
  *       key: 'doc-1',
  *       data: { float32: [0.1, 0.2, ...] },
  *       metadata: { title: 'Introduction', page: 1 }
  *     }
  *   ]
  * })
  * ```
  */
  async putVectors(r) {
    var e = () => super.putVectors, t = this;
    return e().call(t, E(E({}, r), {}, {
      vectorBucketName: t.vectorBucketName,
      indexName: t.indexName
    }));
  }
  /**
  *
  * @alpha
  *
  * Retrieves vectors by keys from this index
  * Convenience method that automatically includes bucket and index names
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param options - Vector retrieval options (bucket and index names automatically set)
  * @returns Promise with response containing vectors array or error
  *
  * @example
  * ```typescript
  * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
  * const { data } = await index.getVectors({
  *   keys: ['doc-1', 'doc-2'],
  *   returnMetadata: true
  * })
  * ```
  */
  async getVectors(r) {
    var e = () => super.getVectors, t = this;
    return e().call(t, E(E({}, r), {}, {
      vectorBucketName: t.vectorBucketName,
      indexName: t.indexName
    }));
  }
  /**
  *
  * @alpha
  *
  * Lists vectors in this index with pagination
  * Convenience method that automatically includes bucket and index names
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param options - Listing options (bucket and index names automatically set)
  * @returns Promise with response containing vectors array and pagination token or error
  *
  * @example
  * ```typescript
  * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
  * const { data } = await index.listVectors({
  *   maxResults: 500,
  *   returnMetadata: true
  * })
  * ```
  */
  async listVectors(r = {}) {
    var e = () => super.listVectors, t = this;
    return e().call(t, E(E({}, r), {}, {
      vectorBucketName: t.vectorBucketName,
      indexName: t.indexName
    }));
  }
  /**
  *
  * @alpha
  *
  * Queries for similar vectors in this index
  * Convenience method that automatically includes bucket and index names
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param options - Query options (bucket and index names automatically set)
  * @returns Promise with response containing matches array of similar vectors ordered by distance or error
  *
  * @example
  * ```typescript
  * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
  * const { data } = await index.queryVectors({
  *   queryVector: { float32: [0.1, 0.2, ...] },
  *   topK: 5,
  *   filter: { category: 'technical' },
  *   returnDistance: true,
  *   returnMetadata: true
  * })
  * ```
  */
  async queryVectors(r) {
    var e = () => super.queryVectors, t = this;
    return e().call(t, E(E({}, r), {}, {
      vectorBucketName: t.vectorBucketName,
      indexName: t.indexName
    }));
  }
  /**
  *
  * @alpha
  *
  * Deletes vectors by keys from this index
  * Convenience method that automatically includes bucket and index names
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @param options - Deletion options (bucket and index names automatically set)
  * @returns Promise with empty response on success or error
  *
  * @example
  * ```typescript
  * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
  * await index.deleteVectors({
  *   keys: ['doc-1', 'doc-2', 'doc-3']
  * })
  * ```
  */
  async deleteVectors(r) {
    var e = () => super.deleteVectors, t = this;
    return e().call(t, E(E({}, r), {}, {
      vectorBucketName: t.vectorBucketName,
      indexName: t.indexName
    }));
  }
}, rs = class extends Xr {
  /**
  * Creates a client for Storage buckets, files, analytics, and vectors.
  *
  * @category File Buckets
  * @example
  * ```ts
  * import { StorageClient } from '@supabase/storage-js'
  *
  * const storage = new StorageClient('https://xyzcompany.supabase.co/storage/v1', {
  *   apikey: 'public-anon-key',
  * })
  * const avatars = storage.from('avatars')
  * ```
  */
  constructor(r, e = {}, t, s) {
    super(r, e, t, s);
  }
  /**
  * Perform file operation in a bucket.
  *
  * @category File Buckets
  * @param id The bucket id to operate on.
  *
  * @example
  * ```typescript
  * const avatars = supabase.storage.from('avatars')
  * ```
  */
  from(r) {
    return new Gr(this.url, this.headers, r, this.fetch);
  }
  /**
  *
  * @alpha
  *
  * Access vector storage operations.
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Vector Buckets
  * @returns A StorageVectorsClient instance configured with the current storage settings.
  */
  get vectors() {
    return new Zr(this.url + "/vector", {
      headers: this.headers,
      fetch: this.fetch
    });
  }
  /**
  *
  * @alpha
  *
  * Access analytics storage operations using Iceberg tables.
  *
  * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
  *
  * @category Analytics Buckets
  * @returns A StorageAnalyticsClient instance configured with the current storage settings.
  */
  get analytics() {
    return new zr(this.url + "/iceberg", this.headers, this.fetch);
  }
};
const Bt = "2.99.2", oe = 30 * 1e3, Qe = 3, Me = Qe * oe, ss = "http://localhost:9999", ns = "supabase.auth.token", is = { "X-Client-Info": `gotrue-js/${Bt}` }, Ze = "X-Supabase-Api-Version", qt = {
  "2024-01-01": {
    timestamp: Date.parse("2024-01-01T00:00:00.0Z"),
    name: "2024-01-01"
  }
}, as = /^([a-z0-9_-]{4})*($|[a-z0-9_-]{3}$|[a-z0-9_-]{2}$)$/i, os = 10 * 60 * 1e3;
class Ee extends Error {
  constructor(e, t, s) {
    super(e), this.__isAuthError = !0, this.name = "AuthError", this.status = t, this.code = s;
  }
}
function v(r) {
  return typeof r == "object" && r !== null && "__isAuthError" in r;
}
class ls extends Ee {
  constructor(e, t, s) {
    super(e, t, s), this.name = "AuthApiError", this.status = t, this.code = s;
  }
}
function cs(r) {
  return v(r) && r.name === "AuthApiError";
}
class Y extends Ee {
  constructor(e, t) {
    super(e), this.name = "AuthUnknownError", this.originalError = t;
  }
}
class F extends Ee {
  constructor(e, t, s, n) {
    super(e, s, n), this.name = t, this.status = s;
  }
}
class U extends F {
  constructor() {
    super("Auth session missing!", "AuthSessionMissingError", 400, void 0);
  }
}
function Fe(r) {
  return v(r) && r.name === "AuthSessionMissingError";
}
class te extends F {
  constructor() {
    super("Auth session or user missing", "AuthInvalidTokenResponseError", 500, void 0);
  }
}
class Ie extends F {
  constructor(e) {
    super(e, "AuthInvalidCredentialsError", 400, void 0);
  }
}
class Pe extends F {
  constructor(e, t = null) {
    super(e, "AuthImplicitGrantRedirectError", 500, void 0), this.details = null, this.details = t;
  }
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      details: this.details
    };
  }
}
function us(r) {
  return v(r) && r.name === "AuthImplicitGrantRedirectError";
}
class _t extends F {
  constructor(e, t = null) {
    super(e, "AuthPKCEGrantCodeExchangeError", 500, void 0), this.details = null, this.details = t;
  }
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      details: this.details
    };
  }
}
class hs extends F {
  constructor() {
    super("PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser or device, or if the storage was cleared. For SSR frameworks (Next.js, SvelteKit, etc.), use @supabase/ssr on both the server and client to store the code verifier in cookies.", "AuthPKCECodeVerifierMissingError", 400, "pkce_code_verifier_not_found");
  }
}
class et extends F {
  constructor(e, t) {
    super(e, "AuthRetryableFetchError", t, void 0);
  }
}
function We(r) {
  return v(r) && r.name === "AuthRetryableFetchError";
}
class yt extends F {
  constructor(e, t, s) {
    super(e, "AuthWeakPasswordError", t, "weak_password"), this.reasons = s;
  }
}
class tt extends F {
  constructor(e) {
    super(e, "AuthInvalidJwtError", 400, "invalid_jwt");
  }
}
const je = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".split(""), mt = ` 	
\r=`.split(""), ds = (() => {
  const r = new Array(128);
  for (let e = 0; e < r.length; e += 1)
    r[e] = -1;
  for (let e = 0; e < mt.length; e += 1)
    r[mt[e].charCodeAt(0)] = -2;
  for (let e = 0; e < je.length; e += 1)
    r[je[e].charCodeAt(0)] = e;
  return r;
})();
function vt(r, e, t) {
  if (r !== null)
    for (e.queue = e.queue << 8 | r, e.queuedBits += 8; e.queuedBits >= 6; ) {
      const s = e.queue >> e.queuedBits - 6 & 63;
      t(je[s]), e.queuedBits -= 6;
    }
  else if (e.queuedBits > 0)
    for (e.queue = e.queue << 6 - e.queuedBits, e.queuedBits = 6; e.queuedBits >= 6; ) {
      const s = e.queue >> e.queuedBits - 6 & 63;
      t(je[s]), e.queuedBits -= 6;
    }
}
function Mt(r, e, t) {
  const s = ds[r];
  if (s > -1)
    for (e.queue = e.queue << 6 | s, e.queuedBits += 6; e.queuedBits >= 8; )
      t(e.queue >> e.queuedBits - 8 & 255), e.queuedBits -= 8;
  else {
    if (s === -2)
      return;
    throw new Error(`Invalid Base64-URL character "${String.fromCharCode(r)}"`);
  }
}
function wt(r) {
  const e = [], t = (a) => {
    e.push(String.fromCodePoint(a));
  }, s = {
    utf8seq: 0,
    codepoint: 0
  }, n = { queue: 0, queuedBits: 0 }, i = (a) => {
    gs(a, s, t);
  };
  for (let a = 0; a < r.length; a += 1)
    Mt(r.charCodeAt(a), n, i);
  return e.join("");
}
function fs(r, e) {
  if (r <= 127) {
    e(r);
    return;
  } else if (r <= 2047) {
    e(192 | r >> 6), e(128 | r & 63);
    return;
  } else if (r <= 65535) {
    e(224 | r >> 12), e(128 | r >> 6 & 63), e(128 | r & 63);
    return;
  } else if (r <= 1114111) {
    e(240 | r >> 18), e(128 | r >> 12 & 63), e(128 | r >> 6 & 63), e(128 | r & 63);
    return;
  }
  throw new Error(`Unrecognized Unicode codepoint: ${r.toString(16)}`);
}
function ps(r, e) {
  for (let t = 0; t < r.length; t += 1) {
    let s = r.charCodeAt(t);
    if (s > 55295 && s <= 56319) {
      const n = (s - 55296) * 1024 & 65535;
      s = (r.charCodeAt(t + 1) - 56320 & 65535 | n) + 65536, t += 1;
    }
    fs(s, e);
  }
}
function gs(r, e, t) {
  if (e.utf8seq === 0) {
    if (r <= 127) {
      t(r);
      return;
    }
    for (let s = 1; s < 6; s += 1)
      if (!(r >> 7 - s & 1)) {
        e.utf8seq = s;
        break;
      }
    if (e.utf8seq === 2)
      e.codepoint = r & 31;
    else if (e.utf8seq === 3)
      e.codepoint = r & 15;
    else if (e.utf8seq === 4)
      e.codepoint = r & 7;
    else
      throw new Error("Invalid UTF-8 sequence");
    e.utf8seq -= 1;
  } else if (e.utf8seq > 0) {
    if (r <= 127)
      throw new Error("Invalid UTF-8 sequence");
    e.codepoint = e.codepoint << 6 | r & 63, e.utf8seq -= 1, e.utf8seq === 0 && t(e.codepoint);
  }
}
function he(r) {
  const e = [], t = { queue: 0, queuedBits: 0 }, s = (n) => {
    e.push(n);
  };
  for (let n = 0; n < r.length; n += 1)
    Mt(r.charCodeAt(n), t, s);
  return new Uint8Array(e);
}
function _s(r) {
  const e = [];
  return ps(r, (t) => e.push(t)), new Uint8Array(e);
}
function Q(r) {
  const e = [], t = { queue: 0, queuedBits: 0 }, s = (n) => {
    e.push(n);
  };
  return r.forEach((n) => vt(n, t, s)), vt(null, t, s), e.join("");
}
function ys(r) {
  return Math.round(Date.now() / 1e3) + r;
}
function ms() {
  return Symbol("auth-callback");
}
const j = () => typeof window < "u" && typeof document < "u", H = {
  tested: !1,
  writable: !1
}, Ft = () => {
  if (!j())
    return !1;
  try {
    if (typeof globalThis.localStorage != "object")
      return !1;
  } catch {
    return !1;
  }
  if (H.tested)
    return H.writable;
  const r = `lswt-${Math.random()}${Math.random()}`;
  try {
    globalThis.localStorage.setItem(r, r), globalThis.localStorage.removeItem(r), H.tested = !0, H.writable = !0;
  } catch {
    H.tested = !0, H.writable = !1;
  }
  return H.writable;
};
function vs(r) {
  const e = {}, t = new URL(r);
  if (t.hash && t.hash[0] === "#")
    try {
      new URLSearchParams(t.hash.substring(1)).forEach((n, i) => {
        e[i] = n;
      });
    } catch {
    }
  return t.searchParams.forEach((s, n) => {
    e[n] = s;
  }), e;
}
const Wt = (r) => r ? (...e) => r(...e) : (...e) => fetch(...e), ws = (r) => typeof r == "object" && r !== null && "status" in r && "ok" in r && "json" in r && typeof r.json == "function", le = async (r, e, t) => {
  await r.setItem(e, JSON.stringify(t));
}, X = async (r, e) => {
  const t = await r.getItem(e);
  if (!t)
    return null;
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}, C = async (r, e) => {
  await r.removeItem(e);
};
class De {
  constructor() {
    this.promise = new De.promiseConstructor((e, t) => {
      this.resolve = e, this.reject = t;
    });
  }
}
De.promiseConstructor = Promise;
function Ce(r) {
  const e = r.split(".");
  if (e.length !== 3)
    throw new tt("Invalid JWT structure");
  for (let s = 0; s < e.length; s++)
    if (!as.test(e[s]))
      throw new tt("JWT not in base64url format");
  return {
    // using base64url lib
    header: JSON.parse(wt(e[0])),
    payload: JSON.parse(wt(e[1])),
    signature: he(e[2]),
    raw: {
      header: e[0],
      payload: e[1]
    }
  };
}
async function bs(r) {
  return await new Promise((e) => {
    setTimeout(() => e(null), r);
  });
}
function Es(r, e) {
  return new Promise((s, n) => {
    (async () => {
      for (let i = 0; i < 1 / 0; i++)
        try {
          const a = await r(i);
          if (!e(i, null, a)) {
            s(a);
            return;
          }
        } catch (a) {
          if (!e(i, a)) {
            n(a);
            return;
          }
        }
    })();
  });
}
function Ts(r) {
  return ("0" + r.toString(16)).substr(-2);
}
function Ss() {
  const e = new Uint32Array(56);
  if (typeof crypto > "u") {
    const t = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~", s = t.length;
    let n = "";
    for (let i = 0; i < 56; i++)
      n += t.charAt(Math.floor(Math.random() * s));
    return n;
  }
  return crypto.getRandomValues(e), Array.from(e, Ts).join("");
}
async function ks(r) {
  const t = new TextEncoder().encode(r), s = await crypto.subtle.digest("SHA-256", t), n = new Uint8Array(s);
  return Array.from(n).map((i) => String.fromCharCode(i)).join("");
}
async function Rs(r) {
  if (!(typeof crypto < "u" && typeof crypto.subtle < "u" && typeof TextEncoder < "u"))
    return console.warn("WebCrypto API is not supported. Code challenge method will default to use plain instead of sha256."), r;
  const t = await ks(r);
  return btoa(t).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function re(r, e, t = !1) {
  const s = Ss();
  let n = s;
  t && (n += "/PASSWORD_RECOVERY"), await le(r, `${e}-code-verifier`, n);
  const i = await Rs(s);
  return [i, s === i ? "plain" : "s256"];
}
const As = /^2[0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|1[0-9]|2[0-9]|3[0-1])$/i;
function Os(r) {
  const e = r.headers.get(Ze);
  if (!e || !e.match(As))
    return null;
  try {
    return /* @__PURE__ */ new Date(`${e}T00:00:00.0Z`);
  } catch {
    return null;
  }
}
function Is(r) {
  if (!r)
    throw new Error("Missing exp claim");
  const e = Math.floor(Date.now() / 1e3);
  if (r <= e)
    throw new Error("JWT has expired");
}
function Ps(r) {
  switch (r) {
    case "RS256":
      return {
        name: "RSASSA-PKCS1-v1_5",
        hash: { name: "SHA-256" }
      };
    case "ES256":
      return {
        name: "ECDSA",
        namedCurve: "P-256",
        hash: { name: "SHA-256" }
      };
    default:
      throw new Error("Invalid alg claim");
  }
}
const Cs = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function se(r) {
  if (!Cs.test(r))
    throw new Error("@supabase/auth-js: Expected parameter to be UUID but is not");
}
function Ke() {
  const r = {};
  return new Proxy(r, {
    get: (e, t) => {
      if (t === "__isUserNotAvailableProxy")
        return !0;
      if (typeof t == "symbol") {
        const s = t.toString();
        if (s === "Symbol(Symbol.toPrimitive)" || s === "Symbol(Symbol.toStringTag)" || s === "Symbol(util.inspect.custom)")
          return;
      }
      throw new Error(`@supabase/auth-js: client was created with userStorage option and there was no user stored in the user storage. Accessing the "${t}" property of the session object is not supported. Please use getUser() instead.`);
    },
    set: (e, t) => {
      throw new Error(`@supabase/auth-js: client was created with userStorage option and there was no user stored in the user storage. Setting the "${t}" property of the session object is not supported. Please use getUser() to fetch a user object you can manipulate.`);
    },
    deleteProperty: (e, t) => {
      throw new Error(`@supabase/auth-js: client was created with userStorage option and there was no user stored in the user storage. Deleting the "${t}" property of the session object is not supported. Please use getUser() to fetch a user object you can manipulate.`);
    }
  });
}
function js(r, e) {
  return new Proxy(r, {
    get: (t, s, n) => {
      if (s === "__isInsecureUserWarningProxy")
        return !0;
      if (typeof s == "symbol") {
        const i = s.toString();
        if (i === "Symbol(Symbol.toPrimitive)" || i === "Symbol(Symbol.toStringTag)" || i === "Symbol(util.inspect.custom)" || i === "Symbol(nodejs.util.inspect.custom)")
          return Reflect.get(t, s, n);
      }
      return !e.value && typeof s == "string" && (console.warn("Using the user object as returned from supabase.auth.getSession() or from some supabase.auth.onAuthStateChange() events could be insecure! This value comes directly from the storage medium (usually cookies on the server) and may not be authentic. Use supabase.auth.getUser() instead which authenticates the data by contacting the Supabase Auth server."), e.value = !0), Reflect.get(t, s, n);
    }
  });
}
function bt(r) {
  return JSON.parse(JSON.stringify(r));
}
const z = (r) => r.msg || r.message || r.error_description || r.error || JSON.stringify(r), $s = [502, 503, 504];
async function Et(r) {
  var e;
  if (!ws(r))
    throw new et(z(r), 0);
  if ($s.includes(r.status))
    throw new et(z(r), r.status);
  let t;
  try {
    t = await r.json();
  } catch (i) {
    throw new Y(z(i), i);
  }
  let s;
  const n = Os(r);
  if (n && n.getTime() >= qt["2024-01-01"].timestamp && typeof t == "object" && t && typeof t.code == "string" ? s = t.code : typeof t == "object" && t && typeof t.error_code == "string" && (s = t.error_code), s) {
    if (s === "weak_password")
      throw new yt(z(t), r.status, ((e = t.weak_password) === null || e === void 0 ? void 0 : e.reasons) || []);
    if (s === "session_not_found")
      throw new U();
  } else if (typeof t == "object" && t && typeof t.weak_password == "object" && t.weak_password && Array.isArray(t.weak_password.reasons) && t.weak_password.reasons.length && t.weak_password.reasons.reduce((i, a) => i && typeof a == "string", !0))
    throw new yt(z(t), r.status, t.weak_password.reasons);
  throw new ls(z(t), r.status || 500, s);
}
const Us = (r, e, t, s) => {
  const n = { method: r, headers: (e == null ? void 0 : e.headers) || {} };
  return r === "GET" ? n : (n.headers = Object.assign({ "Content-Type": "application/json;charset=UTF-8" }, e == null ? void 0 : e.headers), n.body = JSON.stringify(s), Object.assign(Object.assign({}, n), t));
};
async function b(r, e, t, s) {
  var n;
  const i = Object.assign({}, s == null ? void 0 : s.headers);
  i[Ze] || (i[Ze] = qt["2024-01-01"].name), s != null && s.jwt && (i.Authorization = `Bearer ${s.jwt}`);
  const a = (n = s == null ? void 0 : s.query) !== null && n !== void 0 ? n : {};
  s != null && s.redirectTo && (a.redirect_to = s.redirectTo);
  const o = Object.keys(a).length ? "?" + new URLSearchParams(a).toString() : "", l = await Ns(r, e, t + o, {
    headers: i,
    noResolveJson: s == null ? void 0 : s.noResolveJson
  }, {}, s == null ? void 0 : s.body);
  return s != null && s.xform ? s == null ? void 0 : s.xform(l) : { data: Object.assign({}, l), error: null };
}
async function Ns(r, e, t, s, n, i) {
  const a = Us(e, s, n, i);
  let o;
  try {
    o = await r(t, Object.assign({}, a));
  } catch (l) {
    throw console.error(l), new et(z(l), 0);
  }
  if (o.ok || await Et(o), s != null && s.noResolveJson)
    return o;
  try {
    return await o.json();
  } catch (l) {
    await Et(l);
  }
}
function x(r) {
  var e;
  let t = null;
  Ds(r) && (t = Object.assign({}, r), r.expires_at || (t.expires_at = ys(r.expires_in)));
  const s = (e = r.user) !== null && e !== void 0 ? e : r;
  return { data: { session: t, user: s }, error: null };
}
function Tt(r) {
  const e = x(r);
  return !e.error && r.weak_password && typeof r.weak_password == "object" && Array.isArray(r.weak_password.reasons) && r.weak_password.reasons.length && r.weak_password.message && typeof r.weak_password.message == "string" && r.weak_password.reasons.reduce((t, s) => t && typeof s == "string", !0) && (e.data.weak_password = r.weak_password), e;
}
function V(r) {
  var e;
  return { data: { user: (e = r.user) !== null && e !== void 0 ? e : r }, error: null };
}
function xs(r) {
  return { data: r, error: null };
}
function Ls(r) {
  const { action_link: e, email_otp: t, hashed_token: s, redirect_to: n, verification_type: i } = r, a = Ne(r, ["action_link", "email_otp", "hashed_token", "redirect_to", "verification_type"]), o = {
    action_link: e,
    email_otp: t,
    hashed_token: s,
    redirect_to: n,
    verification_type: i
  }, l = Object.assign({}, a);
  return {
    data: {
      properties: o,
      user: l
    },
    error: null
  };
}
function St(r) {
  return r;
}
function Ds(r) {
  return r.access_token && r.refresh_token && r.expires_in;
}
const Ve = ["global", "local", "others"];
class Bs {
  /**
   * Creates an admin API client that can be used to manage users and OAuth clients.
   *
   * @example
   * ```ts
   * import { GoTrueAdminApi } from '@supabase/auth-js'
   *
   * const admin = new GoTrueAdminApi({
   *   url: 'https://xyzcompany.supabase.co/auth/v1',
   *   headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
   * })
   * ```
   */
  constructor({ url: e = "", headers: t = {}, fetch: s }) {
    this.url = e, this.headers = t, this.fetch = Wt(s), this.mfa = {
      listFactors: this._listFactors.bind(this),
      deleteFactor: this._deleteFactor.bind(this)
    }, this.oauth = {
      listClients: this._listOAuthClients.bind(this),
      createClient: this._createOAuthClient.bind(this),
      getClient: this._getOAuthClient.bind(this),
      updateClient: this._updateOAuthClient.bind(this),
      deleteClient: this._deleteOAuthClient.bind(this),
      regenerateClientSecret: this._regenerateOAuthClientSecret.bind(this)
    }, this.customProviders = {
      listProviders: this._listCustomProviders.bind(this),
      createProvider: this._createCustomProvider.bind(this),
      getProvider: this._getCustomProvider.bind(this),
      updateProvider: this._updateCustomProvider.bind(this),
      deleteProvider: this._deleteCustomProvider.bind(this)
    };
  }
  /**
   * Removes a logged-in session.
   * @param jwt A valid, logged-in JWT.
   * @param scope The logout sope.
   */
  async signOut(e, t = Ve[0]) {
    if (Ve.indexOf(t) < 0)
      throw new Error(`@supabase/auth-js: Parameter scope must be one of ${Ve.join(", ")}`);
    try {
      return await b(this.fetch, "POST", `${this.url}/logout?scope=${t}`, {
        headers: this.headers,
        jwt: e,
        noResolveJson: !0
      }), { data: null, error: null };
    } catch (s) {
      if (v(s))
        return { data: null, error: s };
      throw s;
    }
  }
  /**
   * Sends an invite link to an email address.
   * @param email The email address of the user.
   * @param options Additional options to be included when inviting.
   */
  async inviteUserByEmail(e, t = {}) {
    try {
      return await b(this.fetch, "POST", `${this.url}/invite`, {
        body: { email: e, data: t.data },
        headers: this.headers,
        redirectTo: t.redirectTo,
        xform: V
      });
    } catch (s) {
      if (v(s))
        return { data: { user: null }, error: s };
      throw s;
    }
  }
  /**
   * Generates email links and OTPs to be sent via a custom email provider.
   * @param email The user's email.
   * @param options.password User password. For signup only.
   * @param options.data Optional user metadata. For signup only.
   * @param options.redirectTo The redirect url which should be appended to the generated link
   */
  async generateLink(e) {
    try {
      const { options: t } = e, s = Ne(e, ["options"]), n = Object.assign(Object.assign({}, s), t);
      return "newEmail" in s && (n.new_email = s == null ? void 0 : s.newEmail, delete n.newEmail), await b(this.fetch, "POST", `${this.url}/admin/generate_link`, {
        body: n,
        headers: this.headers,
        xform: Ls,
        redirectTo: t == null ? void 0 : t.redirectTo
      });
    } catch (t) {
      if (v(t))
        return {
          data: {
            properties: null,
            user: null
          },
          error: t
        };
      throw t;
    }
  }
  // User Admin API
  /**
   * Creates a new user.
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   */
  async createUser(e) {
    try {
      return await b(this.fetch, "POST", `${this.url}/admin/users`, {
        body: e,
        headers: this.headers,
        xform: V
      });
    } catch (t) {
      if (v(t))
        return { data: { user: null }, error: t };
      throw t;
    }
  }
  /**
   * Get a list of users.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   * @param params An object which supports `page` and `perPage` as numbers, to alter the paginated results.
   */
  async listUsers(e) {
    var t, s, n, i, a, o, l;
    try {
      const c = { nextPage: null, lastPage: 0, total: 0 }, u = await b(this.fetch, "GET", `${this.url}/admin/users`, {
        headers: this.headers,
        noResolveJson: !0,
        query: {
          page: (s = (t = e == null ? void 0 : e.page) === null || t === void 0 ? void 0 : t.toString()) !== null && s !== void 0 ? s : "",
          per_page: (i = (n = e == null ? void 0 : e.perPage) === null || n === void 0 ? void 0 : n.toString()) !== null && i !== void 0 ? i : ""
        },
        xform: St
      });
      if (u.error)
        throw u.error;
      const f = await u.json(), d = (a = u.headers.get("x-total-count")) !== null && a !== void 0 ? a : 0, h = (l = (o = u.headers.get("link")) === null || o === void 0 ? void 0 : o.split(",")) !== null && l !== void 0 ? l : [];
      return h.length > 0 && (h.forEach((p) => {
        const g = parseInt(p.split(";")[0].split("=")[1].substring(0, 1)), _ = JSON.parse(p.split(";")[1].split("=")[1]);
        c[`${_}Page`] = g;
      }), c.total = parseInt(d)), { data: Object.assign(Object.assign({}, f), c), error: null };
    } catch (c) {
      if (v(c))
        return { data: { users: [] }, error: c };
      throw c;
    }
  }
  /**
   * Get user by id.
   *
   * @param uid The user's unique identifier
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   */
  async getUserById(e) {
    se(e);
    try {
      return await b(this.fetch, "GET", `${this.url}/admin/users/${e}`, {
        headers: this.headers,
        xform: V
      });
    } catch (t) {
      if (v(t))
        return { data: { user: null }, error: t };
      throw t;
    }
  }
  /**
   * Updates the user data. Changes are applied directly without confirmation flows.
   *
   * @param uid The user's unique identifier
   * @param attributes The data you want to update.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   *
   * @remarks
   * **Important:** This is a server-side operation and does **not** trigger client-side
   * `onAuthStateChange` listeners. The admin API has no connection to client state.
   *
   * To sync changes to the client after calling this method:
   * 1. On the client, call `supabase.auth.refreshSession()` to fetch the updated user data
   * 2. This will trigger the `TOKEN_REFRESHED` event and notify all listeners
   *
   * @example
   * ```typescript
   * // Server-side (Edge Function)
   * const { data, error } = await supabase.auth.admin.updateUserById(
   *   userId,
   *   { user_metadata: { preferences: { theme: 'dark' } } }
   * )
   *
   * // Client-side (to sync the changes)
   * const { data, error } = await supabase.auth.refreshSession()
   * // onAuthStateChange listeners will now be notified with updated user
   * ```
   *
   * @see {@link GoTrueClient.refreshSession} for syncing admin changes to the client
   * @see {@link GoTrueClient.updateUser} for client-side user updates (triggers listeners automatically)
   */
  async updateUserById(e, t) {
    se(e);
    try {
      return await b(this.fetch, "PUT", `${this.url}/admin/users/${e}`, {
        body: t,
        headers: this.headers,
        xform: V
      });
    } catch (s) {
      if (v(s))
        return { data: { user: null }, error: s };
      throw s;
    }
  }
  /**
   * Delete a user. Requires a `service_role` key.
   *
   * @param id The user id you want to remove.
   * @param shouldSoftDelete If true, then the user will be soft-deleted from the auth schema. Soft deletion allows user identification from the hashed user ID but is not reversible.
   * Defaults to false for backward compatibility.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   */
  async deleteUser(e, t = !1) {
    se(e);
    try {
      return await b(this.fetch, "DELETE", `${this.url}/admin/users/${e}`, {
        headers: this.headers,
        body: {
          should_soft_delete: t
        },
        xform: V
      });
    } catch (s) {
      if (v(s))
        return { data: { user: null }, error: s };
      throw s;
    }
  }
  async _listFactors(e) {
    se(e.userId);
    try {
      const { data: t, error: s } = await b(this.fetch, "GET", `${this.url}/admin/users/${e.userId}/factors`, {
        headers: this.headers,
        xform: (n) => ({ data: { factors: n }, error: null })
      });
      return { data: t, error: s };
    } catch (t) {
      if (v(t))
        return { data: null, error: t };
      throw t;
    }
  }
  async _deleteFactor(e) {
    se(e.userId), se(e.id);
    try {
      return { data: await b(this.fetch, "DELETE", `${this.url}/admin/users/${e.userId}/factors/${e.id}`, {
        headers: this.headers
      }), error: null };
    } catch (t) {
      if (v(t))
        return { data: null, error: t };
      throw t;
    }
  }
  /**
   * Lists all OAuth clients with optional pagination.
   * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   */
  async _listOAuthClients(e) {
    var t, s, n, i, a, o, l;
    try {
      const c = { nextPage: null, lastPage: 0, total: 0 }, u = await b(this.fetch, "GET", `${this.url}/admin/oauth/clients`, {
        headers: this.headers,
        noResolveJson: !0,
        query: {
          page: (s = (t = e == null ? void 0 : e.page) === null || t === void 0 ? void 0 : t.toString()) !== null && s !== void 0 ? s : "",
          per_page: (i = (n = e == null ? void 0 : e.perPage) === null || n === void 0 ? void 0 : n.toString()) !== null && i !== void 0 ? i : ""
        },
        xform: St
      });
      if (u.error)
        throw u.error;
      const f = await u.json(), d = (a = u.headers.get("x-total-count")) !== null && a !== void 0 ? a : 0, h = (l = (o = u.headers.get("link")) === null || o === void 0 ? void 0 : o.split(",")) !== null && l !== void 0 ? l : [];
      return h.length > 0 && (h.forEach((p) => {
        const g = parseInt(p.split(";")[0].split("=")[1].substring(0, 1)), _ = JSON.parse(p.split(";")[1].split("=")[1]);
        c[`${_}Page`] = g;
      }), c.total = parseInt(d)), { data: Object.assign(Object.assign({}, f), c), error: null };
    } catch (c) {
      if (v(c))
        return { data: { clients: [] }, error: c };
      throw c;
    }
  }
  /**
   * Creates a new OAuth client.
   * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   */
  async _createOAuthClient(e) {
    try {
      return await b(this.fetch, "POST", `${this.url}/admin/oauth/clients`, {
        body: e,
        headers: this.headers,
        xform: (t) => ({ data: t, error: null })
      });
    } catch (t) {
      if (v(t))
        return { data: null, error: t };
      throw t;
    }
  }
  /**
   * Gets details of a specific OAuth client.
   * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   */
  async _getOAuthClient(e) {
    try {
      return await b(this.fetch, "GET", `${this.url}/admin/oauth/clients/${e}`, {
        headers: this.headers,
        xform: (t) => ({ data: t, error: null })
      });
    } catch (t) {
      if (v(t))
        return { data: null, error: t };
      throw t;
    }
  }
  /**
   * Updates an existing OAuth client.
   * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   */
  async _updateOAuthClient(e, t) {
    try {
      return await b(this.fetch, "PUT", `${this.url}/admin/oauth/clients/${e}`, {
        body: t,
        headers: this.headers,
        xform: (s) => ({ data: s, error: null })
      });
    } catch (s) {
      if (v(s))
        return { data: null, error: s };
      throw s;
    }
  }
  /**
   * Deletes an OAuth client.
   * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   */
  async _deleteOAuthClient(e) {
    try {
      return await b(this.fetch, "DELETE", `${this.url}/admin/oauth/clients/${e}`, {
        headers: this.headers,
        noResolveJson: !0
      }), { data: null, error: null };
    } catch (t) {
      if (v(t))
        return { data: null, error: t };
      throw t;
    }
  }
  /**
   * Regenerates the secret for an OAuth client.
   * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   */
  async _regenerateOAuthClientSecret(e) {
    try {
      return await b(this.fetch, "POST", `${this.url}/admin/oauth/clients/${e}/regenerate_secret`, {
        headers: this.headers,
        xform: (t) => ({ data: t, error: null })
      });
    } catch (t) {
      if (v(t))
        return { data: null, error: t };
      throw t;
    }
  }
  /**
   * Lists all custom providers with optional type filter.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   */
  async _listCustomProviders(e) {
    try {
      const t = {};
      return e != null && e.type && (t.type = e.type), await b(this.fetch, "GET", `${this.url}/admin/custom-providers`, {
        headers: this.headers,
        query: t,
        xform: (s) => {
          var n;
          return { data: { providers: (n = s == null ? void 0 : s.providers) !== null && n !== void 0 ? n : [] }, error: null };
        }
      });
    } catch (t) {
      if (v(t))
        return { data: { providers: [] }, error: t };
      throw t;
    }
  }
  /**
   * Creates a new custom OIDC/OAuth provider.
   *
   * For OIDC providers, the server fetches and validates the OpenID Connect discovery document
   * from the issuer's well-known endpoint (or the provided `discovery_url`) at creation time.
   * This may return a validation error (`error_code: "validation_failed"`) if the discovery
   * document is unreachable, not valid JSON, missing required fields, or if the issuer
   * in the document does not match the expected issuer.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   */
  async _createCustomProvider(e) {
    try {
      return await b(this.fetch, "POST", `${this.url}/admin/custom-providers`, {
        body: e,
        headers: this.headers,
        xform: (t) => ({ data: t, error: null })
      });
    } catch (t) {
      if (v(t))
        return { data: null, error: t };
      throw t;
    }
  }
  /**
   * Gets details of a specific custom provider by identifier.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   */
  async _getCustomProvider(e) {
    try {
      return await b(this.fetch, "GET", `${this.url}/admin/custom-providers/${e}`, {
        headers: this.headers,
        xform: (t) => ({ data: t, error: null })
      });
    } catch (t) {
      if (v(t))
        return { data: null, error: t };
      throw t;
    }
  }
  /**
   * Updates an existing custom provider.
   *
   * When `issuer` or `discovery_url` is changed on an OIDC provider, the server re-fetches and
   * validates the discovery document before persisting. This may return a validation error
   * (`error_code: "validation_failed"`) if the discovery document is unreachable, invalid, or
   * the issuer does not match.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   */
  async _updateCustomProvider(e, t) {
    try {
      return await b(this.fetch, "PUT", `${this.url}/admin/custom-providers/${e}`, {
        body: t,
        headers: this.headers,
        xform: (s) => ({ data: s, error: null })
      });
    } catch (s) {
      if (v(s))
        return { data: null, error: s };
      throw s;
    }
  }
  /**
   * Deletes a custom provider.
   *
   * This function should only be called on a server. Never expose your `service_role` key in the browser.
   */
  async _deleteCustomProvider(e) {
    try {
      return await b(this.fetch, "DELETE", `${this.url}/admin/custom-providers/${e}`, {
        headers: this.headers,
        noResolveJson: !0
      }), { data: null, error: null };
    } catch (t) {
      if (v(t))
        return { data: null, error: t };
      throw t;
    }
  }
}
function kt(r = {}) {
  return {
    getItem: (e) => r[e] || null,
    setItem: (e, t) => {
      r[e] = t;
    },
    removeItem: (e) => {
      delete r[e];
    }
  };
}
const q = {
  /**
   * @experimental
   */
  debug: !!(globalThis && Ft() && globalThis.localStorage && globalThis.localStorage.getItem("supabase.gotrue-js.locks.debug") === "true")
};
class Kt extends Error {
  constructor(e) {
    super(e), this.isAcquireTimeout = !0;
  }
}
class qs extends Kt {
}
async function Ms(r, e, t) {
  q.debug && console.log("@supabase/gotrue-js: navigatorLock: acquire lock", r, e);
  const s = new globalThis.AbortController();
  e > 0 && setTimeout(() => {
    s.abort(), q.debug && console.log("@supabase/gotrue-js: navigatorLock acquire timed out", r);
  }, e), await Promise.resolve();
  try {
    return await globalThis.navigator.locks.request(r, e === 0 ? {
      mode: "exclusive",
      ifAvailable: !0
    } : {
      mode: "exclusive",
      signal: s.signal
    }, async (n) => {
      if (n) {
        q.debug && console.log("@supabase/gotrue-js: navigatorLock: acquired", r, n.name);
        try {
          return await t();
        } finally {
          q.debug && console.log("@supabase/gotrue-js: navigatorLock: released", r, n.name);
        }
      } else {
        if (e === 0)
          throw q.debug && console.log("@supabase/gotrue-js: navigatorLock: not immediately available", r), new qs(`Acquiring an exclusive Navigator LockManager lock "${r}" immediately failed`);
        if (q.debug)
          try {
            const i = await globalThis.navigator.locks.query();
            console.log("@supabase/gotrue-js: Navigator LockManager state", JSON.stringify(i, null, "  "));
          } catch (i) {
            console.warn("@supabase/gotrue-js: Error when querying Navigator LockManager state", i);
          }
        return console.warn("@supabase/gotrue-js: Navigator LockManager returned a null lock when using #request without ifAvailable set to true, it appears this browser is not following the LockManager spec https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request"), await t();
      }
    });
  } catch (n) {
    if ((n == null ? void 0 : n.name) === "AbortError" && e > 0)
      return q.debug && console.log("@supabase/gotrue-js: navigatorLock: acquire timeout, recovering by stealing lock", r), console.warn(`@supabase/gotrue-js: Lock "${r}" was not released within ${e}ms. This may indicate an orphaned lock from a component unmount (e.g., React Strict Mode). Forcefully acquiring the lock to recover.`), await Promise.resolve().then(() => globalThis.navigator.locks.request(r, {
        mode: "exclusive",
        steal: !0
      }, async (i) => {
        if (i) {
          q.debug && console.log("@supabase/gotrue-js: navigatorLock: recovered (stolen)", r, i.name);
          try {
            return await t();
          } finally {
            q.debug && console.log("@supabase/gotrue-js: navigatorLock: released (stolen)", r, i.name);
          }
        } else
          return console.warn("@supabase/gotrue-js: Navigator LockManager returned null lock even with steal: true"), await t();
      }));
    throw n;
  }
}
function Fs() {
  if (typeof globalThis != "object")
    try {
      Object.defineProperty(Object.prototype, "__magic__", {
        get: function() {
          return this;
        },
        configurable: !0
      }), __magic__.globalThis = __magic__, delete Object.prototype.__magic__;
    } catch {
      typeof self < "u" && (self.globalThis = self);
    }
}
function Vt(r) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(r))
    throw new Error(`@supabase/auth-js: Address "${r}" is invalid.`);
  return r.toLowerCase();
}
function Ws(r) {
  return parseInt(r, 16);
}
function Ks(r) {
  const e = new TextEncoder().encode(r);
  return "0x" + Array.from(e, (s) => s.toString(16).padStart(2, "0")).join("");
}
function Vs(r) {
  var e;
  const { chainId: t, domain: s, expirationTime: n, issuedAt: i = /* @__PURE__ */ new Date(), nonce: a, notBefore: o, requestId: l, resources: c, scheme: u, uri: f, version: d } = r;
  {
    if (!Number.isInteger(t))
      throw new Error(`@supabase/auth-js: Invalid SIWE message field "chainId". Chain ID must be a EIP-155 chain ID. Provided value: ${t}`);
    if (!s)
      throw new Error('@supabase/auth-js: Invalid SIWE message field "domain". Domain must be provided.');
    if (a && a.length < 8)
      throw new Error(`@supabase/auth-js: Invalid SIWE message field "nonce". Nonce must be at least 8 characters. Provided value: ${a}`);
    if (!f)
      throw new Error('@supabase/auth-js: Invalid SIWE message field "uri". URI must be provided.');
    if (d !== "1")
      throw new Error(`@supabase/auth-js: Invalid SIWE message field "version". Version must be '1'. Provided value: ${d}`);
    if (!((e = r.statement) === null || e === void 0) && e.includes(`
`))
      throw new Error(`@supabase/auth-js: Invalid SIWE message field "statement". Statement must not include '\\n'. Provided value: ${r.statement}`);
  }
  const h = Vt(r.address), p = u ? `${u}://${s}` : s, g = r.statement ? `${r.statement}
` : "", _ = `${p} wants you to sign in with your Ethereum account:
${h}

${g}`;
  let y = `URI: ${f}
Version: ${d}
Chain ID: ${t}${a ? `
Nonce: ${a}` : ""}
Issued At: ${i.toISOString()}`;
  if (n && (y += `
Expiration Time: ${n.toISOString()}`), o && (y += `
Not Before: ${o.toISOString()}`), l && (y += `
Request ID: ${l}`), c) {
    let w = `
Resources:`;
    for (const m of c) {
      if (!m || typeof m != "string")
        throw new Error(`@supabase/auth-js: Invalid SIWE message field "resources". Every resource must be a valid string. Provided value: ${m}`);
      w += `
- ${m}`;
    }
    y += w;
  }
  return `${_}
${y}`;
}
class O extends Error {
  constructor({ message: e, code: t, cause: s, name: n }) {
    var i;
    super(e, { cause: s }), this.__isWebAuthnError = !0, this.name = (i = n ?? (s instanceof Error ? s.name : void 0)) !== null && i !== void 0 ? i : "Unknown Error", this.code = t;
  }
}
class $e extends O {
  constructor(e, t) {
    super({
      code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
      cause: t,
      message: e
    }), this.name = "WebAuthnUnknownError", this.originalError = t;
  }
}
function Gs({ error: r, options: e }) {
  var t, s, n;
  const { publicKey: i } = e;
  if (!i)
    throw Error("options was missing required publicKey property");
  if (r.name === "AbortError") {
    if (e.signal instanceof AbortSignal)
      return new O({
        message: "Registration ceremony was sent an abort signal",
        code: "ERROR_CEREMONY_ABORTED",
        cause: r
      });
  } else if (r.name === "ConstraintError") {
    if (((t = i.authenticatorSelection) === null || t === void 0 ? void 0 : t.requireResidentKey) === !0)
      return new O({
        message: "Discoverable credentials were required but no available authenticator supported it",
        code: "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT",
        cause: r
      });
    if (
      // @ts-ignore: `mediation` doesn't yet exist on CredentialCreationOptions but it's possible as of Sept 2024
      e.mediation === "conditional" && ((s = i.authenticatorSelection) === null || s === void 0 ? void 0 : s.userVerification) === "required"
    )
      return new O({
        message: "User verification was required during automatic registration but it could not be performed",
        code: "ERROR_AUTO_REGISTER_USER_VERIFICATION_FAILURE",
        cause: r
      });
    if (((n = i.authenticatorSelection) === null || n === void 0 ? void 0 : n.userVerification) === "required")
      return new O({
        message: "User verification was required but no available authenticator supported it",
        code: "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT",
        cause: r
      });
  } else {
    if (r.name === "InvalidStateError")
      return new O({
        message: "The authenticator was previously registered",
        code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED",
        cause: r
      });
    if (r.name === "NotAllowedError")
      return new O({
        message: r.message,
        code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
        cause: r
      });
    if (r.name === "NotSupportedError")
      return i.pubKeyCredParams.filter((o) => o.type === "public-key").length === 0 ? new O({
        message: 'No entry in pubKeyCredParams was of type "public-key"',
        code: "ERROR_MALFORMED_PUBKEYCREDPARAMS",
        cause: r
      }) : new O({
        message: "No available authenticator supported any of the specified pubKeyCredParams algorithms",
        code: "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG",
        cause: r
      });
    if (r.name === "SecurityError") {
      const a = window.location.hostname;
      if (Gt(a)) {
        if (i.rp.id !== a)
          return new O({
            message: `The RP ID "${i.rp.id}" is invalid for this domain`,
            code: "ERROR_INVALID_RP_ID",
            cause: r
          });
      } else return new O({
        message: `${window.location.hostname} is an invalid domain`,
        code: "ERROR_INVALID_DOMAIN",
        cause: r
      });
    } else if (r.name === "TypeError") {
      if (i.user.id.byteLength < 1 || i.user.id.byteLength > 64)
        return new O({
          message: "User ID was not between 1 and 64 characters",
          code: "ERROR_INVALID_USER_ID_LENGTH",
          cause: r
        });
    } else if (r.name === "UnknownError")
      return new O({
        message: "The authenticator was unable to process the specified options, or could not create a new credential",
        code: "ERROR_AUTHENTICATOR_GENERAL_ERROR",
        cause: r
      });
  }
  return new O({
    message: "a Non-Webauthn related error has occurred",
    code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
    cause: r
  });
}
function Hs({ error: r, options: e }) {
  const { publicKey: t } = e;
  if (!t)
    throw Error("options was missing required publicKey property");
  if (r.name === "AbortError") {
    if (e.signal instanceof AbortSignal)
      return new O({
        message: "Authentication ceremony was sent an abort signal",
        code: "ERROR_CEREMONY_ABORTED",
        cause: r
      });
  } else {
    if (r.name === "NotAllowedError")
      return new O({
        message: r.message,
        code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
        cause: r
      });
    if (r.name === "SecurityError") {
      const s = window.location.hostname;
      if (Gt(s)) {
        if (t.rpId !== s)
          return new O({
            message: `The RP ID "${t.rpId}" is invalid for this domain`,
            code: "ERROR_INVALID_RP_ID",
            cause: r
          });
      } else return new O({
        message: `${window.location.hostname} is an invalid domain`,
        code: "ERROR_INVALID_DOMAIN",
        cause: r
      });
    } else if (r.name === "UnknownError")
      return new O({
        message: "The authenticator was unable to process the specified options, or could not create a new assertion signature",
        code: "ERROR_AUTHENTICATOR_GENERAL_ERROR",
        cause: r
      });
  }
  return new O({
    message: "a Non-Webauthn related error has occurred",
    code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
    cause: r
  });
}
class Xs {
  /**
   * Create an abort signal for a new WebAuthn operation.
   * Automatically cancels any existing operation.
   *
   * @returns {AbortSignal} Signal to pass to navigator.credentials.create() or .get()
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal MDN - AbortSignal}
   */
  createNewAbortSignal() {
    if (this.controller) {
      const t = new Error("Cancelling existing WebAuthn API call for new one");
      t.name = "AbortError", this.controller.abort(t);
    }
    const e = new AbortController();
    return this.controller = e, e.signal;
  }
  /**
   * Manually cancel the current WebAuthn operation.
   * Useful for cleaning up when user cancels or navigates away.
   *
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort MDN - AbortController.abort}
   */
  cancelCeremony() {
    if (this.controller) {
      const e = new Error("Manually cancelling existing WebAuthn API call");
      e.name = "AbortError", this.controller.abort(e), this.controller = void 0;
    }
  }
}
const zs = new Xs();
function Js(r) {
  if (!r)
    throw new Error("Credential creation options are required");
  if (typeof PublicKeyCredential < "u" && "parseCreationOptionsFromJSON" in PublicKeyCredential && typeof PublicKeyCredential.parseCreationOptionsFromJSON == "function")
    return PublicKeyCredential.parseCreationOptionsFromJSON(
      /** we assert the options here as typescript still doesn't know about future webauthn types */
      r
    );
  const { challenge: e, user: t, excludeCredentials: s } = r, n = Ne(
    r,
    ["challenge", "user", "excludeCredentials"]
  ), i = he(e).buffer, a = Object.assign(Object.assign({}, t), { id: he(t.id).buffer }), o = Object.assign(Object.assign({}, n), {
    challenge: i,
    user: a
  });
  if (s && s.length > 0) {
    o.excludeCredentials = new Array(s.length);
    for (let l = 0; l < s.length; l++) {
      const c = s[l];
      o.excludeCredentials[l] = Object.assign(Object.assign({}, c), {
        id: he(c.id).buffer,
        type: c.type || "public-key",
        // Cast transports to handle future transport types like "cable"
        transports: c.transports
      });
    }
  }
  return o;
}
function Ys(r) {
  if (!r)
    throw new Error("Credential request options are required");
  if (typeof PublicKeyCredential < "u" && "parseRequestOptionsFromJSON" in PublicKeyCredential && typeof PublicKeyCredential.parseRequestOptionsFromJSON == "function")
    return PublicKeyCredential.parseRequestOptionsFromJSON(r);
  const { challenge: e, allowCredentials: t } = r, s = Ne(
    r,
    ["challenge", "allowCredentials"]
  ), n = he(e).buffer, i = Object.assign(Object.assign({}, s), { challenge: n });
  if (t && t.length > 0) {
    i.allowCredentials = new Array(t.length);
    for (let a = 0; a < t.length; a++) {
      const o = t[a];
      i.allowCredentials[a] = Object.assign(Object.assign({}, o), {
        id: he(o.id).buffer,
        type: o.type || "public-key",
        // Cast transports to handle future transport types like "cable"
        transports: o.transports
      });
    }
  }
  return i;
}
function Qs(r) {
  var e;
  if ("toJSON" in r && typeof r.toJSON == "function")
    return r.toJSON();
  const t = r;
  return {
    id: r.id,
    rawId: r.id,
    response: {
      attestationObject: Q(new Uint8Array(r.response.attestationObject)),
      clientDataJSON: Q(new Uint8Array(r.response.clientDataJSON))
    },
    type: "public-key",
    clientExtensionResults: r.getClientExtensionResults(),
    // Convert null to undefined and cast to AuthenticatorAttachment type
    authenticatorAttachment: (e = t.authenticatorAttachment) !== null && e !== void 0 ? e : void 0
  };
}
function Zs(r) {
  var e;
  if ("toJSON" in r && typeof r.toJSON == "function")
    return r.toJSON();
  const t = r, s = r.getClientExtensionResults(), n = r.response;
  return {
    id: r.id,
    rawId: r.id,
    // W3C spec expects rawId to match id for JSON format
    response: {
      authenticatorData: Q(new Uint8Array(n.authenticatorData)),
      clientDataJSON: Q(new Uint8Array(n.clientDataJSON)),
      signature: Q(new Uint8Array(n.signature)),
      userHandle: n.userHandle ? Q(new Uint8Array(n.userHandle)) : void 0
    },
    type: "public-key",
    clientExtensionResults: s,
    // Convert null to undefined and cast to AuthenticatorAttachment type
    authenticatorAttachment: (e = t.authenticatorAttachment) !== null && e !== void 0 ? e : void 0
  };
}
function Gt(r) {
  return (
    // Consider localhost valid as well since it's okay wrt Secure Contexts
    r === "localhost" || /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i.test(r)
  );
}
function Rt() {
  var r, e;
  return !!(j() && "PublicKeyCredential" in window && window.PublicKeyCredential && "credentials" in navigator && typeof ((r = navigator == null ? void 0 : navigator.credentials) === null || r === void 0 ? void 0 : r.create) == "function" && typeof ((e = navigator == null ? void 0 : navigator.credentials) === null || e === void 0 ? void 0 : e.get) == "function");
}
async function en(r) {
  try {
    const e = await navigator.credentials.create(
      /** we assert the type here until typescript types are updated */
      r
    );
    return e ? e instanceof PublicKeyCredential ? { data: e, error: null } : {
      data: null,
      error: new $e("Browser returned unexpected credential type", e)
    } : {
      data: null,
      error: new $e("Empty credential response", e)
    };
  } catch (e) {
    return {
      data: null,
      error: Gs({
        error: e,
        options: r
      })
    };
  }
}
async function tn(r) {
  try {
    const e = await navigator.credentials.get(
      /** we assert the type here until typescript types are updated */
      r
    );
    return e ? e instanceof PublicKeyCredential ? { data: e, error: null } : {
      data: null,
      error: new $e("Browser returned unexpected credential type", e)
    } : {
      data: null,
      error: new $e("Empty credential response", e)
    };
  } catch (e) {
    return {
      data: null,
      error: Hs({
        error: e,
        options: r
      })
    };
  }
}
const rn = {
  hints: ["security-key"],
  authenticatorSelection: {
    authenticatorAttachment: "cross-platform",
    requireResidentKey: !1,
    /** set to preferred because older yubikeys don't have PIN/Biometric */
    userVerification: "preferred",
    residentKey: "discouraged"
  },
  attestation: "direct"
}, sn = {
  /** set to preferred because older yubikeys don't have PIN/Biometric */
  userVerification: "preferred",
  hints: ["security-key"],
  attestation: "direct"
};
function Ue(...r) {
  const e = (n) => n !== null && typeof n == "object" && !Array.isArray(n), t = (n) => n instanceof ArrayBuffer || ArrayBuffer.isView(n), s = {};
  for (const n of r)
    if (n)
      for (const i in n) {
        const a = n[i];
        if (a !== void 0)
          if (Array.isArray(a))
            s[i] = a;
          else if (t(a))
            s[i] = a;
          else if (e(a)) {
            const o = s[i];
            e(o) ? s[i] = Ue(o, a) : s[i] = Ue(a);
          } else
            s[i] = a;
      }
  return s;
}
function nn(r, e) {
  return Ue(rn, r, e || {});
}
function an(r, e) {
  return Ue(sn, r, e || {});
}
class on {
  constructor(e) {
    this.client = e, this.enroll = this._enroll.bind(this), this.challenge = this._challenge.bind(this), this.verify = this._verify.bind(this), this.authenticate = this._authenticate.bind(this), this.register = this._register.bind(this);
  }
  /**
   * Enroll a new WebAuthn factor.
   * Creates an unverified WebAuthn factor that must be verified with a credential.
   *
   * @experimental This method is experimental and may change in future releases
   * @param {Omit<MFAEnrollWebauthnParams, 'factorType'>} params - Enrollment parameters (friendlyName required)
   * @returns {Promise<AuthMFAEnrollWebauthnResponse>} Enrolled factor details or error
   * @see {@link https://w3c.github.io/webauthn/#sctn-registering-a-new-credential W3C WebAuthn Spec - Registering a New Credential}
   */
  async _enroll(e) {
    return this.client.mfa.enroll(Object.assign(Object.assign({}, e), { factorType: "webauthn" }));
  }
  /**
   * Challenge for WebAuthn credential creation or authentication.
   * Combines server challenge with browser credential operations.
   * Handles both registration (create) and authentication (request) flows.
   *
   * @experimental This method is experimental and may change in future releases
   * @param {MFAChallengeWebauthnParams & { friendlyName?: string; signal?: AbortSignal }} params - Challenge parameters including factorId
   * @param {Object} overrides - Allows you to override the parameters passed to navigator.credentials
   * @param {PublicKeyCredentialCreationOptionsFuture} overrides.create - Override options for credential creation
   * @param {PublicKeyCredentialRequestOptionsFuture} overrides.request - Override options for credential request
   * @returns {Promise<RequestResult>} Challenge response with credential or error
   * @see {@link https://w3c.github.io/webauthn/#sctn-credential-creation W3C WebAuthn Spec - Credential Creation}
   * @see {@link https://w3c.github.io/webauthn/#sctn-verifying-assertion W3C WebAuthn Spec - Verifying Assertion}
   */
  async _challenge({ factorId: e, webauthn: t, friendlyName: s, signal: n }, i) {
    var a;
    try {
      const { data: o, error: l } = await this.client.mfa.challenge({
        factorId: e,
        webauthn: t
      });
      if (!o)
        return { data: null, error: l };
      const c = n ?? zs.createNewAbortSignal();
      if (o.webauthn.type === "create") {
        const { user: u } = o.webauthn.credential_options.publicKey;
        if (!u.name) {
          const f = s;
          if (f)
            u.name = `${u.id}:${f}`;
          else {
            const h = (await this.client.getUser()).data.user, p = ((a = h == null ? void 0 : h.user_metadata) === null || a === void 0 ? void 0 : a.name) || (h == null ? void 0 : h.email) || (h == null ? void 0 : h.id) || "User";
            u.name = `${u.id}:${p}`;
          }
        }
        u.displayName || (u.displayName = u.name);
      }
      switch (o.webauthn.type) {
        case "create": {
          const u = nn(o.webauthn.credential_options.publicKey, i == null ? void 0 : i.create), { data: f, error: d } = await en({
            publicKey: u,
            signal: c
          });
          return f ? {
            data: {
              factorId: e,
              challengeId: o.id,
              webauthn: {
                type: o.webauthn.type,
                credential_response: f
              }
            },
            error: null
          } : { data: null, error: d };
        }
        case "request": {
          const u = an(o.webauthn.credential_options.publicKey, i == null ? void 0 : i.request), { data: f, error: d } = await tn(Object.assign(Object.assign({}, o.webauthn.credential_options), { publicKey: u, signal: c }));
          return f ? {
            data: {
              factorId: e,
              challengeId: o.id,
              webauthn: {
                type: o.webauthn.type,
                credential_response: f
              }
            },
            error: null
          } : { data: null, error: d };
        }
      }
    } catch (o) {
      return v(o) ? { data: null, error: o } : {
        data: null,
        error: new Y("Unexpected error in challenge", o)
      };
    }
  }
  /**
   * Verify a WebAuthn credential with the server.
   * Completes the WebAuthn ceremony by sending the credential to the server for verification.
   *
   * @experimental This method is experimental and may change in future releases
   * @param {Object} params - Verification parameters
   * @param {string} params.challengeId - ID of the challenge being verified
   * @param {string} params.factorId - ID of the WebAuthn factor
   * @param {MFAVerifyWebauthnParams<T>['webauthn']} params.webauthn - WebAuthn credential response
   * @returns {Promise<AuthMFAVerifyResponse>} Verification result with session or error
   * @see {@link https://w3c.github.io/webauthn/#sctn-verifying-assertion W3C WebAuthn Spec - Verifying an Authentication Assertion}
   * */
  async _verify({ challengeId: e, factorId: t, webauthn: s }) {
    return this.client.mfa.verify({
      factorId: t,
      challengeId: e,
      webauthn: s
    });
  }
  /**
   * Complete WebAuthn authentication flow.
   * Performs challenge and verification in a single operation for existing credentials.
   *
   * @experimental This method is experimental and may change in future releases
   * @param {Object} params - Authentication parameters
   * @param {string} params.factorId - ID of the WebAuthn factor to authenticate with
   * @param {Object} params.webauthn - WebAuthn configuration
   * @param {string} params.webauthn.rpId - Relying Party ID (defaults to current hostname)
   * @param {string[]} params.webauthn.rpOrigins - Allowed origins (defaults to current origin)
   * @param {AbortSignal} params.webauthn.signal - Optional abort signal
   * @param {PublicKeyCredentialRequestOptionsFuture} overrides - Override options for navigator.credentials.get
   * @returns {Promise<RequestResult<AuthMFAVerifyResponseData, WebAuthnError | AuthError>>} Authentication result
   * @see {@link https://w3c.github.io/webauthn/#sctn-authentication W3C WebAuthn Spec - Authentication Ceremony}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredentialRequestOptions MDN - PublicKeyCredentialRequestOptions}
   */
  async _authenticate({ factorId: e, webauthn: { rpId: t = typeof window < "u" ? window.location.hostname : void 0, rpOrigins: s = typeof window < "u" ? [window.location.origin] : void 0, signal: n } = {} }, i) {
    if (!t)
      return {
        data: null,
        error: new Ee("rpId is required for WebAuthn authentication")
      };
    try {
      if (!Rt())
        return {
          data: null,
          error: new Y("Browser does not support WebAuthn", null)
        };
      const { data: a, error: o } = await this.challenge({
        factorId: e,
        webauthn: { rpId: t, rpOrigins: s },
        signal: n
      }, { request: i });
      if (!a)
        return { data: null, error: o };
      const { webauthn: l } = a;
      return this._verify({
        factorId: e,
        challengeId: a.challengeId,
        webauthn: {
          type: l.type,
          rpId: t,
          rpOrigins: s,
          credential_response: l.credential_response
        }
      });
    } catch (a) {
      return v(a) ? { data: null, error: a } : {
        data: null,
        error: new Y("Unexpected error in authenticate", a)
      };
    }
  }
  /**
   * Complete WebAuthn registration flow.
   * Performs enrollment, challenge, and verification in a single operation for new credentials.
   *
   * @experimental This method is experimental and may change in future releases
   * @param {Object} params - Registration parameters
   * @param {string} params.friendlyName - User-friendly name for the credential
   * @param {string} params.rpId - Relying Party ID (defaults to current hostname)
   * @param {string[]} params.rpOrigins - Allowed origins (defaults to current origin)
   * @param {AbortSignal} params.signal - Optional abort signal
   * @param {PublicKeyCredentialCreationOptionsFuture} overrides - Override options for navigator.credentials.create
   * @returns {Promise<RequestResult<AuthMFAVerifyResponseData, WebAuthnError | AuthError>>} Registration result
   * @see {@link https://w3c.github.io/webauthn/#sctn-registering-a-new-credential W3C WebAuthn Spec - Registration Ceremony}
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredentialCreationOptions MDN - PublicKeyCredentialCreationOptions}
   */
  async _register({ friendlyName: e, webauthn: { rpId: t = typeof window < "u" ? window.location.hostname : void 0, rpOrigins: s = typeof window < "u" ? [window.location.origin] : void 0, signal: n } = {} }, i) {
    if (!t)
      return {
        data: null,
        error: new Ee("rpId is required for WebAuthn registration")
      };
    try {
      if (!Rt())
        return {
          data: null,
          error: new Y("Browser does not support WebAuthn", null)
        };
      const { data: a, error: o } = await this._enroll({
        friendlyName: e
      });
      if (!a)
        return await this.client.mfa.listFactors().then((u) => {
          var f;
          return (f = u.data) === null || f === void 0 ? void 0 : f.all.find((d) => d.factor_type === "webauthn" && d.friendly_name === e && d.status !== "unverified");
        }).then((u) => u ? this.client.mfa.unenroll({ factorId: u == null ? void 0 : u.id }) : void 0), { data: null, error: o };
      const { data: l, error: c } = await this._challenge({
        factorId: a.id,
        friendlyName: a.friendly_name,
        webauthn: { rpId: t, rpOrigins: s },
        signal: n
      }, {
        create: i
      });
      return l ? this._verify({
        factorId: a.id,
        challengeId: l.challengeId,
        webauthn: {
          rpId: t,
          rpOrigins: s,
          type: l.webauthn.type,
          credential_response: l.webauthn.credential_response
        }
      }) : { data: null, error: c };
    } catch (a) {
      return v(a) ? { data: null, error: a } : {
        data: null,
        error: new Y("Unexpected error in register", a)
      };
    }
  }
}
Fs();
const ln = {
  url: ss,
  storageKey: ns,
  autoRefreshToken: !0,
  persistSession: !0,
  detectSessionInUrl: !0,
  headers: is,
  flowType: "implicit",
  debug: !1,
  hasCustomAuthorizationHeader: !1,
  throwOnError: !1,
  lockAcquireTimeout: 5e3,
  // 5 seconds
  skipAutoInitialize: !1
};
async function At(r, e, t) {
  return await t();
}
const ne = {};
class Te {
  /**
   * The JWKS used for verifying asymmetric JWTs
   */
  get jwks() {
    var e, t;
    return (t = (e = ne[this.storageKey]) === null || e === void 0 ? void 0 : e.jwks) !== null && t !== void 0 ? t : { keys: [] };
  }
  set jwks(e) {
    ne[this.storageKey] = Object.assign(Object.assign({}, ne[this.storageKey]), { jwks: e });
  }
  get jwks_cached_at() {
    var e, t;
    return (t = (e = ne[this.storageKey]) === null || e === void 0 ? void 0 : e.cachedAt) !== null && t !== void 0 ? t : Number.MIN_SAFE_INTEGER;
  }
  set jwks_cached_at(e) {
    ne[this.storageKey] = Object.assign(Object.assign({}, ne[this.storageKey]), { cachedAt: e });
  }
  /**
   * Create a new client for use in the browser.
   *
   * @example
   * ```ts
   * import { GoTrueClient } from '@supabase/auth-js'
   *
   * const auth = new GoTrueClient({
   *   url: 'https://xyzcompany.supabase.co/auth/v1',
   *   headers: { apikey: 'public-anon-key' },
   *   storageKey: 'supabase-auth',
   * })
   * ```
   */
  constructor(e) {
    var t, s, n;
    this.userStorage = null, this.memoryStorage = null, this.stateChangeEmitters = /* @__PURE__ */ new Map(), this.autoRefreshTicker = null, this.autoRefreshTickTimeout = null, this.visibilityChangedCallback = null, this.refreshingDeferred = null, this.initializePromise = null, this.detectSessionInUrl = !0, this.hasCustomAuthorizationHeader = !1, this.suppressGetSessionWarning = !1, this.lockAcquired = !1, this.pendingInLock = [], this.broadcastChannel = null, this.logger = console.log;
    const i = Object.assign(Object.assign({}, ln), e);
    if (this.storageKey = i.storageKey, this.instanceID = (t = Te.nextInstanceID[this.storageKey]) !== null && t !== void 0 ? t : 0, Te.nextInstanceID[this.storageKey] = this.instanceID + 1, this.logDebugMessages = !!i.debug, typeof i.debug == "function" && (this.logger = i.debug), this.instanceID > 0 && j()) {
      const a = `${this._logPrefix()} Multiple GoTrueClient instances detected in the same browser context. It is not an error, but this should be avoided as it may produce undefined behavior when used concurrently under the same storage key.`;
      console.warn(a), this.logDebugMessages && console.trace(a);
    }
    if (this.persistSession = i.persistSession, this.autoRefreshToken = i.autoRefreshToken, this.admin = new Bs({
      url: i.url,
      headers: i.headers,
      fetch: i.fetch
    }), this.url = i.url, this.headers = i.headers, this.fetch = Wt(i.fetch), this.lock = i.lock || At, this.detectSessionInUrl = i.detectSessionInUrl, this.flowType = i.flowType, this.hasCustomAuthorizationHeader = i.hasCustomAuthorizationHeader, this.throwOnError = i.throwOnError, this.lockAcquireTimeout = i.lockAcquireTimeout, i.lock ? this.lock = i.lock : this.persistSession && j() && (!((s = globalThis == null ? void 0 : globalThis.navigator) === null || s === void 0) && s.locks) ? this.lock = Ms : this.lock = At, this.jwks || (this.jwks = { keys: [] }, this.jwks_cached_at = Number.MIN_SAFE_INTEGER), this.mfa = {
      verify: this._verify.bind(this),
      enroll: this._enroll.bind(this),
      unenroll: this._unenroll.bind(this),
      challenge: this._challenge.bind(this),
      listFactors: this._listFactors.bind(this),
      challengeAndVerify: this._challengeAndVerify.bind(this),
      getAuthenticatorAssuranceLevel: this._getAuthenticatorAssuranceLevel.bind(this),
      webauthn: new on(this)
    }, this.oauth = {
      getAuthorizationDetails: this._getAuthorizationDetails.bind(this),
      approveAuthorization: this._approveAuthorization.bind(this),
      denyAuthorization: this._denyAuthorization.bind(this),
      listGrants: this._listOAuthGrants.bind(this),
      revokeGrant: this._revokeOAuthGrant.bind(this)
    }, this.persistSession ? (i.storage ? this.storage = i.storage : Ft() ? this.storage = globalThis.localStorage : (this.memoryStorage = {}, this.storage = kt(this.memoryStorage)), i.userStorage && (this.userStorage = i.userStorage)) : (this.memoryStorage = {}, this.storage = kt(this.memoryStorage)), j() && globalThis.BroadcastChannel && this.persistSession && this.storageKey) {
      try {
        this.broadcastChannel = new globalThis.BroadcastChannel(this.storageKey);
      } catch (a) {
        console.error("Failed to create a new BroadcastChannel, multi-tab state changes will not be available", a);
      }
      (n = this.broadcastChannel) === null || n === void 0 || n.addEventListener("message", async (a) => {
        this._debug("received broadcast notification from other tab or client", a);
        try {
          await this._notifyAllSubscribers(a.data.event, a.data.session, !1);
        } catch (o) {
          this._debug("#broadcastChannel", "error", o);
        }
      });
    }
    i.skipAutoInitialize || this.initialize().catch((a) => {
      this._debug("#initialize()", "error", a);
    });
  }
  /**
   * Returns whether error throwing mode is enabled for this client.
   */
  isThrowOnErrorEnabled() {
    return this.throwOnError;
  }
  /**
   * Centralizes return handling with optional error throwing. When `throwOnError` is enabled
   * and the provided result contains a non-nullish error, the error is thrown instead of
   * being returned. This ensures consistent behavior across all public API methods.
   */
  _returnResult(e) {
    if (this.throwOnError && e && e.error)
      throw e.error;
    return e;
  }
  _logPrefix() {
    return `GoTrueClient@${this.storageKey}:${this.instanceID} (${Bt}) ${(/* @__PURE__ */ new Date()).toISOString()}`;
  }
  _debug(...e) {
    return this.logDebugMessages && this.logger(this._logPrefix(), ...e), this;
  }
  /**
   * Initializes the client session either from the url or from storage.
   * This method is automatically called when instantiating the client, but should also be called
   * manually when checking for an error from an auth redirect (oauth, magiclink, password recovery, etc).
   */
  async initialize() {
    return this.initializePromise ? await this.initializePromise : (this.initializePromise = (async () => await this._acquireLock(this.lockAcquireTimeout, async () => await this._initialize()))(), await this.initializePromise);
  }
  /**
   * IMPORTANT:
   * 1. Never throw in this method, as it is called from the constructor
   * 2. Never return a session from this method as it would be cached over
   *    the whole lifetime of the client
   */
  async _initialize() {
    var e;
    try {
      let t = {}, s = "none";
      if (j() && (t = vs(window.location.href), this._isImplicitGrantCallback(t) ? s = "implicit" : await this._isPKCECallback(t) && (s = "pkce")), j() && this.detectSessionInUrl && s !== "none") {
        const { data: n, error: i } = await this._getSessionFromURL(t, s);
        if (i) {
          if (this._debug("#_initialize()", "error detecting session from URL", i), us(i)) {
            const l = (e = i.details) === null || e === void 0 ? void 0 : e.code;
            if (l === "identity_already_exists" || l === "identity_not_found" || l === "single_identity_not_deletable")
              return { error: i };
          }
          return { error: i };
        }
        const { session: a, redirectType: o } = n;
        return this._debug("#_initialize()", "detected session in URL", a, "redirect type", o), await this._saveSession(a), setTimeout(async () => {
          o === "recovery" ? await this._notifyAllSubscribers("PASSWORD_RECOVERY", a) : await this._notifyAllSubscribers("SIGNED_IN", a);
        }, 0), { error: null };
      }
      return await this._recoverAndRefresh(), { error: null };
    } catch (t) {
      return v(t) ? this._returnResult({ error: t }) : this._returnResult({
        error: new Y("Unexpected error during initialization", t)
      });
    } finally {
      await this._handleVisibilityChange(), this._debug("#_initialize()", "end");
    }
  }
  /**
   * Creates a new anonymous user.
   *
   * @returns A session where the is_anonymous claim in the access token JWT set to true
   */
  async signInAnonymously(e) {
    var t, s, n;
    try {
      const i = await b(this.fetch, "POST", `${this.url}/signup`, {
        headers: this.headers,
        body: {
          data: (s = (t = e == null ? void 0 : e.options) === null || t === void 0 ? void 0 : t.data) !== null && s !== void 0 ? s : {},
          gotrue_meta_security: { captcha_token: (n = e == null ? void 0 : e.options) === null || n === void 0 ? void 0 : n.captchaToken }
        },
        xform: x
      }), { data: a, error: o } = i;
      if (o || !a)
        return this._returnResult({ data: { user: null, session: null }, error: o });
      const l = a.session, c = a.user;
      return a.session && (await this._saveSession(a.session), await this._notifyAllSubscribers("SIGNED_IN", l)), this._returnResult({ data: { user: c, session: l }, error: null });
    } catch (i) {
      if (v(i))
        return this._returnResult({ data: { user: null, session: null }, error: i });
      throw i;
    }
  }
  /**
   * Creates a new user.
   *
   * Be aware that if a user account exists in the system you may get back an
   * error message that attempts to hide this information from the user.
   * This method has support for PKCE via email signups. The PKCE flow cannot be used when autoconfirm is enabled.
   *
   * @returns A logged-in session if the server has "autoconfirm" ON
   * @returns A user if the server has "autoconfirm" OFF
   *
   * @category Auth
   *
   * @remarks
   * - By default, the user needs to verify their email address before logging in. To turn this off, disable **Confirm email** in [your project](/dashboard/project/_/auth/providers).
   * - **Confirm email** determines if users need to confirm their email address after signing up.
   *   - If **Confirm email** is enabled, a `user` is returned but `session` is null.
   *   - If **Confirm email** is disabled, both a `user` and a `session` are returned.
   * - When the user confirms their email address, they are redirected to the [`SITE_URL`](/docs/guides/auth/redirect-urls#use-wildcards-in-redirect-urls) by default. You can modify your `SITE_URL` or add additional redirect URLs in [your project](/dashboard/project/_/auth/url-configuration).
   * - If signUp() is called for an existing confirmed user:
   *   - When both **Confirm email** and **Confirm phone** (even when phone provider is disabled) are enabled in [your project](/dashboard/project/_/auth/providers), an obfuscated/fake user object is returned.
   *   - When either **Confirm email** or **Confirm phone** (even when phone provider is disabled) is disabled, the error message, `User already registered` is returned.
   * - To fetch the currently logged-in user, refer to [`getUser()`](/docs/reference/javascript/auth-getuser).
   *
   * @example Sign up with an email and password
   * ```js
   * const { data, error } = await supabase.auth.signUp({
   *   email: 'example@email.com',
   *   password: 'example-password',
   * })
   * ```
   *
   * @exampleResponse Sign up with an email and password
   * ```json
   * // Some fields may be null if "confirm email" is enabled.
   * {
   *   "data": {
   *     "user": {
   *       "id": "11111111-1111-1111-1111-111111111111",
   *       "aud": "authenticated",
   *       "role": "authenticated",
   *       "email": "example@email.com",
   *       "email_confirmed_at": "2024-01-01T00:00:00Z",
   *       "phone": "",
   *       "last_sign_in_at": "2024-01-01T00:00:00Z",
   *       "app_metadata": {
   *         "provider": "email",
   *         "providers": [
   *           "email"
   *         ]
   *       },
   *       "user_metadata": {},
   *       "identities": [
   *         {
   *           "identity_id": "22222222-2222-2222-2222-222222222222",
   *           "id": "11111111-1111-1111-1111-111111111111",
   *           "user_id": "11111111-1111-1111-1111-111111111111",
   *           "identity_data": {
   *             "email": "example@email.com",
   *             "email_verified": false,
   *             "phone_verified": false,
   *             "sub": "11111111-1111-1111-1111-111111111111"
   *           },
   *           "provider": "email",
   *           "last_sign_in_at": "2024-01-01T00:00:00Z",
   *           "created_at": "2024-01-01T00:00:00Z",
   *           "updated_at": "2024-01-01T00:00:00Z",
   *           "email": "example@email.com"
   *         }
   *       ],
   *       "created_at": "2024-01-01T00:00:00Z",
   *       "updated_at": "2024-01-01T00:00:00Z"
   *     },
   *     "session": {
   *       "access_token": "<ACCESS_TOKEN>",
   *       "token_type": "bearer",
   *       "expires_in": 3600,
   *       "expires_at": 1700000000,
   *       "refresh_token": "<REFRESH_TOKEN>",
   *       "user": {
   *         "id": "11111111-1111-1111-1111-111111111111",
   *         "aud": "authenticated",
   *         "role": "authenticated",
   *         "email": "example@email.com",
   *         "email_confirmed_at": "2024-01-01T00:00:00Z",
   *         "phone": "",
   *         "last_sign_in_at": "2024-01-01T00:00:00Z",
   *         "app_metadata": {
   *           "provider": "email",
   *           "providers": [
   *             "email"
   *           ]
   *         },
   *         "user_metadata": {},
   *         "identities": [
   *           {
   *             "identity_id": "22222222-2222-2222-2222-222222222222",
   *             "id": "11111111-1111-1111-1111-111111111111",
   *             "user_id": "11111111-1111-1111-1111-111111111111",
   *             "identity_data": {
   *               "email": "example@email.com",
   *               "email_verified": false,
   *               "phone_verified": false,
   *               "sub": "11111111-1111-1111-1111-111111111111"
   *             },
   *             "provider": "email",
   *             "last_sign_in_at": "2024-01-01T00:00:00Z",
   *             "created_at": "2024-01-01T00:00:00Z",
   *             "updated_at": "2024-01-01T00:00:00Z",
   *             "email": "example@email.com"
   *           }
   *         ],
   *         "created_at": "2024-01-01T00:00:00Z",
   *         "updated_at": "2024-01-01T00:00:00Z"
   *       }
   *     }
   *   },
   *   "error": null
   * }
   * ```
   *
   * @example Sign up with a phone number and password (SMS)
   * ```js
   * const { data, error } = await supabase.auth.signUp({
   *   phone: '123456789',
   *   password: 'example-password',
   *   options: {
   *     channel: 'sms'
   *   }
   * })
   * ```
   *
   * @exampleDescription Sign up with a phone number and password (whatsapp)
   * The user will be sent a WhatsApp message which contains a OTP. By default, a given user can only request a OTP once every 60 seconds. Note that a user will need to have a valid WhatsApp account that is linked to Twilio in order to use this feature.
   *
   * @example Sign up with a phone number and password (whatsapp)
   * ```js
   * const { data, error } = await supabase.auth.signUp({
   *   phone: '123456789',
   *   password: 'example-password',
   *   options: {
   *     channel: 'whatsapp'
   *   }
   * })
   * ```
   *
   * @example Sign up with additional user metadata
   * ```js
   * const { data, error } = await supabase.auth.signUp(
   *   {
   *     email: 'example@email.com',
   *     password: 'example-password',
   *     options: {
   *       data: {
   *         first_name: 'John',
   *         age: 27,
   *       }
   *     }
   *   }
   * )
   * ```
   *
   * @exampleDescription Sign up with a redirect URL
   * - See [redirect URLs and wildcards](/docs/guides/auth/redirect-urls#use-wildcards-in-redirect-urls) to add additional redirect URLs to your project.
   *
   * @example Sign up with a redirect URL
   * ```js
   * const { data, error } = await supabase.auth.signUp(
   *   {
   *     email: 'example@email.com',
   *     password: 'example-password',
   *     options: {
   *       emailRedirectTo: 'https://example.com/welcome'
   *     }
   *   }
   * )
   * ```
   */
  async signUp(e) {
    var t, s, n;
    try {
      let i;
      if ("email" in e) {
        const { email: u, password: f, options: d } = e;
        let h = null, p = null;
        this.flowType === "pkce" && ([h, p] = await re(this.storage, this.storageKey)), i = await b(this.fetch, "POST", `${this.url}/signup`, {
          headers: this.headers,
          redirectTo: d == null ? void 0 : d.emailRedirectTo,
          body: {
            email: u,
            password: f,
            data: (t = d == null ? void 0 : d.data) !== null && t !== void 0 ? t : {},
            gotrue_meta_security: { captcha_token: d == null ? void 0 : d.captchaToken },
            code_challenge: h,
            code_challenge_method: p
          },
          xform: x
        });
      } else if ("phone" in e) {
        const { phone: u, password: f, options: d } = e;
        i = await b(this.fetch, "POST", `${this.url}/signup`, {
          headers: this.headers,
          body: {
            phone: u,
            password: f,
            data: (s = d == null ? void 0 : d.data) !== null && s !== void 0 ? s : {},
            channel: (n = d == null ? void 0 : d.channel) !== null && n !== void 0 ? n : "sms",
            gotrue_meta_security: { captcha_token: d == null ? void 0 : d.captchaToken }
          },
          xform: x
        });
      } else
        throw new Ie("You must provide either an email or phone number and a password");
      const { data: a, error: o } = i;
      if (o || !a)
        return await C(this.storage, `${this.storageKey}-code-verifier`), this._returnResult({ data: { user: null, session: null }, error: o });
      const l = a.session, c = a.user;
      return a.session && (await this._saveSession(a.session), await this._notifyAllSubscribers("SIGNED_IN", l)), this._returnResult({ data: { user: c, session: l }, error: null });
    } catch (i) {
      if (await C(this.storage, `${this.storageKey}-code-verifier`), v(i))
        return this._returnResult({ data: { user: null, session: null }, error: i });
      throw i;
    }
  }
  /**
   * Log in an existing user with an email and password or phone and password.
   *
   * Be aware that you may get back an error message that will not distinguish
   * between the cases where the account does not exist or that the
   * email/phone and password combination is wrong or that the account can only
   * be accessed via social login.
   */
  async signInWithPassword(e) {
    try {
      let t;
      if ("email" in e) {
        const { email: i, password: a, options: o } = e;
        t = await b(this.fetch, "POST", `${this.url}/token?grant_type=password`, {
          headers: this.headers,
          body: {
            email: i,
            password: a,
            gotrue_meta_security: { captcha_token: o == null ? void 0 : o.captchaToken }
          },
          xform: Tt
        });
      } else if ("phone" in e) {
        const { phone: i, password: a, options: o } = e;
        t = await b(this.fetch, "POST", `${this.url}/token?grant_type=password`, {
          headers: this.headers,
          body: {
            phone: i,
            password: a,
            gotrue_meta_security: { captcha_token: o == null ? void 0 : o.captchaToken }
          },
          xform: Tt
        });
      } else
        throw new Ie("You must provide either an email or phone number and a password");
      const { data: s, error: n } = t;
      if (n)
        return this._returnResult({ data: { user: null, session: null }, error: n });
      if (!s || !s.session || !s.user) {
        const i = new te();
        return this._returnResult({ data: { user: null, session: null }, error: i });
      }
      return s.session && (await this._saveSession(s.session), await this._notifyAllSubscribers("SIGNED_IN", s.session)), this._returnResult({
        data: Object.assign({ user: s.user, session: s.session }, s.weak_password ? { weakPassword: s.weak_password } : null),
        error: n
      });
    } catch (t) {
      if (v(t))
        return this._returnResult({ data: { user: null, session: null }, error: t });
      throw t;
    }
  }
  /**
   * Log in an existing user via a third-party provider.
   * This method supports the PKCE flow.
   */
  async signInWithOAuth(e) {
    var t, s, n, i;
    return await this._handleProviderSignIn(e.provider, {
      redirectTo: (t = e.options) === null || t === void 0 ? void 0 : t.redirectTo,
      scopes: (s = e.options) === null || s === void 0 ? void 0 : s.scopes,
      queryParams: (n = e.options) === null || n === void 0 ? void 0 : n.queryParams,
      skipBrowserRedirect: (i = e.options) === null || i === void 0 ? void 0 : i.skipBrowserRedirect
    });
  }
  /**
   * Log in an existing user by exchanging an Auth Code issued during the PKCE flow.
   */
  async exchangeCodeForSession(e) {
    return await this.initializePromise, this._acquireLock(this.lockAcquireTimeout, async () => this._exchangeCodeForSession(e));
  }
  /**
   * Signs in a user by verifying a message signed by the user's private key.
   * Supports Ethereum (via Sign-In-With-Ethereum) & Solana (Sign-In-With-Solana) standards,
   * both of which derive from the EIP-4361 standard
   * With slight variation on Solana's side.
   * @reference https://eips.ethereum.org/EIPS/eip-4361
   */
  async signInWithWeb3(e) {
    const { chain: t } = e;
    switch (t) {
      case "ethereum":
        return await this.signInWithEthereum(e);
      case "solana":
        return await this.signInWithSolana(e);
      default:
        throw new Error(`@supabase/auth-js: Unsupported chain "${t}"`);
    }
  }
  async signInWithEthereum(e) {
    var t, s, n, i, a, o, l, c, u, f, d;
    let h, p;
    if ("message" in e)
      h = e.message, p = e.signature;
    else {
      const { chain: g, wallet: _, statement: y, options: w } = e;
      let m;
      if (j())
        if (typeof _ == "object")
          m = _;
        else {
          const B = window;
          if ("ethereum" in B && typeof B.ethereum == "object" && "request" in B.ethereum && typeof B.ethereum.request == "function")
            m = B.ethereum;
          else
            throw new Error("@supabase/auth-js: No compatible Ethereum wallet interface on the window object (window.ethereum) detected. Make sure the user already has a wallet installed and connected for this app. Prefer passing the wallet interface object directly to signInWithWeb3({ chain: 'ethereum', wallet: resolvedUserWallet }) instead.");
        }
      else {
        if (typeof _ != "object" || !(w != null && w.url))
          throw new Error("@supabase/auth-js: Both wallet and url must be specified in non-browser environments.");
        m = _;
      }
      const T = new URL((t = w == null ? void 0 : w.url) !== null && t !== void 0 ? t : window.location.href), R = await m.request({
        method: "eth_requestAccounts"
      }).then((B) => B).catch(() => {
        throw new Error("@supabase/auth-js: Wallet method eth_requestAccounts is missing or invalid");
      });
      if (!R || R.length === 0)
        throw new Error("@supabase/auth-js: No accounts available. Please ensure the wallet is connected.");
      const S = Vt(R[0]);
      let I = (s = w == null ? void 0 : w.signInWithEthereum) === null || s === void 0 ? void 0 : s.chainId;
      if (!I) {
        const B = await m.request({
          method: "eth_chainId"
        });
        I = Ws(B);
      }
      const W = {
        domain: T.host,
        address: S,
        statement: y,
        uri: T.href,
        version: "1",
        chainId: I,
        nonce: (n = w == null ? void 0 : w.signInWithEthereum) === null || n === void 0 ? void 0 : n.nonce,
        issuedAt: (a = (i = w == null ? void 0 : w.signInWithEthereum) === null || i === void 0 ? void 0 : i.issuedAt) !== null && a !== void 0 ? a : /* @__PURE__ */ new Date(),
        expirationTime: (o = w == null ? void 0 : w.signInWithEthereum) === null || o === void 0 ? void 0 : o.expirationTime,
        notBefore: (l = w == null ? void 0 : w.signInWithEthereum) === null || l === void 0 ? void 0 : l.notBefore,
        requestId: (c = w == null ? void 0 : w.signInWithEthereum) === null || c === void 0 ? void 0 : c.requestId,
        resources: (u = w == null ? void 0 : w.signInWithEthereum) === null || u === void 0 ? void 0 : u.resources
      };
      h = Vs(W), p = await m.request({
        method: "personal_sign",
        params: [Ks(h), S]
      });
    }
    try {
      const { data: g, error: _ } = await b(this.fetch, "POST", `${this.url}/token?grant_type=web3`, {
        headers: this.headers,
        body: Object.assign({
          chain: "ethereum",
          message: h,
          signature: p
        }, !((f = e.options) === null || f === void 0) && f.captchaToken ? { gotrue_meta_security: { captcha_token: (d = e.options) === null || d === void 0 ? void 0 : d.captchaToken } } : null),
        xform: x
      });
      if (_)
        throw _;
      if (!g || !g.session || !g.user) {
        const y = new te();
        return this._returnResult({ data: { user: null, session: null }, error: y });
      }
      return g.session && (await this._saveSession(g.session), await this._notifyAllSubscribers("SIGNED_IN", g.session)), this._returnResult({ data: Object.assign({}, g), error: _ });
    } catch (g) {
      if (v(g))
        return this._returnResult({ data: { user: null, session: null }, error: g });
      throw g;
    }
  }
  async signInWithSolana(e) {
    var t, s, n, i, a, o, l, c, u, f, d, h;
    let p, g;
    if ("message" in e)
      p = e.message, g = e.signature;
    else {
      const { chain: _, wallet: y, statement: w, options: m } = e;
      let T;
      if (j())
        if (typeof y == "object")
          T = y;
        else {
          const S = window;
          if ("solana" in S && typeof S.solana == "object" && ("signIn" in S.solana && typeof S.solana.signIn == "function" || "signMessage" in S.solana && typeof S.solana.signMessage == "function"))
            T = S.solana;
          else
            throw new Error("@supabase/auth-js: No compatible Solana wallet interface on the window object (window.solana) detected. Make sure the user already has a wallet installed and connected for this app. Prefer passing the wallet interface object directly to signInWithWeb3({ chain: 'solana', wallet: resolvedUserWallet }) instead.");
        }
      else {
        if (typeof y != "object" || !(m != null && m.url))
          throw new Error("@supabase/auth-js: Both wallet and url must be specified in non-browser environments.");
        T = y;
      }
      const R = new URL((t = m == null ? void 0 : m.url) !== null && t !== void 0 ? t : window.location.href);
      if ("signIn" in T && T.signIn) {
        const S = await T.signIn(Object.assign(Object.assign(Object.assign({ issuedAt: (/* @__PURE__ */ new Date()).toISOString() }, m == null ? void 0 : m.signInWithSolana), {
          // non-overridable properties
          version: "1",
          domain: R.host,
          uri: R.href
        }), w ? { statement: w } : null));
        let I;
        if (Array.isArray(S) && S[0] && typeof S[0] == "object")
          I = S[0];
        else if (S && typeof S == "object" && "signedMessage" in S && "signature" in S)
          I = S;
        else
          throw new Error("@supabase/auth-js: Wallet method signIn() returned unrecognized value");
        if ("signedMessage" in I && "signature" in I && (typeof I.signedMessage == "string" || I.signedMessage instanceof Uint8Array) && I.signature instanceof Uint8Array)
          p = typeof I.signedMessage == "string" ? I.signedMessage : new TextDecoder().decode(I.signedMessage), g = I.signature;
        else
          throw new Error("@supabase/auth-js: Wallet method signIn() API returned object without signedMessage and signature fields");
      } else {
        if (!("signMessage" in T) || typeof T.signMessage != "function" || !("publicKey" in T) || typeof T != "object" || !T.publicKey || !("toBase58" in T.publicKey) || typeof T.publicKey.toBase58 != "function")
          throw new Error("@supabase/auth-js: Wallet does not have a compatible signMessage() and publicKey.toBase58() API");
        p = [
          `${R.host} wants you to sign in with your Solana account:`,
          T.publicKey.toBase58(),
          ...w ? ["", w, ""] : [""],
          "Version: 1",
          `URI: ${R.href}`,
          `Issued At: ${(n = (s = m == null ? void 0 : m.signInWithSolana) === null || s === void 0 ? void 0 : s.issuedAt) !== null && n !== void 0 ? n : (/* @__PURE__ */ new Date()).toISOString()}`,
          ...!((i = m == null ? void 0 : m.signInWithSolana) === null || i === void 0) && i.notBefore ? [`Not Before: ${m.signInWithSolana.notBefore}`] : [],
          ...!((a = m == null ? void 0 : m.signInWithSolana) === null || a === void 0) && a.expirationTime ? [`Expiration Time: ${m.signInWithSolana.expirationTime}`] : [],
          ...!((o = m == null ? void 0 : m.signInWithSolana) === null || o === void 0) && o.chainId ? [`Chain ID: ${m.signInWithSolana.chainId}`] : [],
          ...!((l = m == null ? void 0 : m.signInWithSolana) === null || l === void 0) && l.nonce ? [`Nonce: ${m.signInWithSolana.nonce}`] : [],
          ...!((c = m == null ? void 0 : m.signInWithSolana) === null || c === void 0) && c.requestId ? [`Request ID: ${m.signInWithSolana.requestId}`] : [],
          ...!((f = (u = m == null ? void 0 : m.signInWithSolana) === null || u === void 0 ? void 0 : u.resources) === null || f === void 0) && f.length ? [
            "Resources",
            ...m.signInWithSolana.resources.map((I) => `- ${I}`)
          ] : []
        ].join(`
`);
        const S = await T.signMessage(new TextEncoder().encode(p), "utf8");
        if (!S || !(S instanceof Uint8Array))
          throw new Error("@supabase/auth-js: Wallet signMessage() API returned an recognized value");
        g = S;
      }
    }
    try {
      const { data: _, error: y } = await b(this.fetch, "POST", `${this.url}/token?grant_type=web3`, {
        headers: this.headers,
        body: Object.assign({ chain: "solana", message: p, signature: Q(g) }, !((d = e.options) === null || d === void 0) && d.captchaToken ? { gotrue_meta_security: { captcha_token: (h = e.options) === null || h === void 0 ? void 0 : h.captchaToken } } : null),
        xform: x
      });
      if (y)
        throw y;
      if (!_ || !_.session || !_.user) {
        const w = new te();
        return this._returnResult({ data: { user: null, session: null }, error: w });
      }
      return _.session && (await this._saveSession(_.session), await this._notifyAllSubscribers("SIGNED_IN", _.session)), this._returnResult({ data: Object.assign({}, _), error: y });
    } catch (_) {
      if (v(_))
        return this._returnResult({ data: { user: null, session: null }, error: _ });
      throw _;
    }
  }
  async _exchangeCodeForSession(e) {
    const t = await X(this.storage, `${this.storageKey}-code-verifier`), [s, n] = (t ?? "").split("/");
    try {
      if (!s && this.flowType === "pkce")
        throw new hs();
      const { data: i, error: a } = await b(this.fetch, "POST", `${this.url}/token?grant_type=pkce`, {
        headers: this.headers,
        body: {
          auth_code: e,
          code_verifier: s
        },
        xform: x
      });
      if (await C(this.storage, `${this.storageKey}-code-verifier`), a)
        throw a;
      if (!i || !i.session || !i.user) {
        const o = new te();
        return this._returnResult({
          data: { user: null, session: null, redirectType: null },
          error: o
        });
      }
      return i.session && (await this._saveSession(i.session), await this._notifyAllSubscribers("SIGNED_IN", i.session)), this._returnResult({ data: Object.assign(Object.assign({}, i), { redirectType: n ?? null }), error: a });
    } catch (i) {
      if (await C(this.storage, `${this.storageKey}-code-verifier`), v(i))
        return this._returnResult({
          data: { user: null, session: null, redirectType: null },
          error: i
        });
      throw i;
    }
  }
  /**
   * Allows signing in with an OIDC ID token. The authentication provider used
   * should be enabled and configured.
   */
  async signInWithIdToken(e) {
    try {
      const { options: t, provider: s, token: n, access_token: i, nonce: a } = e, o = await b(this.fetch, "POST", `${this.url}/token?grant_type=id_token`, {
        headers: this.headers,
        body: {
          provider: s,
          id_token: n,
          access_token: i,
          nonce: a,
          gotrue_meta_security: { captcha_token: t == null ? void 0 : t.captchaToken }
        },
        xform: x
      }), { data: l, error: c } = o;
      if (c)
        return this._returnResult({ data: { user: null, session: null }, error: c });
      if (!l || !l.session || !l.user) {
        const u = new te();
        return this._returnResult({ data: { user: null, session: null }, error: u });
      }
      return l.session && (await this._saveSession(l.session), await this._notifyAllSubscribers("SIGNED_IN", l.session)), this._returnResult({ data: l, error: c });
    } catch (t) {
      if (v(t))
        return this._returnResult({ data: { user: null, session: null }, error: t });
      throw t;
    }
  }
  /**
   * Log in a user using magiclink or a one-time password (OTP).
   *
   * If the `{{ .ConfirmationURL }}` variable is specified in the email template, a magiclink will be sent.
   * If the `{{ .Token }}` variable is specified in the email template, an OTP will be sent.
   * If you're using phone sign-ins, only an OTP will be sent. You won't be able to send a magiclink for phone sign-ins.
   *
   * Be aware that you may get back an error message that will not distinguish
   * between the cases where the account does not exist or, that the account
   * can only be accessed via social login.
   *
   * Do note that you will need to configure a Whatsapp sender on Twilio
   * if you are using phone sign in with the 'whatsapp' channel. The whatsapp
   * channel is not supported on other providers
   * at this time.
   * This method supports PKCE when an email is passed.
   */
  async signInWithOtp(e) {
    var t, s, n, i, a;
    try {
      if ("email" in e) {
        const { email: o, options: l } = e;
        let c = null, u = null;
        this.flowType === "pkce" && ([c, u] = await re(this.storage, this.storageKey));
        const { error: f } = await b(this.fetch, "POST", `${this.url}/otp`, {
          headers: this.headers,
          body: {
            email: o,
            data: (t = l == null ? void 0 : l.data) !== null && t !== void 0 ? t : {},
            create_user: (s = l == null ? void 0 : l.shouldCreateUser) !== null && s !== void 0 ? s : !0,
            gotrue_meta_security: { captcha_token: l == null ? void 0 : l.captchaToken },
            code_challenge: c,
            code_challenge_method: u
          },
          redirectTo: l == null ? void 0 : l.emailRedirectTo
        });
        return this._returnResult({ data: { user: null, session: null }, error: f });
      }
      if ("phone" in e) {
        const { phone: o, options: l } = e, { data: c, error: u } = await b(this.fetch, "POST", `${this.url}/otp`, {
          headers: this.headers,
          body: {
            phone: o,
            data: (n = l == null ? void 0 : l.data) !== null && n !== void 0 ? n : {},
            create_user: (i = l == null ? void 0 : l.shouldCreateUser) !== null && i !== void 0 ? i : !0,
            gotrue_meta_security: { captcha_token: l == null ? void 0 : l.captchaToken },
            channel: (a = l == null ? void 0 : l.channel) !== null && a !== void 0 ? a : "sms"
          }
        });
        return this._returnResult({
          data: { user: null, session: null, messageId: c == null ? void 0 : c.message_id },
          error: u
        });
      }
      throw new Ie("You must provide either an email or phone number.");
    } catch (o) {
      if (await C(this.storage, `${this.storageKey}-code-verifier`), v(o))
        return this._returnResult({ data: { user: null, session: null }, error: o });
      throw o;
    }
  }
  /**
   * Log in a user given a User supplied OTP or TokenHash received through mobile or email.
   */
  async verifyOtp(e) {
    var t, s;
    try {
      let n, i;
      "options" in e && (n = (t = e.options) === null || t === void 0 ? void 0 : t.redirectTo, i = (s = e.options) === null || s === void 0 ? void 0 : s.captchaToken);
      const { data: a, error: o } = await b(this.fetch, "POST", `${this.url}/verify`, {
        headers: this.headers,
        body: Object.assign(Object.assign({}, e), { gotrue_meta_security: { captcha_token: i } }),
        redirectTo: n,
        xform: x
      });
      if (o)
        throw o;
      if (!a)
        throw new Error("An error occurred on token verification.");
      const l = a.session, c = a.user;
      return l != null && l.access_token && (await this._saveSession(l), await this._notifyAllSubscribers(e.type == "recovery" ? "PASSWORD_RECOVERY" : "SIGNED_IN", l)), this._returnResult({ data: { user: c, session: l }, error: null });
    } catch (n) {
      if (v(n))
        return this._returnResult({ data: { user: null, session: null }, error: n });
      throw n;
    }
  }
  /**
   * Attempts a single-sign on using an enterprise Identity Provider. A
   * successful SSO attempt will redirect the current page to the identity
   * provider authorization page. The redirect URL is implementation and SSO
   * protocol specific.
   *
   * You can use it by providing a SSO domain. Typically you can extract this
   * domain by asking users for their email address. If this domain is
   * registered on the Auth instance the redirect will use that organization's
   * currently active SSO Identity Provider for the login.
   *
   * If you have built an organization-specific login page, you can use the
   * organization's SSO Identity Provider UUID directly instead.
   */
  async signInWithSSO(e) {
    var t, s, n, i, a;
    try {
      let o = null, l = null;
      this.flowType === "pkce" && ([o, l] = await re(this.storage, this.storageKey));
      const c = await b(this.fetch, "POST", `${this.url}/sso`, {
        body: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, "providerId" in e ? { provider_id: e.providerId } : null), "domain" in e ? { domain: e.domain } : null), { redirect_to: (s = (t = e.options) === null || t === void 0 ? void 0 : t.redirectTo) !== null && s !== void 0 ? s : void 0 }), !((n = e == null ? void 0 : e.options) === null || n === void 0) && n.captchaToken ? { gotrue_meta_security: { captcha_token: e.options.captchaToken } } : null), { skip_http_redirect: !0, code_challenge: o, code_challenge_method: l }),
        headers: this.headers,
        xform: xs
      });
      return !((i = c.data) === null || i === void 0) && i.url && j() && !(!((a = e.options) === null || a === void 0) && a.skipBrowserRedirect) && window.location.assign(c.data.url), this._returnResult(c);
    } catch (o) {
      if (await C(this.storage, `${this.storageKey}-code-verifier`), v(o))
        return this._returnResult({ data: null, error: o });
      throw o;
    }
  }
  /**
   * Sends a reauthentication OTP to the user's email or phone number.
   * Requires the user to be signed-in.
   */
  async reauthenticate() {
    return await this.initializePromise, await this._acquireLock(this.lockAcquireTimeout, async () => await this._reauthenticate());
  }
  async _reauthenticate() {
    try {
      return await this._useSession(async (e) => {
        const { data: { session: t }, error: s } = e;
        if (s)
          throw s;
        if (!t)
          throw new U();
        const { error: n } = await b(this.fetch, "GET", `${this.url}/reauthenticate`, {
          headers: this.headers,
          jwt: t.access_token
        });
        return this._returnResult({ data: { user: null, session: null }, error: n });
      });
    } catch (e) {
      if (v(e))
        return this._returnResult({ data: { user: null, session: null }, error: e });
      throw e;
    }
  }
  /**
   * Resends an existing signup confirmation email, email change email, SMS OTP or phone change OTP.
   */
  async resend(e) {
    try {
      const t = `${this.url}/resend`;
      if ("email" in e) {
        const { email: s, type: n, options: i } = e, { error: a } = await b(this.fetch, "POST", t, {
          headers: this.headers,
          body: {
            email: s,
            type: n,
            gotrue_meta_security: { captcha_token: i == null ? void 0 : i.captchaToken }
          },
          redirectTo: i == null ? void 0 : i.emailRedirectTo
        });
        return this._returnResult({ data: { user: null, session: null }, error: a });
      } else if ("phone" in e) {
        const { phone: s, type: n, options: i } = e, { data: a, error: o } = await b(this.fetch, "POST", t, {
          headers: this.headers,
          body: {
            phone: s,
            type: n,
            gotrue_meta_security: { captcha_token: i == null ? void 0 : i.captchaToken }
          }
        });
        return this._returnResult({
          data: { user: null, session: null, messageId: a == null ? void 0 : a.message_id },
          error: o
        });
      }
      throw new Ie("You must provide either an email or phone number and a type");
    } catch (t) {
      if (v(t))
        return this._returnResult({ data: { user: null, session: null }, error: t });
      throw t;
    }
  }
  /**
   * Returns the session, refreshing it if necessary.
   *
   * The session returned can be null if the session is not detected which can happen in the event a user is not signed-in or has logged out.
   *
   * **IMPORTANT:** This method loads values directly from the storage attached
   * to the client. If that storage is based on request cookies for example,
   * the values in it may not be authentic and therefore it's strongly advised
   * against using this method and its results in such circumstances. A warning
   * will be emitted if this is detected. Use {@link #getUser()} instead.
   */
  async getSession() {
    return await this.initializePromise, await this._acquireLock(this.lockAcquireTimeout, async () => this._useSession(async (t) => t));
  }
  /**
   * Acquires a global lock based on the storage key.
   */
  async _acquireLock(e, t) {
    this._debug("#_acquireLock", "begin", e);
    try {
      if (this.lockAcquired) {
        const s = this.pendingInLock.length ? this.pendingInLock[this.pendingInLock.length - 1] : Promise.resolve(), n = (async () => (await s, await t()))();
        return this.pendingInLock.push((async () => {
          try {
            await n;
          } catch {
          }
        })()), n;
      }
      return await this.lock(`lock:${this.storageKey}`, e, async () => {
        this._debug("#_acquireLock", "lock acquired for storage key", this.storageKey);
        try {
          this.lockAcquired = !0;
          const s = t();
          for (this.pendingInLock.push((async () => {
            try {
              await s;
            } catch {
            }
          })()), await s; this.pendingInLock.length; ) {
            const n = [...this.pendingInLock];
            await Promise.all(n), this.pendingInLock.splice(0, n.length);
          }
          return await s;
        } finally {
          this._debug("#_acquireLock", "lock released for storage key", this.storageKey), this.lockAcquired = !1;
        }
      });
    } finally {
      this._debug("#_acquireLock", "end");
    }
  }
  /**
   * Use instead of {@link #getSession} inside the library. It is
   * semantically usually what you want, as getting a session involves some
   * processing afterwards that requires only one client operating on the
   * session at once across multiple tabs or processes.
   */
  async _useSession(e) {
    this._debug("#_useSession", "begin");
    try {
      const t = await this.__loadSession();
      return await e(t);
    } finally {
      this._debug("#_useSession", "end");
    }
  }
  /**
   * NEVER USE DIRECTLY!
   *
   * Always use {@link #_useSession}.
   */
  async __loadSession() {
    this._debug("#__loadSession()", "begin"), this.lockAcquired || this._debug("#__loadSession()", "used outside of an acquired lock!", new Error().stack);
    try {
      let e = null;
      const t = await X(this.storage, this.storageKey);
      if (this._debug("#getSession()", "session from storage", t), t !== null && (this._isValidSession(t) ? e = t : (this._debug("#getSession()", "session from storage is not valid"), await this._removeSession())), !e)
        return { data: { session: null }, error: null };
      const s = e.expires_at ? e.expires_at * 1e3 - Date.now() < Me : !1;
      if (this._debug("#__loadSession()", `session has${s ? "" : " not"} expired`, "expires_at", e.expires_at), !s) {
        if (this.userStorage) {
          const a = await X(this.userStorage, this.storageKey + "-user");
          a != null && a.user ? e.user = a.user : e.user = Ke();
        }
        if (this.storage.isServer && e.user && !e.user.__isUserNotAvailableProxy) {
          const a = { value: this.suppressGetSessionWarning };
          e.user = js(e.user, a), a.value && (this.suppressGetSessionWarning = !0);
        }
        return { data: { session: e }, error: null };
      }
      const { data: n, error: i } = await this._callRefreshToken(e.refresh_token);
      return i ? this._returnResult({ data: { session: null }, error: i }) : this._returnResult({ data: { session: n }, error: null });
    } finally {
      this._debug("#__loadSession()", "end");
    }
  }
  /**
   * Gets the current user details if there is an existing session. This method
   * performs a network request to the Supabase Auth server, so the returned
   * value is authentic and can be used to base authorization rules on.
   *
   * @param jwt Takes in an optional access token JWT. If no JWT is provided, the JWT from the current session is used.
   */
  async getUser(e) {
    if (e)
      return await this._getUser(e);
    await this.initializePromise;
    const t = await this._acquireLock(this.lockAcquireTimeout, async () => await this._getUser());
    return t.data.user && (this.suppressGetSessionWarning = !0), t;
  }
  async _getUser(e) {
    try {
      return e ? await b(this.fetch, "GET", `${this.url}/user`, {
        headers: this.headers,
        jwt: e,
        xform: V
      }) : await this._useSession(async (t) => {
        var s, n, i;
        const { data: a, error: o } = t;
        if (o)
          throw o;
        return !(!((s = a.session) === null || s === void 0) && s.access_token) && !this.hasCustomAuthorizationHeader ? { data: { user: null }, error: new U() } : await b(this.fetch, "GET", `${this.url}/user`, {
          headers: this.headers,
          jwt: (i = (n = a.session) === null || n === void 0 ? void 0 : n.access_token) !== null && i !== void 0 ? i : void 0,
          xform: V
        });
      });
    } catch (t) {
      if (v(t))
        return Fe(t) && (await this._removeSession(), await C(this.storage, `${this.storageKey}-code-verifier`)), this._returnResult({ data: { user: null }, error: t });
      throw t;
    }
  }
  /**
   * Updates user data for a logged in user.
   */
  async updateUser(e, t = {}) {
    return await this.initializePromise, await this._acquireLock(this.lockAcquireTimeout, async () => await this._updateUser(e, t));
  }
  async _updateUser(e, t = {}) {
    try {
      return await this._useSession(async (s) => {
        const { data: n, error: i } = s;
        if (i)
          throw i;
        if (!n.session)
          throw new U();
        const a = n.session;
        let o = null, l = null;
        this.flowType === "pkce" && e.email != null && ([o, l] = await re(this.storage, this.storageKey));
        const { data: c, error: u } = await b(this.fetch, "PUT", `${this.url}/user`, {
          headers: this.headers,
          redirectTo: t == null ? void 0 : t.emailRedirectTo,
          body: Object.assign(Object.assign({}, e), { code_challenge: o, code_challenge_method: l }),
          jwt: a.access_token,
          xform: V
        });
        if (u)
          throw u;
        return a.user = c.user, await this._saveSession(a), await this._notifyAllSubscribers("USER_UPDATED", a), this._returnResult({ data: { user: a.user }, error: null });
      });
    } catch (s) {
      if (await C(this.storage, `${this.storageKey}-code-verifier`), v(s))
        return this._returnResult({ data: { user: null }, error: s });
      throw s;
    }
  }
  /**
   * Sets the session data from the current session. If the current session is expired, setSession will take care of refreshing it to obtain a new session.
   * If the refresh token or access token in the current session is invalid, an error will be thrown.
   * @param currentSession The current session that minimally contains an access token and refresh token.
   */
  async setSession(e) {
    return await this.initializePromise, await this._acquireLock(this.lockAcquireTimeout, async () => await this._setSession(e));
  }
  async _setSession(e) {
    try {
      if (!e.access_token || !e.refresh_token)
        throw new U();
      const t = Date.now() / 1e3;
      let s = t, n = !0, i = null;
      const { payload: a } = Ce(e.access_token);
      if (a.exp && (s = a.exp, n = s <= t), n) {
        const { data: o, error: l } = await this._callRefreshToken(e.refresh_token);
        if (l)
          return this._returnResult({ data: { user: null, session: null }, error: l });
        if (!o)
          return { data: { user: null, session: null }, error: null };
        i = o;
      } else {
        const { data: o, error: l } = await this._getUser(e.access_token);
        if (l)
          return this._returnResult({ data: { user: null, session: null }, error: l });
        i = {
          access_token: e.access_token,
          refresh_token: e.refresh_token,
          user: o.user,
          token_type: "bearer",
          expires_in: s - t,
          expires_at: s
        }, await this._saveSession(i), await this._notifyAllSubscribers("SIGNED_IN", i);
      }
      return this._returnResult({ data: { user: i.user, session: i }, error: null });
    } catch (t) {
      if (v(t))
        return this._returnResult({ data: { session: null, user: null }, error: t });
      throw t;
    }
  }
  /**
   * Returns a new session, regardless of expiry status.
   * Takes in an optional current session. If not passed in, then refreshSession() will attempt to retrieve it from getSession().
   * If the current session's refresh token is invalid, an error will be thrown.
   * @param currentSession The current session. If passed in, it must contain a refresh token.
   */
  async refreshSession(e) {
    return await this.initializePromise, await this._acquireLock(this.lockAcquireTimeout, async () => await this._refreshSession(e));
  }
  async _refreshSession(e) {
    try {
      return await this._useSession(async (t) => {
        var s;
        if (!e) {
          const { data: a, error: o } = t;
          if (o)
            throw o;
          e = (s = a.session) !== null && s !== void 0 ? s : void 0;
        }
        if (!(e != null && e.refresh_token))
          throw new U();
        const { data: n, error: i } = await this._callRefreshToken(e.refresh_token);
        return i ? this._returnResult({ data: { user: null, session: null }, error: i }) : n ? this._returnResult({ data: { user: n.user, session: n }, error: null }) : this._returnResult({ data: { user: null, session: null }, error: null });
      });
    } catch (t) {
      if (v(t))
        return this._returnResult({ data: { user: null, session: null }, error: t });
      throw t;
    }
  }
  /**
   * Gets the session data from a URL string
   */
  async _getSessionFromURL(e, t) {
    try {
      if (!j())
        throw new Pe("No browser detected.");
      if (e.error || e.error_description || e.error_code)
        throw new Pe(e.error_description || "Error in URL with unspecified error_description", {
          error: e.error || "unspecified_error",
          code: e.error_code || "unspecified_code"
        });
      switch (t) {
        case "implicit":
          if (this.flowType === "pkce")
            throw new _t("Not a valid PKCE flow url.");
          break;
        case "pkce":
          if (this.flowType === "implicit")
            throw new Pe("Not a valid implicit grant flow url.");
          break;
        default:
      }
      if (t === "pkce") {
        if (this._debug("#_initialize()", "begin", "is PKCE flow", !0), !e.code)
          throw new _t("No code detected.");
        const { data: w, error: m } = await this._exchangeCodeForSession(e.code);
        if (m)
          throw m;
        const T = new URL(window.location.href);
        return T.searchParams.delete("code"), window.history.replaceState(window.history.state, "", T.toString()), { data: { session: w.session, redirectType: null }, error: null };
      }
      const { provider_token: s, provider_refresh_token: n, access_token: i, refresh_token: a, expires_in: o, expires_at: l, token_type: c } = e;
      if (!i || !o || !a || !c)
        throw new Pe("No session defined in URL");
      const u = Math.round(Date.now() / 1e3), f = parseInt(o);
      let d = u + f;
      l && (d = parseInt(l));
      const h = d - u;
      h * 1e3 <= oe && console.warn(`@supabase/gotrue-js: Session as retrieved from URL expires in ${h}s, should have been closer to ${f}s`);
      const p = d - f;
      u - p >= 120 ? console.warn("@supabase/gotrue-js: Session as retrieved from URL was issued over 120s ago, URL could be stale", p, d, u) : u - p < 0 && console.warn("@supabase/gotrue-js: Session as retrieved from URL was issued in the future? Check the device clock for skew", p, d, u);
      const { data: g, error: _ } = await this._getUser(i);
      if (_)
        throw _;
      const y = {
        provider_token: s,
        provider_refresh_token: n,
        access_token: i,
        expires_in: f,
        expires_at: d,
        refresh_token: a,
        token_type: c,
        user: g.user
      };
      return window.location.hash = "", this._debug("#_getSessionFromURL()", "clearing window.location.hash"), this._returnResult({ data: { session: y, redirectType: e.type }, error: null });
    } catch (s) {
      if (v(s))
        return this._returnResult({ data: { session: null, redirectType: null }, error: s });
      throw s;
    }
  }
  /**
   * Checks if the current URL contains parameters given by an implicit oauth grant flow (https://www.rfc-editor.org/rfc/rfc6749.html#section-4.2)
   *
   * If `detectSessionInUrl` is a function, it will be called with the URL and params to determine
   * if the URL should be processed as a Supabase auth callback. This allows users to exclude
   * URLs from other OAuth providers (e.g., Facebook Login) that also return access_token in the fragment.
   */
  _isImplicitGrantCallback(e) {
    return typeof this.detectSessionInUrl == "function" ? this.detectSessionInUrl(new URL(window.location.href), e) : !!(e.access_token || e.error_description);
  }
  /**
   * Checks if the current URL and backing storage contain parameters given by a PKCE flow
   */
  async _isPKCECallback(e) {
    const t = await X(this.storage, `${this.storageKey}-code-verifier`);
    return !!(e.code && t);
  }
  /**
   * Inside a browser context, `signOut()` will remove the logged in user from the browser session and log them out - removing all items from localstorage and then trigger a `"SIGNED_OUT"` event.
   *
   * For server-side management, you can revoke all refresh tokens for a user by passing a user's JWT through to `auth.api.signOut(JWT: string)`.
   * There is no way to revoke a user's access token jwt until it expires. It is recommended to set a shorter expiry on the jwt for this reason.
   *
   * If using `others` scope, no `SIGNED_OUT` event is fired!
   */
  async signOut(e = { scope: "global" }) {
    return await this.initializePromise, await this._acquireLock(this.lockAcquireTimeout, async () => await this._signOut(e));
  }
  async _signOut({ scope: e } = { scope: "global" }) {
    return await this._useSession(async (t) => {
      var s;
      const { data: n, error: i } = t;
      if (i && !Fe(i))
        return this._returnResult({ error: i });
      const a = (s = n.session) === null || s === void 0 ? void 0 : s.access_token;
      if (a) {
        const { error: o } = await this.admin.signOut(a, e);
        if (o && !(cs(o) && (o.status === 404 || o.status === 401 || o.status === 403) || Fe(o)))
          return this._returnResult({ error: o });
      }
      return e !== "others" && (await this._removeSession(), await C(this.storage, `${this.storageKey}-code-verifier`)), this._returnResult({ error: null });
    });
  }
  onAuthStateChange(e) {
    const t = ms(), s = {
      id: t,
      callback: e,
      unsubscribe: () => {
        this._debug("#unsubscribe()", "state change callback with id removed", t), this.stateChangeEmitters.delete(t);
      }
    };
    return this._debug("#onAuthStateChange()", "registered callback with id", t), this.stateChangeEmitters.set(t, s), (async () => (await this.initializePromise, await this._acquireLock(this.lockAcquireTimeout, async () => {
      this._emitInitialSession(t);
    })))(), { data: { subscription: s } };
  }
  async _emitInitialSession(e) {
    return await this._useSession(async (t) => {
      var s, n;
      try {
        const { data: { session: i }, error: a } = t;
        if (a)
          throw a;
        await ((s = this.stateChangeEmitters.get(e)) === null || s === void 0 ? void 0 : s.callback("INITIAL_SESSION", i)), this._debug("INITIAL_SESSION", "callback id", e, "session", i);
      } catch (i) {
        await ((n = this.stateChangeEmitters.get(e)) === null || n === void 0 ? void 0 : n.callback("INITIAL_SESSION", null)), this._debug("INITIAL_SESSION", "callback id", e, "error", i), console.error(i);
      }
    });
  }
  /**
   * Sends a password reset request to an email address. This method supports the PKCE flow.
   *
   * @param email The email address of the user.
   * @param options.redirectTo The URL to send the user to after they click the password reset link.
   * @param options.captchaToken Verification token received when the user completes the captcha on the site.
   */
  async resetPasswordForEmail(e, t = {}) {
    let s = null, n = null;
    this.flowType === "pkce" && ([s, n] = await re(
      this.storage,
      this.storageKey,
      !0
      // isPasswordRecovery
    ));
    try {
      return await b(this.fetch, "POST", `${this.url}/recover`, {
        body: {
          email: e,
          code_challenge: s,
          code_challenge_method: n,
          gotrue_meta_security: { captcha_token: t.captchaToken }
        },
        headers: this.headers,
        redirectTo: t.redirectTo
      });
    } catch (i) {
      if (await C(this.storage, `${this.storageKey}-code-verifier`), v(i))
        return this._returnResult({ data: null, error: i });
      throw i;
    }
  }
  /**
   * Gets all the identities linked to a user.
   */
  async getUserIdentities() {
    var e;
    try {
      const { data: t, error: s } = await this.getUser();
      if (s)
        throw s;
      return this._returnResult({ data: { identities: (e = t.user.identities) !== null && e !== void 0 ? e : [] }, error: null });
    } catch (t) {
      if (v(t))
        return this._returnResult({ data: null, error: t });
      throw t;
    }
  }
  async linkIdentity(e) {
    return "token" in e ? this.linkIdentityIdToken(e) : this.linkIdentityOAuth(e);
  }
  async linkIdentityOAuth(e) {
    var t;
    try {
      const { data: s, error: n } = await this._useSession(async (i) => {
        var a, o, l, c, u;
        const { data: f, error: d } = i;
        if (d)
          throw d;
        const h = await this._getUrlForProvider(`${this.url}/user/identities/authorize`, e.provider, {
          redirectTo: (a = e.options) === null || a === void 0 ? void 0 : a.redirectTo,
          scopes: (o = e.options) === null || o === void 0 ? void 0 : o.scopes,
          queryParams: (l = e.options) === null || l === void 0 ? void 0 : l.queryParams,
          skipBrowserRedirect: !0
        });
        return await b(this.fetch, "GET", h, {
          headers: this.headers,
          jwt: (u = (c = f.session) === null || c === void 0 ? void 0 : c.access_token) !== null && u !== void 0 ? u : void 0
        });
      });
      if (n)
        throw n;
      return j() && !(!((t = e.options) === null || t === void 0) && t.skipBrowserRedirect) && window.location.assign(s == null ? void 0 : s.url), this._returnResult({
        data: { provider: e.provider, url: s == null ? void 0 : s.url },
        error: null
      });
    } catch (s) {
      if (v(s))
        return this._returnResult({ data: { provider: e.provider, url: null }, error: s });
      throw s;
    }
  }
  async linkIdentityIdToken(e) {
    return await this._useSession(async (t) => {
      var s;
      try {
        const { error: n, data: { session: i } } = t;
        if (n)
          throw n;
        const { options: a, provider: o, token: l, access_token: c, nonce: u } = e, f = await b(this.fetch, "POST", `${this.url}/token?grant_type=id_token`, {
          headers: this.headers,
          jwt: (s = i == null ? void 0 : i.access_token) !== null && s !== void 0 ? s : void 0,
          body: {
            provider: o,
            id_token: l,
            access_token: c,
            nonce: u,
            link_identity: !0,
            gotrue_meta_security: { captcha_token: a == null ? void 0 : a.captchaToken }
          },
          xform: x
        }), { data: d, error: h } = f;
        return h ? this._returnResult({ data: { user: null, session: null }, error: h }) : !d || !d.session || !d.user ? this._returnResult({
          data: { user: null, session: null },
          error: new te()
        }) : (d.session && (await this._saveSession(d.session), await this._notifyAllSubscribers("USER_UPDATED", d.session)), this._returnResult({ data: d, error: h }));
      } catch (n) {
        if (await C(this.storage, `${this.storageKey}-code-verifier`), v(n))
          return this._returnResult({ data: { user: null, session: null }, error: n });
        throw n;
      }
    });
  }
  /**
   * Unlinks an identity from a user by deleting it. The user will no longer be able to sign in with that identity once it's unlinked.
   */
  async unlinkIdentity(e) {
    try {
      return await this._useSession(async (t) => {
        var s, n;
        const { data: i, error: a } = t;
        if (a)
          throw a;
        return await b(this.fetch, "DELETE", `${this.url}/user/identities/${e.identity_id}`, {
          headers: this.headers,
          jwt: (n = (s = i.session) === null || s === void 0 ? void 0 : s.access_token) !== null && n !== void 0 ? n : void 0
        });
      });
    } catch (t) {
      if (v(t))
        return this._returnResult({ data: null, error: t });
      throw t;
    }
  }
  /**
   * Generates a new JWT.
   * @param refreshToken A valid refresh token that was returned on login.
   */
  async _refreshAccessToken(e) {
    const t = `#_refreshAccessToken(${e.substring(0, 5)}...)`;
    this._debug(t, "begin");
    try {
      const s = Date.now();
      return await Es(async (n) => (n > 0 && await bs(200 * Math.pow(2, n - 1)), this._debug(t, "refreshing attempt", n), await b(this.fetch, "POST", `${this.url}/token?grant_type=refresh_token`, {
        body: { refresh_token: e },
        headers: this.headers,
        xform: x
      })), (n, i) => {
        const a = 200 * Math.pow(2, n);
        return i && We(i) && // retryable only if the request can be sent before the backoff overflows the tick duration
        Date.now() + a - s < oe;
      });
    } catch (s) {
      if (this._debug(t, "error", s), v(s))
        return this._returnResult({ data: { session: null, user: null }, error: s });
      throw s;
    } finally {
      this._debug(t, "end");
    }
  }
  _isValidSession(e) {
    return typeof e == "object" && e !== null && "access_token" in e && "refresh_token" in e && "expires_at" in e;
  }
  async _handleProviderSignIn(e, t) {
    const s = await this._getUrlForProvider(`${this.url}/authorize`, e, {
      redirectTo: t.redirectTo,
      scopes: t.scopes,
      queryParams: t.queryParams
    });
    return this._debug("#_handleProviderSignIn()", "provider", e, "options", t, "url", s), j() && !t.skipBrowserRedirect && window.location.assign(s), { data: { provider: e, url: s }, error: null };
  }
  /**
   * Recovers the session from LocalStorage and refreshes the token
   * Note: this method is async to accommodate for AsyncStorage e.g. in React native.
   */
  async _recoverAndRefresh() {
    var e, t;
    const s = "#_recoverAndRefresh()";
    this._debug(s, "begin");
    try {
      const n = await X(this.storage, this.storageKey);
      if (n && this.userStorage) {
        let a = await X(this.userStorage, this.storageKey + "-user");
        !this.storage.isServer && Object.is(this.storage, this.userStorage) && !a && (a = { user: n.user }, await le(this.userStorage, this.storageKey + "-user", a)), n.user = (e = a == null ? void 0 : a.user) !== null && e !== void 0 ? e : Ke();
      } else if (n && !n.user && !n.user) {
        const a = await X(this.storage, this.storageKey + "-user");
        a && (a != null && a.user) ? (n.user = a.user, await C(this.storage, this.storageKey + "-user"), await le(this.storage, this.storageKey, n)) : n.user = Ke();
      }
      if (this._debug(s, "session from storage", n), !this._isValidSession(n)) {
        this._debug(s, "session is not valid"), n !== null && await this._removeSession();
        return;
      }
      const i = ((t = n.expires_at) !== null && t !== void 0 ? t : 1 / 0) * 1e3 - Date.now() < Me;
      if (this._debug(s, `session has${i ? "" : " not"} expired with margin of ${Me}s`), i) {
        if (this.autoRefreshToken && n.refresh_token) {
          const { error: a } = await this._callRefreshToken(n.refresh_token);
          a && (console.error(a), We(a) || (this._debug(s, "refresh failed with a non-retryable error, removing the session", a), await this._removeSession()));
        }
      } else if (n.user && n.user.__isUserNotAvailableProxy === !0)
        try {
          const { data: a, error: o } = await this._getUser(n.access_token);
          !o && (a != null && a.user) ? (n.user = a.user, await this._saveSession(n), await this._notifyAllSubscribers("SIGNED_IN", n)) : this._debug(s, "could not get user data, skipping SIGNED_IN notification");
        } catch (a) {
          console.error("Error getting user data:", a), this._debug(s, "error getting user data, skipping SIGNED_IN notification", a);
        }
      else
        await this._notifyAllSubscribers("SIGNED_IN", n);
    } catch (n) {
      this._debug(s, "error", n), console.error(n);
      return;
    } finally {
      this._debug(s, "end");
    }
  }
  async _callRefreshToken(e) {
    var t, s;
    if (!e)
      throw new U();
    if (this.refreshingDeferred)
      return this.refreshingDeferred.promise;
    const n = `#_callRefreshToken(${e.substring(0, 5)}...)`;
    this._debug(n, "begin");
    try {
      this.refreshingDeferred = new De();
      const { data: i, error: a } = await this._refreshAccessToken(e);
      if (a)
        throw a;
      if (!i.session)
        throw new U();
      await this._saveSession(i.session), await this._notifyAllSubscribers("TOKEN_REFRESHED", i.session);
      const o = { data: i.session, error: null };
      return this.refreshingDeferred.resolve(o), o;
    } catch (i) {
      if (this._debug(n, "error", i), v(i)) {
        const a = { data: null, error: i };
        return We(i) || await this._removeSession(), (t = this.refreshingDeferred) === null || t === void 0 || t.resolve(a), a;
      }
      throw (s = this.refreshingDeferred) === null || s === void 0 || s.reject(i), i;
    } finally {
      this.refreshingDeferred = null, this._debug(n, "end");
    }
  }
  async _notifyAllSubscribers(e, t, s = !0) {
    const n = `#_notifyAllSubscribers(${e})`;
    this._debug(n, "begin", t, `broadcast = ${s}`);
    try {
      this.broadcastChannel && s && this.broadcastChannel.postMessage({ event: e, session: t });
      const i = [], a = Array.from(this.stateChangeEmitters.values()).map(async (o) => {
        try {
          await o.callback(e, t);
        } catch (l) {
          i.push(l);
        }
      });
      if (await Promise.all(a), i.length > 0) {
        for (let o = 0; o < i.length; o += 1)
          console.error(i[o]);
        throw i[0];
      }
    } finally {
      this._debug(n, "end");
    }
  }
  /**
   * set currentSession and currentUser
   * process to _startAutoRefreshToken if possible
   */
  async _saveSession(e) {
    this._debug("#_saveSession()", e), this.suppressGetSessionWarning = !0, await C(this.storage, `${this.storageKey}-code-verifier`);
    const t = Object.assign({}, e), s = t.user && t.user.__isUserNotAvailableProxy === !0;
    if (this.userStorage) {
      !s && t.user && await le(this.userStorage, this.storageKey + "-user", {
        user: t.user
      });
      const n = Object.assign({}, t);
      delete n.user;
      const i = bt(n);
      await le(this.storage, this.storageKey, i);
    } else {
      const n = bt(t);
      await le(this.storage, this.storageKey, n);
    }
  }
  async _removeSession() {
    this._debug("#_removeSession()"), this.suppressGetSessionWarning = !1, await C(this.storage, this.storageKey), await C(this.storage, this.storageKey + "-code-verifier"), await C(this.storage, this.storageKey + "-user"), this.userStorage && await C(this.userStorage, this.storageKey + "-user"), await this._notifyAllSubscribers("SIGNED_OUT", null);
  }
  /**
   * Removes any registered visibilitychange callback.
   *
   * {@see #startAutoRefresh}
   * {@see #stopAutoRefresh}
   */
  _removeVisibilityChangedCallback() {
    this._debug("#_removeVisibilityChangedCallback()");
    const e = this.visibilityChangedCallback;
    this.visibilityChangedCallback = null;
    try {
      e && j() && (window != null && window.removeEventListener) && window.removeEventListener("visibilitychange", e);
    } catch (t) {
      console.error("removing visibilitychange callback failed", t);
    }
  }
  /**
   * This is the private implementation of {@link #startAutoRefresh}. Use this
   * within the library.
   */
  async _startAutoRefresh() {
    await this._stopAutoRefresh(), this._debug("#_startAutoRefresh()");
    const e = setInterval(() => this._autoRefreshTokenTick(), oe);
    this.autoRefreshTicker = e, e && typeof e == "object" && typeof e.unref == "function" ? e.unref() : typeof Deno < "u" && typeof Deno.unrefTimer == "function" && Deno.unrefTimer(e);
    const t = setTimeout(async () => {
      await this.initializePromise, await this._autoRefreshTokenTick();
    }, 0);
    this.autoRefreshTickTimeout = t, t && typeof t == "object" && typeof t.unref == "function" ? t.unref() : typeof Deno < "u" && typeof Deno.unrefTimer == "function" && Deno.unrefTimer(t);
  }
  /**
   * This is the private implementation of {@link #stopAutoRefresh}. Use this
   * within the library.
   */
  async _stopAutoRefresh() {
    this._debug("#_stopAutoRefresh()");
    const e = this.autoRefreshTicker;
    this.autoRefreshTicker = null, e && clearInterval(e);
    const t = this.autoRefreshTickTimeout;
    this.autoRefreshTickTimeout = null, t && clearTimeout(t);
  }
  /**
   * Starts an auto-refresh process in the background. The session is checked
   * every few seconds. Close to the time of expiration a process is started to
   * refresh the session. If refreshing fails it will be retried for as long as
   * necessary.
   *
   * If you set the {@link GoTrueClientOptions#autoRefreshToken} you don't need
   * to call this function, it will be called for you.
   *
   * On browsers the refresh process works only when the tab/window is in the
   * foreground to conserve resources as well as prevent race conditions and
   * flooding auth with requests. If you call this method any managed
   * visibility change callback will be removed and you must manage visibility
   * changes on your own.
   *
   * On non-browser platforms the refresh process works *continuously* in the
   * background, which may not be desirable. You should hook into your
   * platform's foreground indication mechanism and call these methods
   * appropriately to conserve resources.
   *
   * {@see #stopAutoRefresh}
   */
  async startAutoRefresh() {
    this._removeVisibilityChangedCallback(), await this._startAutoRefresh();
  }
  /**
   * Stops an active auto refresh process running in the background (if any).
   *
   * If you call this method any managed visibility change callback will be
   * removed and you must manage visibility changes on your own.
   *
   * See {@link #startAutoRefresh} for more details.
   */
  async stopAutoRefresh() {
    this._removeVisibilityChangedCallback(), await this._stopAutoRefresh();
  }
  /**
   * Runs the auto refresh token tick.
   */
  async _autoRefreshTokenTick() {
    this._debug("#_autoRefreshTokenTick()", "begin");
    try {
      await this._acquireLock(0, async () => {
        try {
          const e = Date.now();
          try {
            return await this._useSession(async (t) => {
              const { data: { session: s } } = t;
              if (!s || !s.refresh_token || !s.expires_at) {
                this._debug("#_autoRefreshTokenTick()", "no session");
                return;
              }
              const n = Math.floor((s.expires_at * 1e3 - e) / oe);
              this._debug("#_autoRefreshTokenTick()", `access token expires in ${n} ticks, a tick lasts ${oe}ms, refresh threshold is ${Qe} ticks`), n <= Qe && await this._callRefreshToken(s.refresh_token);
            });
          } catch (t) {
            console.error("Auto refresh tick failed with error. This is likely a transient error.", t);
          }
        } finally {
          this._debug("#_autoRefreshTokenTick()", "end");
        }
      });
    } catch (e) {
      if (e.isAcquireTimeout || e instanceof Kt)
        this._debug("auto refresh token tick lock not available");
      else
        throw e;
    }
  }
  /**
   * Registers callbacks on the browser / platform, which in-turn run
   * algorithms when the browser window/tab are in foreground. On non-browser
   * platforms it assumes always foreground.
   */
  async _handleVisibilityChange() {
    if (this._debug("#_handleVisibilityChange()"), !j() || !(window != null && window.addEventListener))
      return this.autoRefreshToken && this.startAutoRefresh(), !1;
    try {
      this.visibilityChangedCallback = async () => {
        try {
          await this._onVisibilityChanged(!1);
        } catch (e) {
          this._debug("#visibilityChangedCallback", "error", e);
        }
      }, window == null || window.addEventListener("visibilitychange", this.visibilityChangedCallback), await this._onVisibilityChanged(!0);
    } catch (e) {
      console.error("_handleVisibilityChange", e);
    }
  }
  /**
   * Callback registered with `window.addEventListener('visibilitychange')`.
   */
  async _onVisibilityChanged(e) {
    const t = `#_onVisibilityChanged(${e})`;
    this._debug(t, "visibilityState", document.visibilityState), document.visibilityState === "visible" ? (this.autoRefreshToken && this._startAutoRefresh(), e || (await this.initializePromise, await this._acquireLock(this.lockAcquireTimeout, async () => {
      if (document.visibilityState !== "visible") {
        this._debug(t, "acquired the lock to recover the session, but the browser visibilityState is no longer visible, aborting");
        return;
      }
      await this._recoverAndRefresh();
    }))) : document.visibilityState === "hidden" && this.autoRefreshToken && this._stopAutoRefresh();
  }
  /**
   * Generates the relevant login URL for a third-party provider.
   * @param options.redirectTo A URL or mobile address to send the user to after they are confirmed.
   * @param options.scopes A space-separated list of scopes granted to the OAuth application.
   * @param options.queryParams An object of key-value pairs containing query parameters granted to the OAuth application.
   */
  async _getUrlForProvider(e, t, s) {
    const n = [`provider=${encodeURIComponent(t)}`];
    if (s != null && s.redirectTo && n.push(`redirect_to=${encodeURIComponent(s.redirectTo)}`), s != null && s.scopes && n.push(`scopes=${encodeURIComponent(s.scopes)}`), this.flowType === "pkce") {
      const [i, a] = await re(this.storage, this.storageKey), o = new URLSearchParams({
        code_challenge: `${encodeURIComponent(i)}`,
        code_challenge_method: `${encodeURIComponent(a)}`
      });
      n.push(o.toString());
    }
    if (s != null && s.queryParams) {
      const i = new URLSearchParams(s.queryParams);
      n.push(i.toString());
    }
    return s != null && s.skipBrowserRedirect && n.push(`skip_http_redirect=${s.skipBrowserRedirect}`), `${e}?${n.join("&")}`;
  }
  async _unenroll(e) {
    try {
      return await this._useSession(async (t) => {
        var s;
        const { data: n, error: i } = t;
        return i ? this._returnResult({ data: null, error: i }) : await b(this.fetch, "DELETE", `${this.url}/factors/${e.factorId}`, {
          headers: this.headers,
          jwt: (s = n == null ? void 0 : n.session) === null || s === void 0 ? void 0 : s.access_token
        });
      });
    } catch (t) {
      if (v(t))
        return this._returnResult({ data: null, error: t });
      throw t;
    }
  }
  async _enroll(e) {
    try {
      return await this._useSession(async (t) => {
        var s, n;
        const { data: i, error: a } = t;
        if (a)
          return this._returnResult({ data: null, error: a });
        const o = Object.assign({ friendly_name: e.friendlyName, factor_type: e.factorType }, e.factorType === "phone" ? { phone: e.phone } : e.factorType === "totp" ? { issuer: e.issuer } : {}), { data: l, error: c } = await b(this.fetch, "POST", `${this.url}/factors`, {
          body: o,
          headers: this.headers,
          jwt: (s = i == null ? void 0 : i.session) === null || s === void 0 ? void 0 : s.access_token
        });
        return c ? this._returnResult({ data: null, error: c }) : (e.factorType === "totp" && l.type === "totp" && (!((n = l == null ? void 0 : l.totp) === null || n === void 0) && n.qr_code) && (l.totp.qr_code = `data:image/svg+xml;utf-8,${l.totp.qr_code}`), this._returnResult({ data: l, error: null }));
      });
    } catch (t) {
      if (v(t))
        return this._returnResult({ data: null, error: t });
      throw t;
    }
  }
  async _verify(e) {
    return this._acquireLock(this.lockAcquireTimeout, async () => {
      try {
        return await this._useSession(async (t) => {
          var s;
          const { data: n, error: i } = t;
          if (i)
            return this._returnResult({ data: null, error: i });
          const a = Object.assign({ challenge_id: e.challengeId }, "webauthn" in e ? {
            webauthn: Object.assign(Object.assign({}, e.webauthn), { credential_response: e.webauthn.type === "create" ? Qs(e.webauthn.credential_response) : Zs(e.webauthn.credential_response) })
          } : { code: e.code }), { data: o, error: l } = await b(this.fetch, "POST", `${this.url}/factors/${e.factorId}/verify`, {
            body: a,
            headers: this.headers,
            jwt: (s = n == null ? void 0 : n.session) === null || s === void 0 ? void 0 : s.access_token
          });
          return l ? this._returnResult({ data: null, error: l }) : (await this._saveSession(Object.assign({ expires_at: Math.round(Date.now() / 1e3) + o.expires_in }, o)), await this._notifyAllSubscribers("MFA_CHALLENGE_VERIFIED", o), this._returnResult({ data: o, error: l }));
        });
      } catch (t) {
        if (v(t))
          return this._returnResult({ data: null, error: t });
        throw t;
      }
    });
  }
  async _challenge(e) {
    return this._acquireLock(this.lockAcquireTimeout, async () => {
      try {
        return await this._useSession(async (t) => {
          var s;
          const { data: n, error: i } = t;
          if (i)
            return this._returnResult({ data: null, error: i });
          const a = await b(this.fetch, "POST", `${this.url}/factors/${e.factorId}/challenge`, {
            body: e,
            headers: this.headers,
            jwt: (s = n == null ? void 0 : n.session) === null || s === void 0 ? void 0 : s.access_token
          });
          if (a.error)
            return a;
          const { data: o } = a;
          if (o.type !== "webauthn")
            return { data: o, error: null };
          switch (o.webauthn.type) {
            case "create":
              return {
                data: Object.assign(Object.assign({}, o), { webauthn: Object.assign(Object.assign({}, o.webauthn), { credential_options: Object.assign(Object.assign({}, o.webauthn.credential_options), { publicKey: Js(o.webauthn.credential_options.publicKey) }) }) }),
                error: null
              };
            case "request":
              return {
                data: Object.assign(Object.assign({}, o), { webauthn: Object.assign(Object.assign({}, o.webauthn), { credential_options: Object.assign(Object.assign({}, o.webauthn.credential_options), { publicKey: Ys(o.webauthn.credential_options.publicKey) }) }) }),
                error: null
              };
          }
        });
      } catch (t) {
        if (v(t))
          return this._returnResult({ data: null, error: t });
        throw t;
      }
    });
  }
  /**
   * {@see GoTrueMFAApi#challengeAndVerify}
   */
  async _challengeAndVerify(e) {
    const { data: t, error: s } = await this._challenge({
      factorId: e.factorId
    });
    return s ? this._returnResult({ data: null, error: s }) : await this._verify({
      factorId: e.factorId,
      challengeId: t.id,
      code: e.code
    });
  }
  /**
   * {@see GoTrueMFAApi#listFactors}
   */
  async _listFactors() {
    var e;
    const { data: { user: t }, error: s } = await this.getUser();
    if (s)
      return { data: null, error: s };
    const n = {
      all: [],
      phone: [],
      totp: [],
      webauthn: []
    };
    for (const i of (e = t == null ? void 0 : t.factors) !== null && e !== void 0 ? e : [])
      n.all.push(i), i.status === "verified" && n[i.factor_type].push(i);
    return {
      data: n,
      error: null
    };
  }
  /**
   * {@see GoTrueMFAApi#getAuthenticatorAssuranceLevel}
   */
  async _getAuthenticatorAssuranceLevel(e) {
    var t, s, n, i;
    if (e)
      try {
        const { payload: h } = Ce(e);
        let p = null;
        h.aal && (p = h.aal);
        let g = p;
        const { data: { user: _ }, error: y } = await this.getUser(e);
        if (y)
          return this._returnResult({ data: null, error: y });
        ((s = (t = _ == null ? void 0 : _.factors) === null || t === void 0 ? void 0 : t.filter((T) => T.status === "verified")) !== null && s !== void 0 ? s : []).length > 0 && (g = "aal2");
        const m = h.amr || [];
        return { data: { currentLevel: p, nextLevel: g, currentAuthenticationMethods: m }, error: null };
      } catch (h) {
        if (v(h))
          return this._returnResult({ data: null, error: h });
        throw h;
      }
    const { data: { session: a }, error: o } = await this.getSession();
    if (o)
      return this._returnResult({ data: null, error: o });
    if (!a)
      return {
        data: { currentLevel: null, nextLevel: null, currentAuthenticationMethods: [] },
        error: null
      };
    const { payload: l } = Ce(a.access_token);
    let c = null;
    l.aal && (c = l.aal);
    let u = c;
    ((i = (n = a.user.factors) === null || n === void 0 ? void 0 : n.filter((h) => h.status === "verified")) !== null && i !== void 0 ? i : []).length > 0 && (u = "aal2");
    const d = l.amr || [];
    return { data: { currentLevel: c, nextLevel: u, currentAuthenticationMethods: d }, error: null };
  }
  /**
   * Retrieves details about an OAuth authorization request.
   * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
   *
   * Returns authorization details including client info, scopes, and user information.
   * If the response includes only a redirect_url field, it means consent was already given - the caller
   * should handle the redirect manually if needed.
   */
  async _getAuthorizationDetails(e) {
    try {
      return await this._useSession(async (t) => {
        const { data: { session: s }, error: n } = t;
        return n ? this._returnResult({ data: null, error: n }) : s ? await b(this.fetch, "GET", `${this.url}/oauth/authorizations/${e}`, {
          headers: this.headers,
          jwt: s.access_token,
          xform: (i) => ({ data: i, error: null })
        }) : this._returnResult({ data: null, error: new U() });
      });
    } catch (t) {
      if (v(t))
        return this._returnResult({ data: null, error: t });
      throw t;
    }
  }
  /**
   * Approves an OAuth authorization request.
   * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
   */
  async _approveAuthorization(e, t) {
    try {
      return await this._useSession(async (s) => {
        const { data: { session: n }, error: i } = s;
        if (i)
          return this._returnResult({ data: null, error: i });
        if (!n)
          return this._returnResult({ data: null, error: new U() });
        const a = await b(this.fetch, "POST", `${this.url}/oauth/authorizations/${e}/consent`, {
          headers: this.headers,
          jwt: n.access_token,
          body: { action: "approve" },
          xform: (o) => ({ data: o, error: null })
        });
        return a.data && a.data.redirect_url && j() && !(t != null && t.skipBrowserRedirect) && window.location.assign(a.data.redirect_url), a;
      });
    } catch (s) {
      if (v(s))
        return this._returnResult({ data: null, error: s });
      throw s;
    }
  }
  /**
   * Denies an OAuth authorization request.
   * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
   */
  async _denyAuthorization(e, t) {
    try {
      return await this._useSession(async (s) => {
        const { data: { session: n }, error: i } = s;
        if (i)
          return this._returnResult({ data: null, error: i });
        if (!n)
          return this._returnResult({ data: null, error: new U() });
        const a = await b(this.fetch, "POST", `${this.url}/oauth/authorizations/${e}/consent`, {
          headers: this.headers,
          jwt: n.access_token,
          body: { action: "deny" },
          xform: (o) => ({ data: o, error: null })
        });
        return a.data && a.data.redirect_url && j() && !(t != null && t.skipBrowserRedirect) && window.location.assign(a.data.redirect_url), a;
      });
    } catch (s) {
      if (v(s))
        return this._returnResult({ data: null, error: s });
      throw s;
    }
  }
  /**
   * Lists all OAuth grants that the authenticated user has authorized.
   * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
   */
  async _listOAuthGrants() {
    try {
      return await this._useSession(async (e) => {
        const { data: { session: t }, error: s } = e;
        return s ? this._returnResult({ data: null, error: s }) : t ? await b(this.fetch, "GET", `${this.url}/user/oauth/grants`, {
          headers: this.headers,
          jwt: t.access_token,
          xform: (n) => ({ data: n, error: null })
        }) : this._returnResult({ data: null, error: new U() });
      });
    } catch (e) {
      if (v(e))
        return this._returnResult({ data: null, error: e });
      throw e;
    }
  }
  /**
   * Revokes a user's OAuth grant for a specific client.
   * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
   */
  async _revokeOAuthGrant(e) {
    try {
      return await this._useSession(async (t) => {
        const { data: { session: s }, error: n } = t;
        return n ? this._returnResult({ data: null, error: n }) : s ? (await b(this.fetch, "DELETE", `${this.url}/user/oauth/grants`, {
          headers: this.headers,
          jwt: s.access_token,
          query: { client_id: e.clientId },
          noResolveJson: !0
        }), { data: {}, error: null }) : this._returnResult({ data: null, error: new U() });
      });
    } catch (t) {
      if (v(t))
        return this._returnResult({ data: null, error: t });
      throw t;
    }
  }
  async fetchJwk(e, t = { keys: [] }) {
    let s = t.keys.find((o) => o.kid === e);
    if (s)
      return s;
    const n = Date.now();
    if (s = this.jwks.keys.find((o) => o.kid === e), s && this.jwks_cached_at + os > n)
      return s;
    const { data: i, error: a } = await b(this.fetch, "GET", `${this.url}/.well-known/jwks.json`, {
      headers: this.headers
    });
    if (a)
      throw a;
    return !i.keys || i.keys.length === 0 || (this.jwks = i, this.jwks_cached_at = n, s = i.keys.find((o) => o.kid === e), !s) ? null : s;
  }
  /**
   * Extracts the JWT claims present in the access token by first verifying the
   * JWT against the server's JSON Web Key Set endpoint
   * `/.well-known/jwks.json` which is often cached, resulting in significantly
   * faster responses. Prefer this method over {@link #getUser} which always
   * sends a request to the Auth server for each JWT.
   *
   * If the project is not using an asymmetric JWT signing key (like ECC or
   * RSA) it always sends a request to the Auth server (similar to {@link
   * #getUser}) to verify the JWT.
   *
   * @param jwt An optional specific JWT you wish to verify, not the one you
   *            can obtain from {@link #getSession}.
   * @param options Various additional options that allow you to customize the
   *                behavior of this method.
   */
  async getClaims(e, t = {}) {
    try {
      let s = e;
      if (!s) {
        const { data: h, error: p } = await this.getSession();
        if (p || !h.session)
          return this._returnResult({ data: null, error: p });
        s = h.session.access_token;
      }
      const { header: n, payload: i, signature: a, raw: { header: o, payload: l } } = Ce(s);
      t != null && t.allowExpired || Is(i.exp);
      const c = !n.alg || n.alg.startsWith("HS") || !n.kid || !("crypto" in globalThis && "subtle" in globalThis.crypto) ? null : await this.fetchJwk(n.kid, t != null && t.keys ? { keys: t.keys } : t == null ? void 0 : t.jwks);
      if (!c) {
        const { error: h } = await this.getUser(s);
        if (h)
          throw h;
        return {
          data: {
            claims: i,
            header: n,
            signature: a
          },
          error: null
        };
      }
      const u = Ps(n.alg), f = await crypto.subtle.importKey("jwk", c, u, !0, [
        "verify"
      ]);
      if (!await crypto.subtle.verify(u, f, a, _s(`${o}.${l}`)))
        throw new tt("Invalid JWT signature");
      return {
        data: {
          claims: i,
          header: n,
          signature: a
        },
        error: null
      };
    } catch (s) {
      if (v(s))
        return this._returnResult({ data: null, error: s });
      throw s;
    }
  }
}
Te.nextInstanceID = {};
const cn = Te, un = "2.99.2";
let ge = "";
typeof Deno < "u" ? ge = "deno" : typeof document < "u" ? ge = "web" : typeof navigator < "u" && navigator.product === "ReactNative" ? ge = "react-native" : ge = "node";
const hn = { "X-Client-Info": `supabase-js-${ge}/${un}` }, dn = { headers: hn }, fn = { schema: "public" }, pn = {
  autoRefreshToken: !0,
  persistSession: !0,
  detectSessionInUrl: !0,
  flowType: "implicit"
}, gn = {};
function Se(r) {
  "@babel/helpers - typeof";
  return Se = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
    return typeof e;
  } : function(e) {
    return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
  }, Se(r);
}
function _n(r, e) {
  if (Se(r) != "object" || !r) return r;
  var t = r[Symbol.toPrimitive];
  if (t !== void 0) {
    var s = t.call(r, e || "default");
    if (Se(s) != "object") return s;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return (e === "string" ? String : Number)(r);
}
function yn(r) {
  var e = _n(r, "string");
  return Se(e) == "symbol" ? e : e + "";
}
function mn(r, e, t) {
  return (e = yn(e)) in r ? Object.defineProperty(r, e, {
    value: t,
    enumerable: !0,
    configurable: !0,
    writable: !0
  }) : r[e] = t, r;
}
function Ot(r, e) {
  var t = Object.keys(r);
  if (Object.getOwnPropertySymbols) {
    var s = Object.getOwnPropertySymbols(r);
    e && (s = s.filter(function(n) {
      return Object.getOwnPropertyDescriptor(r, n).enumerable;
    })), t.push.apply(t, s);
  }
  return t;
}
function A(r) {
  for (var e = 1; e < arguments.length; e++) {
    var t = arguments[e] != null ? arguments[e] : {};
    e % 2 ? Ot(Object(t), !0).forEach(function(s) {
      mn(r, s, t[s]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(r, Object.getOwnPropertyDescriptors(t)) : Ot(Object(t)).forEach(function(s) {
      Object.defineProperty(r, s, Object.getOwnPropertyDescriptor(t, s));
    });
  }
  return r;
}
const vn = (r) => r ? (...e) => r(...e) : (...e) => fetch(...e), wn = () => Headers, bn = (r, e, t) => {
  const s = vn(t), n = wn();
  return async (i, a) => {
    var o;
    const l = (o = await e()) !== null && o !== void 0 ? o : r;
    let c = new n(a == null ? void 0 : a.headers);
    return c.has("apikey") || c.set("apikey", r), c.has("Authorization") || c.set("Authorization", `Bearer ${l}`), s(i, A(A({}, a), {}, { headers: c }));
  };
};
function En(r) {
  return r.endsWith("/") ? r : r + "/";
}
function Tn(r, e) {
  var t, s;
  const { db: n, auth: i, realtime: a, global: o } = r, { db: l, auth: c, realtime: u, global: f } = e, d = {
    db: A(A({}, l), n),
    auth: A(A({}, c), i),
    realtime: A(A({}, u), a),
    storage: {},
    global: A(A(A({}, f), o), {}, { headers: A(A({}, (t = f == null ? void 0 : f.headers) !== null && t !== void 0 ? t : {}), (s = o == null ? void 0 : o.headers) !== null && s !== void 0 ? s : {}) }),
    accessToken: async () => ""
  };
  return r.accessToken ? d.accessToken = r.accessToken : delete d.accessToken, d;
}
function Sn(r) {
  const e = r == null ? void 0 : r.trim();
  if (!e) throw new Error("supabaseUrl is required.");
  if (!e.match(/^https?:\/\//i)) throw new Error("Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.");
  try {
    return new URL(En(e));
  } catch {
    throw Error("Invalid supabaseUrl: Provided URL is malformed.");
  }
}
var kn = class extends cn {
  constructor(r) {
    super(r);
  }
}, Rn = class {
  /**
  * Create a new client for use in the browser.
  *
  * @category Initializing
  *
  * @param supabaseUrl The unique Supabase URL which is supplied when you create a new project in your project dashboard.
  * @param supabaseKey The unique Supabase Key which is supplied when you create a new project in your project dashboard.
  * @param options.db.schema You can switch in between schemas. The schema needs to be on the list of exposed schemas inside Supabase.
  * @param options.auth.autoRefreshToken Set to "true" if you want to automatically refresh the token before expiring.
  * @param options.auth.persistSession Set to "true" if you want to automatically save the user session into local storage.
  * @param options.auth.detectSessionInUrl Set to "true" if you want to automatically detects OAuth grants in the URL and signs in the user.
  * @param options.realtime Options passed along to realtime-js constructor.
  * @param options.storage Options passed along to the storage-js constructor.
  * @param options.global.fetch A custom fetch implementation.
  * @param options.global.headers Any additional headers to send with each network request.
  *
  * @example Creating a client
  * ```js
  * import { createClient } from '@supabase/supabase-js'
  *
  * // Create a single supabase client for interacting with your database
  * const supabase = createClient('https://xyzcompany.supabase.co', 'publishable-or-anon-key')
  * ```
  *
  * @example With a custom domain
  * ```js
  * import { createClient } from '@supabase/supabase-js'
  *
  * // Use a custom domain as the supabase URL
  * const supabase = createClient('https://my-custom-domain.com', 'publishable-or-anon-key')
  * ```
  *
  * @example With additional parameters
  * ```js
  * import { createClient } from '@supabase/supabase-js'
  *
  * const options = {
  *   db: {
  *     schema: 'public',
  *   },
  *   auth: {
  *     autoRefreshToken: true,
  *     persistSession: true,
  *     detectSessionInUrl: true
  *   },
  *   global: {
  *     headers: { 'x-my-custom-header': 'my-app-name' },
  *   },
  * }
  * const supabase = createClient("https://xyzcompany.supabase.co", "publishable-or-anon-key", options)
  * ```
  *
  * @exampleDescription With custom schemas
  * By default the API server points to the `public` schema. You can enable other database schemas within the Dashboard.
  * Go to [Settings > API > Exposed schemas](/dashboard/project/_/settings/api) and add the schema which you want to expose to the API.
  *
  * Note: each client connection can only access a single schema, so the code above can access the `other_schema` schema but cannot access the `public` schema.
  *
  * @example With custom schemas
  * ```js
  * import { createClient } from '@supabase/supabase-js'
  *
  * const supabase = createClient('https://xyzcompany.supabase.co', 'publishable-or-anon-key', {
  *   // Provide a custom schema. Defaults to "public".
  *   db: { schema: 'other_schema' }
  * })
  * ```
  *
  * @exampleDescription Custom fetch implementation
  * `supabase-js` uses the [`cross-fetch`](https://www.npmjs.com/package/cross-fetch) library to make HTTP requests,
  * but an alternative `fetch` implementation can be provided as an option.
  * This is most useful in environments where `cross-fetch` is not compatible (for instance Cloudflare Workers).
  *
  * @example Custom fetch implementation
  * ```js
  * import { createClient } from '@supabase/supabase-js'
  *
  * const supabase = createClient('https://xyzcompany.supabase.co', 'publishable-or-anon-key', {
  *   global: { fetch: fetch.bind(globalThis) }
  * })
  * ```
  *
  * @exampleDescription React Native options with AsyncStorage
  * For React Native we recommend using `AsyncStorage` as the storage implementation for Supabase Auth.
  *
  * @example React Native options with AsyncStorage
  * ```js
  * import 'react-native-url-polyfill/auto'
  * import { createClient } from '@supabase/supabase-js'
  * import AsyncStorage from "@react-native-async-storage/async-storage";
  *
  * const supabase = createClient("https://xyzcompany.supabase.co", "publishable-or-anon-key", {
  *   auth: {
  *     storage: AsyncStorage,
  *     autoRefreshToken: true,
  *     persistSession: true,
  *     detectSessionInUrl: false,
  *   },
  * });
  * ```
  *
  * @exampleDescription React Native options with Expo SecureStore
  * If you wish to encrypt the user's session information, you can use `aes-js` and store the encryption key in Expo SecureStore.
  * The `aes-js` library, a reputable JavaScript-only implementation of the AES encryption algorithm in CTR mode.
  * A new 256-bit encryption key is generated using the `react-native-get-random-values` library.
  * This key is stored inside Expo's SecureStore, while the value is encrypted and placed inside AsyncStorage.
  *
  * Please make sure that:
  * - You keep the `expo-secure-store`, `aes-js` and `react-native-get-random-values` libraries up-to-date.
  * - Choose the correct [`SecureStoreOptions`](https://docs.expo.dev/versions/latest/sdk/securestore/#securestoreoptions) for your app's needs.
  *   E.g. [`SecureStore.WHEN_UNLOCKED`](https://docs.expo.dev/versions/latest/sdk/securestore/#securestorewhen_unlocked) regulates when the data can be accessed.
  * - Carefully consider optimizations or other modifications to the above example, as those can lead to introducing subtle security vulnerabilities.
  *
  * @example React Native options with Expo SecureStore
  * ```ts
  * import 'react-native-url-polyfill/auto'
  * import { createClient } from '@supabase/supabase-js'
  * import AsyncStorage from '@react-native-async-storage/async-storage';
  * import * as SecureStore from 'expo-secure-store';
  * import * as aesjs from 'aes-js';
  * import 'react-native-get-random-values';
  *
  * // As Expo's SecureStore does not support values larger than 2048
  * // bytes, an AES-256 key is generated and stored in SecureStore, while
  * // it is used to encrypt/decrypt values stored in AsyncStorage.
  * class LargeSecureStore {
  *   private async _encrypt(key: string, value: string) {
  *     const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));
  *
  *     const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
  *     const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
  *
  *     await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
  *
  *     return aesjs.utils.hex.fromBytes(encryptedBytes);
  *   }
  *
  *   private async _decrypt(key: string, value: string) {
  *     const encryptionKeyHex = await SecureStore.getItemAsync(key);
  *     if (!encryptionKeyHex) {
  *       return encryptionKeyHex;
  *     }
  *
  *     const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(encryptionKeyHex), new aesjs.Counter(1));
  *     const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
  *
  *     return aesjs.utils.utf8.fromBytes(decryptedBytes);
  *   }
  *
  *   async getItem(key: string) {
  *     const encrypted = await AsyncStorage.getItem(key);
  *     if (!encrypted) { return encrypted; }
  *
  *     return await this._decrypt(key, encrypted);
  *   }
  *
  *   async removeItem(key: string) {
  *     await AsyncStorage.removeItem(key);
  *     await SecureStore.deleteItemAsync(key);
  *   }
  *
  *   async setItem(key: string, value: string) {
  *     const encrypted = await this._encrypt(key, value);
  *
  *     await AsyncStorage.setItem(key, encrypted);
  *   }
  * }
  *
  * const supabase = createClient("https://xyzcompany.supabase.co", "publishable-or-anon-key", {
  *   auth: {
  *     storage: new LargeSecureStore(),
  *     autoRefreshToken: true,
  *     persistSession: true,
  *     detectSessionInUrl: false,
  *   },
  * });
  * ```
  *
  * @example With a database query
  * ```ts
  * import { createClient } from '@supabase/supabase-js'
  *
  * const supabase = createClient('https://xyzcompany.supabase.co', 'public-anon-key')
  *
  * const { data } = await supabase.from('profiles').select('*')
  * ```
  */
  constructor(r, e, t) {
    var s, n;
    this.supabaseUrl = r, this.supabaseKey = e;
    const i = Sn(r);
    if (!e) throw new Error("supabaseKey is required.");
    this.realtimeUrl = new URL("realtime/v1", i), this.realtimeUrl.protocol = this.realtimeUrl.protocol.replace("http", "ws"), this.authUrl = new URL("auth/v1", i), this.storageUrl = new URL("storage/v1", i), this.functionsUrl = new URL("functions/v1", i);
    const a = `sb-${i.hostname.split(".")[0]}-auth-token`, o = {
      db: fn,
      realtime: gn,
      auth: A(A({}, pn), {}, { storageKey: a }),
      global: dn
    }, l = Tn(t ?? {}, o);
    if (this.storageKey = (s = l.auth.storageKey) !== null && s !== void 0 ? s : "", this.headers = (n = l.global.headers) !== null && n !== void 0 ? n : {}, l.accessToken)
      this.accessToken = l.accessToken, this.auth = new Proxy({}, { get: (u, f) => {
        throw new Error(`@supabase/supabase-js: Supabase Client is configured with the accessToken option, accessing supabase.auth.${String(f)} is not possible`);
      } });
    else {
      var c;
      this.auth = this._initSupabaseAuthClient((c = l.auth) !== null && c !== void 0 ? c : {}, this.headers, l.global.fetch);
    }
    this.fetch = bn(e, this._getAccessToken.bind(this), l.global.fetch), this.realtime = this._initRealtimeClient(A({
      headers: this.headers,
      accessToken: this._getAccessToken.bind(this)
    }, l.realtime)), this.accessToken && Promise.resolve(this.accessToken()).then((u) => this.realtime.setAuth(u)).catch((u) => console.warn("Failed to set initial Realtime auth token:", u)), this.rest = new cr(new URL("rest/v1", i).href, {
      headers: this.headers,
      schema: l.db.schema,
      fetch: this.fetch,
      timeout: l.db.timeout,
      urlLengthLimit: l.db.urlLengthLimit
    }), this.storage = new rs(this.storageUrl.href, this.headers, this.fetch, t == null ? void 0 : t.storage), l.accessToken || this._listenForAuthEvents();
  }
  /**
  * Supabase Functions allows you to deploy and invoke edge functions.
  */
  get functions() {
    return new tr(this.functionsUrl.href, {
      headers: this.headers,
      customFetch: this.fetch
    });
  }
  /**
  * Perform a query on a table or a view.
  *
  * @param relation - The table or view name to query
  */
  from(r) {
    return this.rest.from(r);
  }
  /**
  * Select a schema to query or perform an function (rpc) call.
  *
  * The schema needs to be on the list of exposed schemas inside Supabase.
  *
  * @param schema - The schema to query
  */
  schema(r) {
    return this.rest.schema(r);
  }
  /**
  * Perform a function call.
  *
  * @param fn - The function name to call
  * @param args - The arguments to pass to the function call
  * @param options - Named parameters
  * @param options.head - When set to `true`, `data` will not be returned.
  * Useful if you only need the count.
  * @param options.get - When set to `true`, the function will be called with
  * read-only access mode.
  * @param options.count - Count algorithm to use to count rows returned by the
  * function. Only applicable for [set-returning
  * functions](https://www.postgresql.org/docs/current/functions-srf.html).
  *
  * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
  * hood.
  *
  * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
  * statistics under the hood.
  *
  * `"estimated"`: Uses exact count for low numbers and planned count for high
  * numbers.
  */
  rpc(r, e = {}, t = {
    head: !1,
    get: !1,
    count: void 0
  }) {
    return this.rest.rpc(r, e, t);
  }
  /**
  * Creates a Realtime channel with Broadcast, Presence, and Postgres Changes.
  *
  * @param {string} name - The name of the Realtime channel.
  * @param {Object} opts - The options to pass to the Realtime channel.
  *
  */
  channel(r, e = { config: {} }) {
    return this.realtime.channel(r, e);
  }
  /**
  * Returns all Realtime channels.
  */
  getChannels() {
    return this.realtime.getChannels();
  }
  /**
  * Unsubscribes and removes Realtime channel from Realtime client.
  *
  * @param {RealtimeChannel} channel - The name of the Realtime channel.
  *
  */
  removeChannel(r) {
    return this.realtime.removeChannel(r);
  }
  /**
  * Unsubscribes and removes all Realtime channels from Realtime client.
  */
  removeAllChannels() {
    return this.realtime.removeAllChannels();
  }
  async _getAccessToken() {
    var r = this, e, t;
    if (r.accessToken) return await r.accessToken();
    const { data: s } = await r.auth.getSession();
    return (e = (t = s.session) === null || t === void 0 ? void 0 : t.access_token) !== null && e !== void 0 ? e : r.supabaseKey;
  }
  _initSupabaseAuthClient({ autoRefreshToken: r, persistSession: e, detectSessionInUrl: t, storage: s, userStorage: n, storageKey: i, flowType: a, lock: o, debug: l, throwOnError: c }, u, f) {
    const d = {
      Authorization: `Bearer ${this.supabaseKey}`,
      apikey: `${this.supabaseKey}`
    };
    return new kn({
      url: this.authUrl.href,
      headers: A(A({}, d), u),
      storageKey: i,
      autoRefreshToken: r,
      persistSession: e,
      detectSessionInUrl: t,
      storage: s,
      userStorage: n,
      flowType: a,
      lock: o,
      debug: l,
      throwOnError: c,
      fetch: f,
      hasCustomAuthorizationHeader: Object.keys(this.headers).some((h) => h.toLowerCase() === "authorization")
    });
  }
  _initRealtimeClient(r) {
    return new Rr(this.realtimeUrl.href, A(A({}, r), {}, { params: A(A({}, { apikey: this.supabaseKey }), r == null ? void 0 : r.params) }));
  }
  _listenForAuthEvents() {
    return this.auth.onAuthStateChange((r, e) => {
      this._handleTokenChanged(r, "CLIENT", e == null ? void 0 : e.access_token);
    });
  }
  _handleTokenChanged(r, e, t) {
    (r === "TOKEN_REFRESHED" || r === "SIGNED_IN") && this.changedAccessToken !== t ? (this.changedAccessToken = t, this.realtime.setAuth(t)) : r === "SIGNED_OUT" && (this.realtime.setAuth(), e == "STORAGE" && this.auth.signOut(), this.changedAccessToken = void 0);
  }
};
const An = (r, e, t) => new Rn(r, e, t);
function On() {
  if (typeof window < "u") return !1;
  const r = globalThis.process;
  if (!r) return !1;
  const e = r.version;
  if (e == null) return !1;
  const t = e.match(/^v(\d+)\./);
  return t ? parseInt(t[1], 10) <= 18 : !1;
}
On() && console.warn("⚠️  Node.js 18 and below are deprecated and will no longer be supported in future versions of @supabase/supabase-js. Please upgrade to Node.js 20 or later. For more information, visit: https://github.com/orgs/supabase/discussions/37217");
async function In(r, e) {
  const t = ce.join(Z.getPath("userData"), "pharmabay.sqlite"), s = new rt(t), n = An(r, e), i = [
    "products",
    "inventory_snapshots",
    "import_batches",
    "product_images",
    "ebay_drafts",
    "ebay_publish_jobs",
    "shopify_drafts",
    "shopify_variants",
    "shopify_connections",
    "shopify_sync_runs",
    "shopify_products",
    "shopify_media",
    "shopify_write_jobs",
    "export_batches",
    "ebay_categories",
    "shopify_categories",
    "category_mappings",
    "compliance_rules"
  ];
  for (const a of i)
    try {
      let o = [], l = 0;
      const c = 1e3;
      for (; ; ) {
        const { data: u, error: f } = await n.from(a).select("*").range(l * c, (l + 1) * c - 1);
        if (f) throw f;
        if (!u || u.length === 0 || (o.push(...u), u.length < c)) break;
        l++;
      }
      if (o.length > 0) {
        const u = Object.keys(o[0]), f = u.map(() => "?").join(", "), d = s.prepare(`INSERT OR REPLACE INTO ${a} (${u.join(", ")}) VALUES (${f})`);
        s.transaction((p) => {
          for (const g of p) {
            const _ = u.map((y) => typeof g[y] == "object" && g[y] !== null ? JSON.stringify(g[y]) : g[y] ?? null);
            d.run(_);
          }
        })(o);
      }
    } catch (o) {
      console.error(`Failed to migrate table ${a}:`, o.message);
    }
  return { success: !0, message: "Migration completed." };
}
const Pn = "https://openrouter.ai/api/v1/chat/completions";
function Cn() {
  try {
    const r = $.prepare("SELECT value FROM settings WHERE key = ?").get("openrouter_api_key");
    return (r == null ? void 0 : r.value) || null;
  } catch {
    return null;
  }
}
function jn() {
  try {
    const r = $.prepare("SELECT value FROM settings WHERE key = ?").get("openrouter_model");
    return (r == null ? void 0 : r.value) || "meta-llama/llama-4-maverick:free";
  } catch {
    return "meta-llama/llama-4-maverick:free";
  }
}
async function $n(r, e) {
  var o, l, c;
  const t = Cn();
  if (!t)
    throw new Error("OpenRouter API key not configured. Go to Settings → AI to add your key.");
  const s = jn(), n = await fetch(Pn, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://pharmabay.local",
      "X-Title": "PharmaBay Lister"
    },
    body: JSON.stringify({
      model: s,
      messages: [
        { role: "system", content: r },
        { role: "user", content: e }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    })
  });
  if (!n.ok) {
    const u = await n.text();
    throw new Error(`OpenRouter API error (${n.status}): ${u}`);
  }
  const a = (c = (l = (o = (await n.json()).choices) == null ? void 0 : o[0]) == null ? void 0 : l.message) == null ? void 0 : c.content;
  if (!a)
    throw new Error("No content returned from LLM");
  try {
    return JSON.parse(a);
  } catch {
    const u = a.match(/\{[\s\S]*\}/);
    if (u)
      return JSON.parse(u[0]);
    throw new Error("LLM returned non-JSON response: " + a.slice(0, 200));
  }
}
const Un = `You are a pharmacy product data enrichment specialist for an Australian online pharmacy.
Your job is to take raw product data and generate rich, accurate listing content for eBay and Shopify.

CRITICAL RULES:
- NEVER make therapeutic claims (e.g., "cures", "treats", "prevents")
- Use TGA-safe language only
- Be factual and descriptive, not promotional
- Include pack size and form in descriptions
- Keep eBay titles under 80 characters
- Return ONLY valid JSON, no markdown

Return a JSON object with these fields (omit any you can't determine):
{
  "normalized_product_name": "Clean, standardized product name",
  "brand": "Brand name",
  "product_type": "Category (e.g., Supplement, Skincare, Medical Device)",
  "product_form": "Form (e.g., Tablet, Cream, Liquid, Capsule)",
  "description": "Plain text product description (2-3 sentences)",
  "description_html": "<p>HTML formatted description with sections</p>",
  "ingredients_summary": "Key active ingredients",
  "directions_summary": "Usage directions if applicable",
  "warnings_summary": "Safety warnings and precautions",
  "claims_summary": "General benefit claims (TGA-safe only)",
  "seo_title": "SEO optimized title (max 70 chars)",
  "seo_description": "Meta description (max 160 chars)",
  "subtitle": "Short subtitle for listings",
  "suggested_tags": ["tag1", "tag2", "tag3"],
  "ebay_category_id": "eBay category ID if known",
  "upc": "UPC if detectable from barcode",
  "mpn": "Manufacturer part number if known"
}`;
async function Ht(r) {
  const e = `Enrich this pharmacy product:

Product Name: ${r.source_product_name || r.normalized_product_name || "Unknown"}
Brand: ${r.brand || "Unknown"}
Barcode: ${r.barcode || "N/A"}
Category: ${r.z_category || r.product_type || "N/A"}
Department: ${r.department || "N/A"}
Strength: ${r.strength || "N/A"}
Pack Size: ${r.pack_size || "N/A"}
Form: ${r.product_form || "N/A"}
Cost Price: $${r.cost_price || "N/A"}
Sell Price: $${r.sell_price || "N/A"}

Generate comprehensive enrichment data for this product.`;
  return $n(Un, e);
}
Jt();
G.handle("db-query", async (r, e, t) => {
  try {
    return { data: Yt(e, t), error: null };
  } catch (s) {
    return console.error("DB Error:", s), { data: null, error: s.message };
  }
});
G.handle("migrate-data", async (r, e, t) => {
  try {
    return { data: await In(e, t), error: null };
  } catch (s) {
    return { data: null, error: s.message };
  }
});
G.handle("ai-generate-description", async (r, e) => {
  try {
    const t = e == null ? void 0 : e.product_id;
    if (!t) throw new Error("product_id is required");
    const s = $.prepare("SELECT * FROM products WHERE id = ?").get(t);
    if (!s) throw new Error(`Product ${t} not found`);
    return { data: { generated: await Ht(s) }, error: null };
  } catch (t) {
    return console.error("AI enrichment error:", t), { data: null, error: { message: t.message } };
  }
});
G.handle("market-research", async (r, e) => {
  try {
    const t = e == null ? void 0 : e.queueItemId;
    if (!t) throw new Error("queueItemId is required");
    const s = $.prepare("SELECT * FROM product_research_queue WHERE id = ?").get(t);
    if (!s) throw new Error(`Queue item ${t} not found`);
    const n = $.prepare("SELECT * FROM products WHERE id = ?").get(s.product_id);
    if (!n) throw new Error(`Product ${s.product_id} not found`);
    $.prepare("UPDATE product_research_queue SET status = ? WHERE id = ?").run("processing", t);
    const i = await Ht(n), a = (/* @__PURE__ */ new Date()).toISOString(), o = {
      enrichment_status: "complete",
      enrichment_confidence: "high",
      enrichment_summary: JSON.stringify(i),
      updated_at: a
    };
    i.normalized_product_name && (o.normalized_product_name = i.normalized_product_name), i.brand && (o.brand = i.brand), i.product_type && (o.product_type = i.product_type), i.product_form && (o.product_form = i.product_form), i.ingredients_summary && (o.ingredients_summary = i.ingredients_summary), i.directions_summary && (o.directions_summary = i.directions_summary), i.warnings_summary && (o.warnings_summary = i.warnings_summary), i.claims_summary && (o.claims_summary = i.claims_summary);
    const l = Object.keys(o).map((f) => `"${f}" = ?`).join(", "), c = Object.values(o);
    $.prepare(`UPDATE products SET ${l} WHERE id = ?`).run(...c, n.id);
    const u = crypto.randomUUID();
    return $.prepare(
      `INSERT OR REPLACE INTO product_research_results 
      (id, product_id, research_run_id, source_domain, extracted_payload, confidence_score, fields_found, auto_filled_fields, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      u,
      n.id,
      s.research_run_id,
      "openrouter.ai",
      JSON.stringify({ fields: i }),
      0.85,
      JSON.stringify(Object.keys(i)),
      JSON.stringify(Object.keys(o)),
      a
    ), $.prepare("UPDATE product_research_queue SET status = ? WHERE id = ?").run("completed", t), { data: { success: !0 }, error: null };
  } catch (t) {
    if (console.error("Market research error:", t), e != null && e.queueItemId)
      try {
        $.prepare("UPDATE product_research_queue SET status = ?, error_message = ? WHERE id = ?").run("failed", t.message, e.queueItemId);
      } catch {
      }
    return { data: null, error: { message: t.message } };
  }
});
G.handle("get-setting", async (r, e) => {
  try {
    const t = $.prepare("SELECT value FROM settings WHERE key = ?").get(e);
    return { data: (t == null ? void 0 : t.value) || null, error: null };
  } catch (t) {
    return { data: null, error: t.message };
  }
});
G.handle("set-setting", async (r, e, t) => {
  try {
    return $.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(e, t), { data: !0, error: null };
  } catch (s) {
    return { data: null, error: s.message };
  }
});
G.handle("pick-sqlite-file", async () => {
  const r = await Xt.showOpenDialog({
    title: "Select SQLite Database to Import",
    filters: [{ name: "SQLite Database", extensions: ["sqlite", "sqlite3", "db"] }],
    properties: ["openFile"]
  });
  return r.canceled || r.filePaths.length === 0 ? { data: null, error: null } : { data: r.filePaths[0], error: null };
});
G.handle("import-sqlite", async (r, e) => {
  try {
    const t = new rt(e, { readonly: !0 }), s = $, n = t.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all().map((a) => a.name);
    let i = 0;
    for (const a of n) {
      if (!s.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(a)) {
        console.log(`Skipping table '${a}' — does not exist in local DB`);
        continue;
      }
      const l = t.prepare(`SELECT * FROM "${a}"`).all();
      if (l.length === 0) continue;
      const c = Object.keys(l[0]), u = s.pragma(`table_info("${a}")`).map((y) => y.name), f = new Set(u), d = c.filter((y) => f.has(y));
      if (d.length === 0) continue;
      const h = d.map(() => "?").join(", "), p = d.map((y) => `"${y}"`).join(", "), g = s.prepare(
        `INSERT OR REPLACE INTO "${a}" (${p}) VALUES (${h})`
      );
      s.transaction((y) => {
        for (const w of y) {
          const m = d.map((T) => {
            const R = w[T];
            return R !== null && typeof R == "object" ? JSON.stringify(R) : R;
          });
          g.run(...m);
        }
      })(l), i += l.length, console.log(`Imported ${l.length} rows into '${a}'`);
    }
    return t.close(), { data: { message: `Imported ${i} rows from ${n.length} tables` }, error: null };
  } catch (t) {
    return console.error("Import error:", t), { data: null, error: t.message };
  }
});
let ie = null;
function It() {
  if (ie = new Pt({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: ce.join(Z.getAppPath(), "dist-electron", "preload.mjs"),
      nodeIntegration: !1,
      contextIsolation: !0
    }
  }), ie.webContents.on("console-message", (r, e, t, s, n) => {
    console.log(`[Renderer] ${t} (line: ${s}, source: ${n})`);
  }), process.env.VITE_DEV_SERVER_URL)
    ie.loadURL(process.env.VITE_DEV_SERVER_URL), ie.webContents.openDevTools();
  else {
    const r = ce.join(process.resourcesPath, "app");
    console.log("Loading from:", ce.join(r, "index.html")), ie.loadFile(ce.join(r, "index.html")), ie.webContents.openDevTools();
  }
}
Z.whenReady().then(() => {
  It(), Z.on("activate", () => {
    Pt.getAllWindows().length === 0 && It();
  });
});
Z.on("window-all-closed", () => {
  process.platform !== "darwin" && Z.quit();
});
