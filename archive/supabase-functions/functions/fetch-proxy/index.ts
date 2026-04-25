const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Lightweight proxy for fetching public JSON APIs (e.g. Shopify products.json).
 * Returns the raw JSON response without any AI processing.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log('Proxy fetching:', formattedUrl);

    const response = await fetch(formattedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ProductCatalog/1.0)',
        'Accept': 'application/json, text/html, */*',
      },
    });

    const contentType = response.headers.get('content-type') || '';
    
    if (!response.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Request failed with status ${response.status}`,
          http_status: response.status,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If JSON response, return it directly
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return new Response(
        JSON.stringify({ success: true, data, content_type: 'json' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For HTML/text responses, return as text
    const text = await response.text();
    
    // Check if the text is actually JSON (some servers don't set content-type correctly)
    try {
      const parsed = JSON.parse(text);
      return new Response(
        JSON.stringify({ success: true, data: parsed, content_type: 'json' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch {
      // It's truly text/html
      return new Response(
        JSON.stringify({ success: true, data: text, content_type: 'html' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Proxy fetch error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Proxy fetch failed';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
