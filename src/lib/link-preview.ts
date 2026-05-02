const MICROLINK_ENDPOINT = 'https://api.microlink.io';
const FETCH_TIMEOUT_MS = 14_000;
const CACHE_MAX = 96;

const previewCache = new Map<string, string | null>();

function cacheKey(href: string): string {
  try {
    const u = new URL(/^https?:\/\//i.test(href.trim()) ? href.trim() : `https://${href.trim()}`);
    return u.href;
  } catch {
    return href.trim();
  }
}

function touchCache(key: string, value: string | null) {
  previewCache.delete(key);
  previewCache.set(key, value);
  while (previewCache.size > CACHE_MAX) {
    const first = previewCache.keys().next().value as string | undefined;
    if (first === undefined) break;
    previewCache.delete(first);
  }
}

/**
 * 페이지 OG 이미지·로고 URL 조회 (Microlink). CORS 허용.
 * 선택: VITE_MICROLINK_API_KEY — 할당량·안정성 향상
 */
export async function fetchLinkPreviewImage(pageUrl: string): Promise<string | null> {
  const key = cacheKey(pageUrl);
  if (previewCache.has(key)) {
    const hit = previewCache.get(key);
    touchCache(key, hit ?? null);
    return hit ?? null;
  }

  let target = pageUrl.trim();
  if (!/^https?:\/\//i.test(target)) {
    target = `https://${target}`;
  }

  try {
    const apiUrl = new URL(MICROLINK_ENDPOINT);
    apiUrl.searchParams.set('url', target);

    const headers: HeadersInit = { Accept: 'application/json' };
    const apiKey = import.meta.env.VITE_MICROLINK_API_KEY;
    if (typeof apiKey === 'string' && apiKey.length > 0) {
      headers['x-api-key'] = apiKey;
    }

    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(apiUrl.toString(), { signal: ctrl.signal, headers });
    window.clearTimeout(timer);

    if (!res.ok) {
      touchCache(key, null);
      return null;
    }

    const json = (await res.json()) as {
      status?: string;
      data?: {
        image?: { url?: string };
        logo?: { url?: string };
      };
    };

    if (json.status !== 'success' || !json.data) {
      touchCache(key, null);
      return null;
    }

    const candidate = json.data.image?.url || json.data.logo?.url;
    if (typeof candidate !== 'string' || !/^https?:\/\//i.test(candidate)) {
      touchCache(key, null);
      return null;
    }

    touchCache(key, candidate);
    return candidate;
  } catch {
    touchCache(key, null);
    return null;
  }
}
