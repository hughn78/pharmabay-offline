export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      category_mappings: {
        Row: {
          confidence: number | null
          ebay_category_id: string | null
          ebay_category_name: string | null
          id: string
          is_active: boolean | null
          product_keywords: string[] | null
          shopify_product_category: string | null
          shopify_type: string | null
          z_category: string | null
          z_department: string | null
        }
        Insert: {
          confidence?: number | null
          ebay_category_id?: string | null
          ebay_category_name?: string | null
          id?: string
          is_active?: boolean | null
          product_keywords?: string[] | null
          shopify_product_category?: string | null
          shopify_type?: string | null
          z_category?: string | null
          z_department?: string | null
        }
        Update: {
          confidence?: number | null
          ebay_category_id?: string | null
          ebay_category_name?: string | null
          id?: string
          is_active?: boolean | null
          product_keywords?: string[] | null
          shopify_product_category?: string | null
          shopify_type?: string | null
          z_category?: string | null
          z_department?: string | null
        }
        Relationships: []
      }
      change_log: {
        Row: {
          action: string | null
          after_json: Json | null
          before_json: Json | null
          changed_by: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
        }
        Insert: {
          action?: string | null
          after_json?: Json | null
          before_json?: Json | null
          changed_by?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
        }
        Update: {
          action?: string | null
          after_json?: Json | null
          before_json?: Json | null
          changed_by?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
        }
        Relationships: []
      }
      channel_listing_import_batches: {
        Row: {
          ambiguous_count: number | null
          error_count: number | null
          filename: string | null
          id: string
          imported_at: string
          imported_by: string | null
          matched_count: number | null
          notes: string | null
          platform: string
          row_count: number | null
          unmatched_count: number | null
        }
        Insert: {
          ambiguous_count?: number | null
          error_count?: number | null
          filename?: string | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          matched_count?: number | null
          notes?: string | null
          platform: string
          row_count?: number | null
          unmatched_count?: number | null
        }
        Update: {
          ambiguous_count?: number | null
          error_count?: number | null
          filename?: string | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          matched_count?: number | null
          notes?: string | null
          platform?: string
          row_count?: number | null
          unmatched_count?: number | null
        }
        Relationships: []
      }
      channel_listing_matches: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          import_row_id: string
          is_confirmed: boolean | null
          match_confidence: string | null
          match_method: string | null
          platform: string
          product_id: string | null
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          import_row_id: string
          is_confirmed?: boolean | null
          match_confidence?: string | null
          match_method?: string | null
          platform: string
          product_id?: string | null
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          import_row_id?: string
          is_confirmed?: boolean | null
          match_confidence?: string | null
          match_method?: string | null
          platform?: string
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_listing_matches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_rules: {
        Row: {
          action: string | null
          id: string
          is_active: boolean | null
          match_field: string | null
          match_value: string | null
          operator: string | null
          priority: number | null
          reason: string | null
          rule_name: string | null
          rule_type: string | null
        }
        Insert: {
          action?: string | null
          id?: string
          is_active?: boolean | null
          match_field?: string | null
          match_value?: string | null
          operator?: string | null
          priority?: number | null
          reason?: string | null
          rule_name?: string | null
          rule_type?: string | null
        }
        Update: {
          action?: string | null
          id?: string
          is_active?: boolean | null
          match_field?: string | null
          match_value?: string | null
          operator?: string | null
          priority?: number | null
          reason?: string | null
          rule_name?: string | null
          rule_type?: string | null
        }
        Relationships: []
      }
      ebay_categories: {
        Row: {
          category_id: string | null
          category_name: string | null
          id: string
        }
        Insert: {
          category_id?: string | null
          category_name?: string | null
          id?: string
        }
        Update: {
          category_id?: string | null
          category_name?: string | null
          id?: string
        }
        Relationships: []
      }
      ebay_drafts: {
        Row: {
          approved_by: string | null
          brand: string | null
          buy_it_now_price: number | null
          category_id: string | null
          category_name: string | null
          channel_status: string | null
          condition_id: string | null
          created_at: string | null
          created_by: string | null
          description_html: string | null
          description_plain: string | null
          ean: string | null
          epid: string | null
          id: string
          image_urls: string[] | null
          item_specifics: Json | null
          mpn: string | null
          payment_profile: Json | null
          pricing_mode: string | null
          product_id: string | null
          published_listing_id: string | null
          quantity: number | null
          return_profile: Json | null
          shipping_profile: Json | null
          start_price: number | null
          subtitle: string | null
          title: string | null
          upc: string | null
          updated_at: string | null
          validation_errors: Json | null
          validation_status: string | null
        }
        Insert: {
          approved_by?: string | null
          brand?: string | null
          buy_it_now_price?: number | null
          category_id?: string | null
          category_name?: string | null
          channel_status?: string | null
          condition_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description_html?: string | null
          description_plain?: string | null
          ean?: string | null
          epid?: string | null
          id?: string
          image_urls?: string[] | null
          item_specifics?: Json | null
          mpn?: string | null
          payment_profile?: Json | null
          pricing_mode?: string | null
          product_id?: string | null
          published_listing_id?: string | null
          quantity?: number | null
          return_profile?: Json | null
          shipping_profile?: Json | null
          start_price?: number | null
          subtitle?: string | null
          title?: string | null
          upc?: string | null
          updated_at?: string | null
          validation_errors?: Json | null
          validation_status?: string | null
        }
        Update: {
          approved_by?: string | null
          brand?: string | null
          buy_it_now_price?: number | null
          category_id?: string | null
          category_name?: string | null
          channel_status?: string | null
          condition_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description_html?: string | null
          description_plain?: string | null
          ean?: string | null
          epid?: string | null
          id?: string
          image_urls?: string[] | null
          item_specifics?: Json | null
          mpn?: string | null
          payment_profile?: Json | null
          pricing_mode?: string | null
          product_id?: string | null
          published_listing_id?: string | null
          quantity?: number | null
          return_profile?: Json | null
          shipping_profile?: Json | null
          start_price?: number | null
          subtitle?: string | null
          title?: string | null
          upc?: string | null
          updated_at?: string | null
          validation_errors?: Json | null
          validation_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ebay_drafts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      ebay_live_listings: {
        Row: {
          auction_buy_it_now_price: number | null
          available_quantity: number | null
          bids: number | null
          cd_card_condition: string | null
          cd_grade: string | null
          cd_professional_grader: string | null
          cda_certification_number: string | null
          condition: string | null
          currency: string | null
          current_price: number | null
          custom_label_sku: string | null
          ean: string | null
          ebay_category_1_name: string | null
          ebay_category_1_number: string | null
          ebay_category_2_name: string | null
          ebay_category_2_number: string | null
          ebay_item_number: string | null
          ebay_product_id_epid: string | null
          end_date: string | null
          format: string | null
          id: string
          import_batch_id: string | null
          imported_at: string
          isbn: string | null
          listing_site: string | null
          product_id: string | null
          raw_row: Json | null
          reserve_price: number | null
          sold_quantity: number | null
          start_date: string | null
          start_price: number | null
          title: string | null
          upc: string | null
          updated_at: string
          variation_details: string | null
          watchers: number | null
        }
        Insert: {
          auction_buy_it_now_price?: number | null
          available_quantity?: number | null
          bids?: number | null
          cd_card_condition?: string | null
          cd_grade?: string | null
          cd_professional_grader?: string | null
          cda_certification_number?: string | null
          condition?: string | null
          currency?: string | null
          current_price?: number | null
          custom_label_sku?: string | null
          ean?: string | null
          ebay_category_1_name?: string | null
          ebay_category_1_number?: string | null
          ebay_category_2_name?: string | null
          ebay_category_2_number?: string | null
          ebay_item_number?: string | null
          ebay_product_id_epid?: string | null
          end_date?: string | null
          format?: string | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string
          isbn?: string | null
          listing_site?: string | null
          product_id?: string | null
          raw_row?: Json | null
          reserve_price?: number | null
          sold_quantity?: number | null
          start_date?: string | null
          start_price?: number | null
          title?: string | null
          upc?: string | null
          updated_at?: string
          variation_details?: string | null
          watchers?: number | null
        }
        Update: {
          auction_buy_it_now_price?: number | null
          available_quantity?: number | null
          bids?: number | null
          cd_card_condition?: string | null
          cd_grade?: string | null
          cd_professional_grader?: string | null
          cda_certification_number?: string | null
          condition?: string | null
          currency?: string | null
          current_price?: number | null
          custom_label_sku?: string | null
          ean?: string | null
          ebay_category_1_name?: string | null
          ebay_category_1_number?: string | null
          ebay_category_2_name?: string | null
          ebay_category_2_number?: string | null
          ebay_item_number?: string | null
          ebay_product_id_epid?: string | null
          end_date?: string | null
          format?: string | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string
          isbn?: string | null
          listing_site?: string | null
          product_id?: string | null
          raw_row?: Json | null
          reserve_price?: number | null
          sold_quantity?: number | null
          start_date?: string | null
          start_price?: number | null
          title?: string | null
          upc?: string | null
          updated_at?: string
          variation_details?: string | null
          watchers?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ebay_live_listings_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "channel_listing_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebay_live_listings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      ebay_publish_jobs: {
        Row: {
          completed_at: string | null
          ebay_draft_id: string | null
          ebay_inventory_sku: string | null
          ebay_listing_id: string | null
          ebay_offer_id: string | null
          error_message: string | null
          id: string
          product_id: string | null
          publish_mode: string | null
          publish_status: string | null
          request_payload: Json | null
          response_payload: Json | null
          submitted_at: string | null
        }
        Insert: {
          completed_at?: string | null
          ebay_draft_id?: string | null
          ebay_inventory_sku?: string | null
          ebay_listing_id?: string | null
          ebay_offer_id?: string | null
          error_message?: string | null
          id?: string
          product_id?: string | null
          publish_mode?: string | null
          publish_status?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          submitted_at?: string | null
        }
        Update: {
          completed_at?: string | null
          ebay_draft_id?: string | null
          ebay_inventory_sku?: string | null
          ebay_listing_id?: string | null
          ebay_offer_id?: string | null
          error_message?: string | null
          id?: string
          product_id?: string | null
          publish_mode?: string | null
          publish_status?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ebay_publish_jobs_ebay_draft_id_fkey"
            columns: ["ebay_draft_id"]
            isOneToOne: false
            referencedRelation: "ebay_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebay_publish_jobs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_runs: {
        Row: {
          completed_at: string | null
          error_message: string | null
          final_confidence_score: number | null
          id: string
          needs_review: boolean | null
          product_id: string | null
          raw_payloads: Json | null
          started_at: string | null
          status: string | null
          steps_completed: Json | null
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          final_confidence_score?: number | null
          id?: string
          needs_review?: boolean | null
          product_id?: string | null
          raw_payloads?: Json | null
          started_at?: string | null
          status?: string | null
          steps_completed?: Json | null
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          final_confidence_score?: number | null
          id?: string
          needs_review?: boolean | null
          product_id?: string | null
          raw_payloads?: Json | null
          started_at?: string | null
          status?: string | null
          steps_completed?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_runs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      export_batches: {
        Row: {
          batch_name: string | null
          created_at: string | null
          created_by: string | null
          file_url: string | null
          id: string
          platform: string | null
          product_count: number | null
        }
        Insert: {
          batch_name?: string | null
          created_at?: string | null
          created_by?: string | null
          file_url?: string | null
          id?: string
          platform?: string | null
          product_count?: number | null
        }
        Update: {
          batch_name?: string | null
          created_at?: string | null
          created_by?: string | null
          file_url?: string | null
          id?: string
          platform?: string | null
          product_count?: number | null
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          error_count: number | null
          filename: string | null
          id: string
          import_notes: string | null
          imported_at: string | null
          imported_by: string | null
          new_count: number | null
          raw_file_path: string | null
          row_count: number | null
          skipped_count: number | null
          updated_count: number | null
        }
        Insert: {
          error_count?: number | null
          filename?: string | null
          id?: string
          import_notes?: string | null
          imported_at?: string | null
          imported_by?: string | null
          new_count?: number | null
          raw_file_path?: string | null
          row_count?: number | null
          skipped_count?: number | null
          updated_count?: number | null
        }
        Update: {
          error_count?: number | null
          filename?: string | null
          id?: string
          import_notes?: string | null
          imported_at?: string | null
          imported_by?: string | null
          new_count?: number | null
          raw_file_path?: string | null
          row_count?: number | null
          skipped_count?: number | null
          updated_count?: number | null
        }
        Relationships: []
      }
      inventory_snapshots: {
        Row: {
          cost_price: number | null
          id: string
          product_id: string | null
          sell_price: number | null
          snapshot_date: string | null
          source_batch_id: string | null
          stock_on_hand: number | null
          stock_value: number | null
          units_sold_12m: number | null
        }
        Insert: {
          cost_price?: number | null
          id?: string
          product_id?: string | null
          sell_price?: number | null
          snapshot_date?: string | null
          source_batch_id?: string | null
          stock_on_hand?: number | null
          stock_value?: number | null
          units_sold_12m?: number | null
        }
        Update: {
          cost_price?: number | null
          id?: string
          product_id?: string | null
          sell_price?: number | null
          snapshot_date?: string | null
          source_batch_id?: string | null
          stock_on_hand?: number | null
          stock_value?: number | null
          units_sold_12m?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_snapshots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          created_at: string | null
          ebay_approved: boolean | null
          height: number | null
          id: string
          image_status: string | null
          is_primary: boolean | null
          local_storage_path: string | null
          local_storage_url: string | null
          original_url: string | null
          product_id: string | null
          shopify_approved: boolean | null
          shopify_media_gid: string | null
          sort_order: number | null
          source_page_url: string | null
          source_type: string | null
          updated_at: string | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string | null
          ebay_approved?: boolean | null
          height?: number | null
          id?: string
          image_status?: string | null
          is_primary?: boolean | null
          local_storage_path?: string | null
          local_storage_url?: string | null
          original_url?: string | null
          product_id?: string | null
          shopify_approved?: boolean | null
          shopify_media_gid?: string | null
          sort_order?: number | null
          source_page_url?: string | null
          source_type?: string | null
          updated_at?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string | null
          ebay_approved?: boolean | null
          height?: number | null
          id?: string
          image_status?: string | null
          is_primary?: boolean | null
          local_storage_path?: string | null
          local_storage_url?: string | null
          original_url?: string | null
          product_id?: string | null
          shopify_approved?: boolean | null
          shopify_media_gid?: string | null
          sort_order?: number | null
          source_page_url?: string | null
          source_type?: string | null
          updated_at?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          artg_number: string | null
          barcode: string | null
          brand: string | null
          claims_summary: string | null
          compliance_reasons: string[] | null
          compliance_status: string | null
          cost_price: number | null
          created_at: string | null
          department: string | null
          directions_summary: string | null
          enrichment_confidence: string | null
          enrichment_status: string | null
          enrichment_summary: Json | null
          flavour: string | null
          gross_profit_percent: number | null
          id: string
          ingredients_summary: string | null
          internal_category: string | null
          last_purchased_at: string | null
          last_sold_at: string | null
          normalized_product_name: string | null
          notes_internal: string | null
          pack_size: string | null
          product_form: string | null
          product_type: string | null
          quantity_available_for_ebay: number | null
          quantity_available_for_shopify: number | null
          quantity_reserved_for_store: number | null
          sell_price: number | null
          size_value: string | null
          sku: string | null
          source_links: Json | null
          source_product_name: string | null
          stock_on_hand: number | null
          stock_value: number | null
          strength: string | null
          supplier: string | null
          total_cogs_12m: number | null
          total_sales_value_12m: number | null
          units_purchased_12m: number | null
          units_sold_12m: number | null
          updated_at: string | null
          variant: string | null
          warnings_summary: string | null
          weight_grams: number | null
          z_category: string | null
        }
        Insert: {
          artg_number?: string | null
          barcode?: string | null
          brand?: string | null
          claims_summary?: string | null
          compliance_reasons?: string[] | null
          compliance_status?: string | null
          cost_price?: number | null
          created_at?: string | null
          department?: string | null
          directions_summary?: string | null
          enrichment_confidence?: string | null
          enrichment_status?: string | null
          enrichment_summary?: Json | null
          flavour?: string | null
          gross_profit_percent?: number | null
          id?: string
          ingredients_summary?: string | null
          internal_category?: string | null
          last_purchased_at?: string | null
          last_sold_at?: string | null
          normalized_product_name?: string | null
          notes_internal?: string | null
          pack_size?: string | null
          product_form?: string | null
          product_type?: string | null
          quantity_available_for_ebay?: number | null
          quantity_available_for_shopify?: number | null
          quantity_reserved_for_store?: number | null
          sell_price?: number | null
          size_value?: string | null
          sku?: string | null
          source_links?: Json | null
          source_product_name?: string | null
          stock_on_hand?: number | null
          stock_value?: number | null
          strength?: string | null
          supplier?: string | null
          total_cogs_12m?: number | null
          total_sales_value_12m?: number | null
          units_purchased_12m?: number | null
          units_sold_12m?: number | null
          updated_at?: string | null
          variant?: string | null
          warnings_summary?: string | null
          weight_grams?: number | null
          z_category?: string | null
        }
        Update: {
          artg_number?: string | null
          barcode?: string | null
          brand?: string | null
          claims_summary?: string | null
          compliance_reasons?: string[] | null
          compliance_status?: string | null
          cost_price?: number | null
          created_at?: string | null
          department?: string | null
          directions_summary?: string | null
          enrichment_confidence?: string | null
          enrichment_status?: string | null
          enrichment_summary?: Json | null
          flavour?: string | null
          gross_profit_percent?: number | null
          id?: string
          ingredients_summary?: string | null
          internal_category?: string | null
          last_purchased_at?: string | null
          last_sold_at?: string | null
          normalized_product_name?: string | null
          notes_internal?: string | null
          pack_size?: string | null
          product_form?: string | null
          product_type?: string | null
          quantity_available_for_ebay?: number | null
          quantity_available_for_shopify?: number | null
          quantity_reserved_for_store?: number | null
          sell_price?: number | null
          size_value?: string | null
          sku?: string | null
          source_links?: Json | null
          source_product_name?: string | null
          stock_on_hand?: number | null
          stock_value?: number | null
          strength?: string | null
          supplier?: string | null
          total_cogs_12m?: number | null
          total_sales_value_12m?: number | null
          units_purchased_12m?: number | null
          units_sold_12m?: number | null
          updated_at?: string | null
          variant?: string | null
          warnings_summary?: string | null
          weight_grams?: number | null
          z_category?: string | null
        }
        Relationships: []
      }
      shopify_categories: {
        Row: {
          google_shopping_path: string | null
          id: string
          internal_category: string | null
          shopify_path: string | null
        }
        Insert: {
          google_shopping_path?: string | null
          id?: string
          internal_category?: string | null
          shopify_path?: string | null
        }
        Update: {
          google_shopping_path?: string | null
          id?: string
          internal_category?: string | null
          shopify_path?: string | null
        }
        Relationships: []
      }
      shopify_connections: {
        Row: {
          access_token_encrypted: string | null
          api_version: string | null
          auto_sync_matched_only: boolean | null
          created_at: string | null
          granted_scopes: string[] | null
          id: string
          inventory_sync_mode: string | null
          last_successful_sync_at: string | null
          last_sync_status: string | null
          max_qty_cap: number | null
          online_store_publication_id: string | null
          primary_location_id: string | null
          reserve_stock_buffer: number | null
          shop_domain: string | null
          shop_name: string | null
          sync_zero_stock: boolean | null
          updated_at: string | null
          webhook_secret_encrypted: string | null
        }
        Insert: {
          access_token_encrypted?: string | null
          api_version?: string | null
          auto_sync_matched_only?: boolean | null
          created_at?: string | null
          granted_scopes?: string[] | null
          id?: string
          inventory_sync_mode?: string | null
          last_successful_sync_at?: string | null
          last_sync_status?: string | null
          max_qty_cap?: number | null
          online_store_publication_id?: string | null
          primary_location_id?: string | null
          reserve_stock_buffer?: number | null
          shop_domain?: string | null
          shop_name?: string | null
          sync_zero_stock?: boolean | null
          updated_at?: string | null
          webhook_secret_encrypted?: string | null
        }
        Update: {
          access_token_encrypted?: string | null
          api_version?: string | null
          auto_sync_matched_only?: boolean | null
          created_at?: string | null
          granted_scopes?: string[] | null
          id?: string
          inventory_sync_mode?: string | null
          last_successful_sync_at?: string | null
          last_sync_status?: string | null
          max_qty_cap?: number | null
          online_store_publication_id?: string | null
          primary_location_id?: string | null
          reserve_stock_buffer?: number | null
          shop_domain?: string | null
          shop_name?: string | null
          sync_zero_stock?: boolean | null
          updated_at?: string | null
          webhook_secret_encrypted?: string | null
        }
        Relationships: []
      }
      shopify_drafts: {
        Row: {
          channel_status: string | null
          created_at: string | null
          description_html: string | null
          google_ad_group_name: string | null
          google_ads_labels: string | null
          google_age_group: string | null
          google_condition: string | null
          google_custom_label_0: string | null
          google_custom_label_1: string | null
          google_custom_label_2: string | null
          google_custom_label_3: string | null
          google_custom_label_4: string | null
          google_custom_product: boolean | null
          google_gender: string | null
          google_mpn: string | null
          google_product_category: string | null
          handle: string | null
          id: string
          product_category: string | null
          product_id: string | null
          product_type: string | null
          published_online_store: boolean | null
          seo_description: string | null
          seo_title: string | null
          shopify_product_gid: string | null
          status: string | null
          tags: string[] | null
          title: string | null
          updated_at: string | null
          validation_errors: Json | null
          validation_status: string | null
          vendor: string | null
        }
        Insert: {
          channel_status?: string | null
          created_at?: string | null
          description_html?: string | null
          google_ad_group_name?: string | null
          google_ads_labels?: string | null
          google_age_group?: string | null
          google_condition?: string | null
          google_custom_label_0?: string | null
          google_custom_label_1?: string | null
          google_custom_label_2?: string | null
          google_custom_label_3?: string | null
          google_custom_label_4?: string | null
          google_custom_product?: boolean | null
          google_gender?: string | null
          google_mpn?: string | null
          google_product_category?: string | null
          handle?: string | null
          id?: string
          product_category?: string | null
          product_id?: string | null
          product_type?: string | null
          published_online_store?: boolean | null
          seo_description?: string | null
          seo_title?: string | null
          shopify_product_gid?: string | null
          status?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          validation_errors?: Json | null
          validation_status?: string | null
          vendor?: string | null
        }
        Update: {
          channel_status?: string | null
          created_at?: string | null
          description_html?: string | null
          google_ad_group_name?: string | null
          google_ads_labels?: string | null
          google_age_group?: string | null
          google_condition?: string | null
          google_custom_label_0?: string | null
          google_custom_label_1?: string | null
          google_custom_label_2?: string | null
          google_custom_label_3?: string | null
          google_custom_label_4?: string | null
          google_custom_product?: boolean | null
          google_gender?: string | null
          google_mpn?: string | null
          google_product_category?: string | null
          handle?: string | null
          id?: string
          product_category?: string | null
          product_id?: string | null
          product_type?: string | null
          published_online_store?: boolean | null
          seo_description?: string | null
          seo_title?: string | null
          shopify_product_gid?: string | null
          status?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
          validation_errors?: Json | null
          validation_status?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopify_drafts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_live_products: {
        Row: {
          body_html: string | null
          cost_per_item: number | null
          gift_card: string | null
          google_age_group: string | null
          google_condition: string | null
          google_custom_label_0: string | null
          google_custom_label_1: string | null
          google_custom_label_2: string | null
          google_custom_label_3: string | null
          google_custom_label_4: string | null
          google_custom_product: string | null
          google_gender: string | null
          google_mpn: string | null
          google_product_category: string | null
          handle: string | null
          id: string
          image_alt_text: string | null
          image_position: number | null
          image_src: string | null
          import_batch_id: string | null
          imported_at: string
          metafield_age_group: string | null
          metafield_coil_connection: string | null
          metafield_color_pattern: string | null
          metafield_dietary_preferences: string | null
          metafield_ecigarette_style: string | null
          metafield_ingredient_category: string | null
          metafield_usage_type: string | null
          metafield_vaping_style: string | null
          mm_google_custom_product: string | null
          option1_linked_to: string | null
          option1_name: string | null
          option1_value: string | null
          option2_linked_to: string | null
          option2_name: string | null
          option2_value: string | null
          option3_linked_to: string | null
          option3_name: string | null
          option3_value: string | null
          product_category: string | null
          product_id: string | null
          product_rating_count: string | null
          published: string | null
          raw_row: Json | null
          seo_description: string | null
          seo_title: string | null
          status: string | null
          tags: string | null
          title: string | null
          type: string | null
          unit_price_base_measure: string | null
          unit_price_base_measure_unit: string | null
          unit_price_total_measure: string | null
          unit_price_total_measure_unit: string | null
          updated_at: string
          variant_barcode: string | null
          variant_compare_at_price: number | null
          variant_fulfillment_service: string | null
          variant_grams: number | null
          variant_image: string | null
          variant_inventory_policy: string | null
          variant_inventory_tracker: string | null
          variant_price: number | null
          variant_requires_shipping: string | null
          variant_sku: string | null
          variant_tax_code: string | null
          variant_taxable: string | null
          variant_weight_unit: string | null
          vendor: string | null
        }
        Insert: {
          body_html?: string | null
          cost_per_item?: number | null
          gift_card?: string | null
          google_age_group?: string | null
          google_condition?: string | null
          google_custom_label_0?: string | null
          google_custom_label_1?: string | null
          google_custom_label_2?: string | null
          google_custom_label_3?: string | null
          google_custom_label_4?: string | null
          google_custom_product?: string | null
          google_gender?: string | null
          google_mpn?: string | null
          google_product_category?: string | null
          handle?: string | null
          id?: string
          image_alt_text?: string | null
          image_position?: number | null
          image_src?: string | null
          import_batch_id?: string | null
          imported_at?: string
          metafield_age_group?: string | null
          metafield_coil_connection?: string | null
          metafield_color_pattern?: string | null
          metafield_dietary_preferences?: string | null
          metafield_ecigarette_style?: string | null
          metafield_ingredient_category?: string | null
          metafield_usage_type?: string | null
          metafield_vaping_style?: string | null
          mm_google_custom_product?: string | null
          option1_linked_to?: string | null
          option1_name?: string | null
          option1_value?: string | null
          option2_linked_to?: string | null
          option2_name?: string | null
          option2_value?: string | null
          option3_linked_to?: string | null
          option3_name?: string | null
          option3_value?: string | null
          product_category?: string | null
          product_id?: string | null
          product_rating_count?: string | null
          published?: string | null
          raw_row?: Json | null
          seo_description?: string | null
          seo_title?: string | null
          status?: string | null
          tags?: string | null
          title?: string | null
          type?: string | null
          unit_price_base_measure?: string | null
          unit_price_base_measure_unit?: string | null
          unit_price_total_measure?: string | null
          unit_price_total_measure_unit?: string | null
          updated_at?: string
          variant_barcode?: string | null
          variant_compare_at_price?: number | null
          variant_fulfillment_service?: string | null
          variant_grams?: number | null
          variant_image?: string | null
          variant_inventory_policy?: string | null
          variant_inventory_tracker?: string | null
          variant_price?: number | null
          variant_requires_shipping?: string | null
          variant_sku?: string | null
          variant_tax_code?: string | null
          variant_taxable?: string | null
          variant_weight_unit?: string | null
          vendor?: string | null
        }
        Update: {
          body_html?: string | null
          cost_per_item?: number | null
          gift_card?: string | null
          google_age_group?: string | null
          google_condition?: string | null
          google_custom_label_0?: string | null
          google_custom_label_1?: string | null
          google_custom_label_2?: string | null
          google_custom_label_3?: string | null
          google_custom_label_4?: string | null
          google_custom_product?: string | null
          google_gender?: string | null
          google_mpn?: string | null
          google_product_category?: string | null
          handle?: string | null
          id?: string
          image_alt_text?: string | null
          image_position?: number | null
          image_src?: string | null
          import_batch_id?: string | null
          imported_at?: string
          metafield_age_group?: string | null
          metafield_coil_connection?: string | null
          metafield_color_pattern?: string | null
          metafield_dietary_preferences?: string | null
          metafield_ecigarette_style?: string | null
          metafield_ingredient_category?: string | null
          metafield_usage_type?: string | null
          metafield_vaping_style?: string | null
          mm_google_custom_product?: string | null
          option1_linked_to?: string | null
          option1_name?: string | null
          option1_value?: string | null
          option2_linked_to?: string | null
          option2_name?: string | null
          option2_value?: string | null
          option3_linked_to?: string | null
          option3_name?: string | null
          option3_value?: string | null
          product_category?: string | null
          product_id?: string | null
          product_rating_count?: string | null
          published?: string | null
          raw_row?: Json | null
          seo_description?: string | null
          seo_title?: string | null
          status?: string | null
          tags?: string | null
          title?: string | null
          type?: string | null
          unit_price_base_measure?: string | null
          unit_price_base_measure_unit?: string | null
          unit_price_total_measure?: string | null
          unit_price_total_measure_unit?: string | null
          updated_at?: string
          variant_barcode?: string | null
          variant_compare_at_price?: number | null
          variant_fulfillment_service?: string | null
          variant_grams?: number | null
          variant_image?: string | null
          variant_inventory_policy?: string | null
          variant_inventory_tracker?: string | null
          variant_price?: number | null
          variant_requires_shipping?: string | null
          variant_sku?: string | null
          variant_tax_code?: string | null
          variant_taxable?: string | null
          variant_weight_unit?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopify_live_products_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "channel_listing_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopify_live_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_media: {
        Row: {
          id: string
          last_synced_at: string | null
          product_id: string | null
          raw_payload: Json | null
          shopify_media_gid: string | null
          shopify_product_gid: string | null
          sync_status: string | null
        }
        Insert: {
          id?: string
          last_synced_at?: string | null
          product_id?: string | null
          raw_payload?: Json | null
          shopify_media_gid?: string | null
          shopify_product_gid?: string | null
          sync_status?: string | null
        }
        Update: {
          id?: string
          last_synced_at?: string | null
          product_id?: string | null
          raw_payload?: Json | null
          shopify_media_gid?: string | null
          shopify_product_gid?: string | null
          sync_status?: string | null
        }
        Relationships: []
      }
      shopify_products: {
        Row: {
          handle: string | null
          id: string
          last_synced_at: string | null
          product_id: string | null
          raw_payload: Json | null
          shopify_product_gid: string | null
          sync_hash: string | null
          sync_status: string | null
        }
        Insert: {
          handle?: string | null
          id?: string
          last_synced_at?: string | null
          product_id?: string | null
          raw_payload?: Json | null
          shopify_product_gid?: string | null
          sync_hash?: string | null
          sync_status?: string | null
        }
        Update: {
          handle?: string | null
          id?: string
          last_synced_at?: string | null
          product_id?: string | null
          raw_payload?: Json | null
          shopify_product_gid?: string | null
          sync_hash?: string | null
          sync_status?: string | null
        }
        Relationships: []
      }
      shopify_sync_runs: {
        Row: {
          completed_at: string | null
          cursor_end: string | null
          cursor_start: string | null
          error_count: number | null
          id: string
          items_created: number | null
          items_processed: number | null
          items_updated: number | null
          notes: string | null
          started_at: string | null
          status: string | null
          sync_mode: string | null
        }
        Insert: {
          completed_at?: string | null
          cursor_end?: string | null
          cursor_start?: string | null
          error_count?: number | null
          id?: string
          items_created?: number | null
          items_processed?: number | null
          items_updated?: number | null
          notes?: string | null
          started_at?: string | null
          status?: string | null
          sync_mode?: string | null
        }
        Update: {
          completed_at?: string | null
          cursor_end?: string | null
          cursor_start?: string | null
          error_count?: number | null
          id?: string
          items_created?: number | null
          items_processed?: number | null
          items_updated?: number | null
          notes?: string | null
          started_at?: string | null
          status?: string | null
          sync_mode?: string | null
        }
        Relationships: []
      }
      shopify_variants: {
        Row: {
          barcode: string | null
          compare_at_price: number | null
          continue_selling_when_out_of_stock: string | null
          cost_per_item: number | null
          created_at: string | null
          fulfillment_service: string | null
          id: string
          inventory_quantity: number | null
          inventory_tracker: string | null
          option1_name: string | null
          option1_value: string | null
          option2_name: string | null
          option2_value: string | null
          option3_name: string | null
          option3_value: string | null
          price: number | null
          product_id: string | null
          requires_shipping: boolean | null
          shopify_draft_id: string | null
          shopify_variant_gid: string | null
          sku: string | null
          updated_at: string | null
          variant_image_url: string | null
          weight_unit_display: string | null
          weight_value_grams: number | null
        }
        Insert: {
          barcode?: string | null
          compare_at_price?: number | null
          continue_selling_when_out_of_stock?: string | null
          cost_per_item?: number | null
          created_at?: string | null
          fulfillment_service?: string | null
          id?: string
          inventory_quantity?: number | null
          inventory_tracker?: string | null
          option1_name?: string | null
          option1_value?: string | null
          option2_name?: string | null
          option2_value?: string | null
          option3_name?: string | null
          option3_value?: string | null
          price?: number | null
          product_id?: string | null
          requires_shipping?: boolean | null
          shopify_draft_id?: string | null
          shopify_variant_gid?: string | null
          sku?: string | null
          updated_at?: string | null
          variant_image_url?: string | null
          weight_unit_display?: string | null
          weight_value_grams?: number | null
        }
        Update: {
          barcode?: string | null
          compare_at_price?: number | null
          continue_selling_when_out_of_stock?: string | null
          cost_per_item?: number | null
          created_at?: string | null
          fulfillment_service?: string | null
          id?: string
          inventory_quantity?: number | null
          inventory_tracker?: string | null
          option1_name?: string | null
          option1_value?: string | null
          option2_name?: string | null
          option2_value?: string | null
          option3_name?: string | null
          option3_value?: string | null
          price?: number | null
          product_id?: string | null
          requires_shipping?: boolean | null
          shopify_draft_id?: string | null
          shopify_variant_gid?: string | null
          sku?: string | null
          updated_at?: string | null
          variant_image_url?: string | null
          weight_unit_display?: string | null
          weight_value_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shopify_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopify_variants_shopify_draft_id_fkey"
            columns: ["shopify_draft_id"]
            isOneToOne: false
            referencedRelation: "shopify_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_write_jobs: {
        Row: {
          completed_at: string | null
          error_message: string | null
          id: string
          operation_type: string | null
          product_id: string | null
          queued_at: string | null
          request_payload: Json | null
          response_payload: Json | null
          retry_count: number | null
          shopify_product_gid: string | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          operation_type?: string | null
          product_id?: string | null
          queued_at?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          retry_count?: number | null
          shopify_product_gid?: string | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          operation_type?: string | null
          product_id?: string | null
          queued_at?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          retry_count?: number | null
          shopify_product_gid?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopify_write_jobs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_sync_items: {
        Row: {
          created_at: string | null
          current_shopify_qty: number | null
          error_message: string | null
          id: string
          local_barcode: string | null
          local_product_name: string | null
          local_sku: string | null
          local_stock_on_hand: number | null
          match_confidence: string | null
          match_type: string | null
          product_id: string | null
          proposed_shopify_qty: number | null
          qty_difference: number | null
          quantity_to_push: number | null
          request_payload: Json | null
          reserve_buffer: number | null
          response_payload: Json | null
          shopify_barcode: string | null
          shopify_inventory_item_id: string | null
          shopify_location_id: string | null
          shopify_product_gid: string | null
          shopify_product_title: string | null
          shopify_sku: string | null
          shopify_variant_gid: string | null
          shopify_variant_title: string | null
          sync_run_id: string | null
          sync_status: string
          synced_at: string | null
          synced_by: string | null
        }
        Insert: {
          created_at?: string | null
          current_shopify_qty?: number | null
          error_message?: string | null
          id?: string
          local_barcode?: string | null
          local_product_name?: string | null
          local_sku?: string | null
          local_stock_on_hand?: number | null
          match_confidence?: string | null
          match_type?: string | null
          product_id?: string | null
          proposed_shopify_qty?: number | null
          qty_difference?: number | null
          quantity_to_push?: number | null
          request_payload?: Json | null
          reserve_buffer?: number | null
          response_payload?: Json | null
          shopify_barcode?: string | null
          shopify_inventory_item_id?: string | null
          shopify_location_id?: string | null
          shopify_product_gid?: string | null
          shopify_product_title?: string | null
          shopify_sku?: string | null
          shopify_variant_gid?: string | null
          shopify_variant_title?: string | null
          sync_run_id?: string | null
          sync_status?: string
          synced_at?: string | null
          synced_by?: string | null
        }
        Update: {
          created_at?: string | null
          current_shopify_qty?: number | null
          error_message?: string | null
          id?: string
          local_barcode?: string | null
          local_product_name?: string | null
          local_sku?: string | null
          local_stock_on_hand?: number | null
          match_confidence?: string | null
          match_type?: string | null
          product_id?: string | null
          proposed_shopify_qty?: number | null
          qty_difference?: number | null
          quantity_to_push?: number | null
          request_payload?: Json | null
          reserve_buffer?: number | null
          response_payload?: Json | null
          shopify_barcode?: string | null
          shopify_inventory_item_id?: string | null
          shopify_location_id?: string | null
          shopify_product_gid?: string | null
          shopify_product_title?: string | null
          shopify_sku?: string | null
          shopify_variant_gid?: string | null
          shopify_variant_title?: string | null
          sync_run_id?: string | null
          sync_status?: string
          synced_at?: string | null
          synced_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_sync_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_sync_items_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "stock_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_sync_runs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          id: string
          import_batch_id: string | null
          inventory_sync_mode: string
          max_qty_cap: number | null
          notes: string | null
          reserve_buffer: number
          started_at: string | null
          started_by: string | null
          status: string
          sync_mode: string
          sync_zero_stock: boolean
          total_failed: number | null
          total_local_products: number | null
          total_matched: number | null
          total_no_match: number | null
          total_skipped: number | null
          total_synced: number | null
          total_uncertain: number | null
          total_update_needed: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          import_batch_id?: string | null
          inventory_sync_mode?: string
          max_qty_cap?: number | null
          notes?: string | null
          reserve_buffer?: number
          started_at?: string | null
          started_by?: string | null
          status?: string
          sync_mode?: string
          sync_zero_stock?: boolean
          total_failed?: number | null
          total_local_products?: number | null
          total_matched?: number | null
          total_no_match?: number | null
          total_skipped?: number | null
          total_synced?: number | null
          total_uncertain?: number | null
          total_update_needed?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          import_batch_id?: string | null
          inventory_sync_mode?: string
          max_qty_cap?: number | null
          notes?: string | null
          reserve_buffer?: number
          started_at?: string | null
          started_by?: string | null
          status?: string
          sync_mode?: string
          sync_zero_stock?: boolean
          total_failed?: number | null
          total_local_products?: number | null
          total_matched?: number | null
          total_no_match?: number | null
          total_skipped?: number | null
          total_synced?: number | null
          total_uncertain?: number | null
          total_update_needed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_sync_runs_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "manager" | "lister" | "reviewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "manager", "lister", "reviewer"],
    },
  },
} as const
