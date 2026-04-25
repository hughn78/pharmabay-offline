const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ success: false, error: 'URL is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let pageUrl = url.trim();
    if (!pageUrl.startsWith('http://') && !pageUrl.startsWith('https://')) {
      pageUrl = `https://${pageUrl}`;
    }

    console.log('Fetching page for image extraction:', pageUrl);

    const response = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ success: false, error: `Failed to fetch page: ${response.status}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const html = await response.text();
    const baseUrl = new URL(pageUrl);
    const images: Array<{ url: string; source: string; score: number }> = [];
    const seen = new Set<string>();

    const resolveUrl = (src: string): string | null => {
      try {
        if (src.startsWith('data:')) return null;
        if (src.startsWith('//')) return `https:${src}`;
        if (src.startsWith('/')) return `${baseUrl.origin}${src}`;
        if (src.startsWith('http')) return src;
        return new URL(src, pageUrl).href;
      } catch {
        return null;
      }
    };

    const addImage = (rawUrl: string, source: string, baseScore: number) => {
      const resolved = resolveUrl(rawUrl);
      if (!resolved) return;

      // Normalize for dedup
      const normalized = resolved.split('?')[0].toLowerCase();
      if (seen.has(normalized)) return;
      seen.add(normalized);

      // Skip tiny tracking pixels, logos, icons, sprites
      const skipPatterns = /logo|favicon|icon|sprite|pixel|tracking|badge|rating|star|arrow|button|nav|footer|header|social|share|twitter|facebook|linkedin|pinterest|youtube|instagram|google|analytics|tag-?manager|cdn-cgi/i;
      if (skipPatterns.test(resolved)) {
        return;
      }

      // Boost product-like paths
      let score = baseScore;
      if (/product|item|listing|main|hero|gallery|large|full|zoom|detail/i.test(resolved)) score += 20;
      if (/thumb|small|tiny|mini|avatar/i.test(resolved)) score -= 15;
      if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(resolved)) score += 5;
      if (/\.(gif|svg|ico)(\?|$)/i.test(resolved)) score -= 10;

      images.push({ url: resolved, source, score });
    };

    // 1. og:image
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch) addImage(ogMatch[1], 'og:image', 90);

    // 2. twitter:image
    const twMatch = html.match(/<meta[^>]+(?:name|property)=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']twitter:image["']/i);
    if (twMatch) addImage(twMatch[1], 'twitter:image', 85);

    // 3. JSON-LD product images
    const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let jsonLdMatch;
    while ((jsonLdMatch = jsonLdRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(jsonLdMatch[1]);
        const extractFromLd = (obj: any) => {
          if (!obj) return;
          // Direct image property
          if (obj.image) {
            const imgs = Array.isArray(obj.image) ? obj.image : [obj.image];
            for (const img of imgs) {
              const imgUrl = typeof img === 'string' ? img : img?.url || img?.contentUrl;
              if (imgUrl) addImage(imgUrl, 'json-ld', 80);
            }
          }
          // @graph
          if (Array.isArray(obj['@graph'])) {
            obj['@graph'].forEach(extractFromLd);
          }
        };
        extractFromLd(data);
      } catch {
        // Invalid JSON-LD, skip
      }
    }

    // 4. Visible <img> tags
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(html)) !== null) {
      const src = imgMatch[1];
      // Try to get dimensions from tag for scoring
      const tag = imgMatch[0];
      let dimScore = 0;
      const widthMatch = tag.match(/width=["']?(\d+)/i);
      const heightMatch = tag.match(/height=["']?(\d+)/i);
      if (widthMatch && parseInt(widthMatch[1]) >= 200) dimScore += 10;
      if (heightMatch && parseInt(heightMatch[1]) >= 200) dimScore += 10;
      if (widthMatch && parseInt(widthMatch[1]) < 50) dimScore -= 20;
      if (heightMatch && parseInt(heightMatch[1]) < 50) dimScore -= 20;

      addImage(src, 'img-tag', 40 + dimScore);
    }

    // 5. srcset images (often higher res)
    const srcsetRegex = /<img[^>]+srcset=["']([^"']+)["'][^>]*>/gi;
    let srcsetMatch;
    while ((srcsetMatch = srcsetRegex.exec(html)) !== null) {
      const entries = srcsetMatch[1].split(',');
      for (const entry of entries) {
        const parts = entry.trim().split(/\s+/);
        if (parts[0]) {
          addImage(parts[0], 'srcset', 50);
        }
      }
    }

    // 6. data-src / data-original (lazy loaded)
    const lazySrcRegex = /<img[^>]+data-(?:src|original|lazy-src)=["']([^"']+)["'][^>]*>/gi;
    let lazyMatch;
    while ((lazyMatch = lazySrcRegex.exec(html)) !== null) {
      addImage(lazyMatch[1], 'lazy-load', 45);
    }

    // Sort by score descending
    images.sort((a, b) => b.score - a.score);

    // Limit to top 30
    const result = images.slice(0, 30);

    console.log(`Extracted ${result.length} images from ${pageUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        pageUrl,
        pageTitle: html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || '',
        images: result,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error extracting images:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to extract images' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
