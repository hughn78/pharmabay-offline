import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getValidToken,
  getSupabaseAdmin,
  getEbayBaseUrls,
  getConnection,
} from "../_shared/ebay-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { token, conn } = await getValidToken(supabaseAdmin);
    const env = (conn.environment as string) || "production";
    const urls = getEbayBaseUrls(env);

    // Fetch the default category tree ID for EBAY_AU (marketplace 15)
    const treeRes = await fetch(
      `${urls.api}/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=EBAY_AU`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!treeRes.ok) {
      const errBody = await treeRes.text();
      throw new Error(`Failed to get tree ID: ${treeRes.status} ${errBody}`);
    }
    const treeData = await treeRes.json();
    const treeId = treeData.categoryTreeId;

    // Fetch the full category tree
    const catRes = await fetch(
      `${urls.api}/commerce/taxonomy/v1/category_tree/${treeId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!catRes.ok) {
      const errBody = await catRes.text();
      throw new Error(`Failed to get tree: ${catRes.status} ${errBody}`);
    }
    const catData = await catRes.json();

    // Flatten the tree
    interface CatNode {
      category: { categoryId: string; categoryName: string };
      childCategoryTreeNodes?: CatNode[];
      leafCategoryTreeNode?: boolean;
    }

    interface FlatCat {
      category_id: string;
      category_name: string;
      parent_category_id: string | null;
      is_leaf: boolean;
      category_level: number;
    }

    const rows: FlatCat[] = [];

    function walk(node: CatNode, parentId: string | null, level: number) {
      const catId = node.category.categoryId;
      const isLeaf = node.leafCategoryTreeNode === true || !node.childCategoryTreeNodes?.length;
      rows.push({
        category_id: catId,
        category_name: node.category.categoryName,
        parent_category_id: parentId,
        is_leaf: isLeaf,
        category_level: level,
      });
      if (node.childCategoryTreeNodes) {
        for (const child of node.childCategoryTreeNodes) {
          walk(child, catId, level + 1);
        }
      }
    }

    const rootNode = catData.rootCategoryNode;
    if (rootNode) {
      walk(rootNode, null, 0);
    }

    // Clear existing categories and insert fresh
    await supabaseAdmin.from("ebay_categories").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // Batch insert (500 per batch)
    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error } = await supabaseAdmin.from("ebay_categories").insert(batch);
      if (error) throw new Error(`Insert batch ${i}: ${error.message}`);
      inserted += batch.length;
    }

    return new Response(
      JSON.stringify({ success: true, total: rows.length, inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
