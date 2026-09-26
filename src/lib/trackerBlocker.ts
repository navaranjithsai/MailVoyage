/**
 * Tracker / analytics pixel blocker for mail HTML.
 *
 * What counts as a tracker:
 *   - 1x1 (or ≤2x2 in either dimension) transparent-ish images
 *   - URLs whose path matches a known tracker pattern (/e/o/, /tr/op/,
 *     /open, /track, /pixel, /beacon, /open_log, /log_pic, /monitoring...)
 *   - <img src="...?...open=..."> style query-string'd endpoints with no
 *     file extension (heuristic: no common image extension at end-of-path)
 *
 * The blocker has two cooperating layers:
 *
 *   1. **Scrubber** — `stripTrackersFromHtml()` removes <img> nodes that are
 *      provably trackers (size-or-URL based) BEFORE the HTML is rendered.
 *      This is the primary defense — the browser never even makes the
 *      request, so the read-receipt never fires.
 *
 *   2. **Detector** — `countTrackersInHtml()` runs the same heuristics and
 *      returns the count. Used by `EmailPage` to render the yellow
 *      "blocked trackers" banner when at least one pixel was scrubbed
 *      (or would have been visible). Both call the same underlying matcher
 *      so the count and the scrub always agree.
 *
 * Why not just CSP? CSP `img-src` can't express "block tracking but allow
 * real images" — both are HTTPS image URLs, sometimes from the same host.
 * The decision has to be content-aware, which lives in HTML-rewriting code,
 * not in the CSP header.
 *
 * Design notes:
 *   - Pattern list is intentionally conservative. A false positive removes
 *     a real image, which users WILL notice; a false negative just means
 *     one sender learns the mail was opened. We prefer under-blocking over
 *     over-blocking.
 *   - We deliberately do NOT stub tracked <a> "click" URLs — subscribers
 *     often *want* the link to work (unsubscribe buttons, promo CTAs). The
 *     sender learns a click only when the user explicitly clicks.
 *   - Blocking is reversible: turn it off in Settings → Privacy and the
 *     HTML renders untouched.
 */

// ---------------------------------------------------------------------------
// URL pattern signatures. Lowercase before matching. Ordered roughly by
// frequency-of-appearance in real mail.
// ---------------------------------------------------------------------------

const TRACKER_URL_PATTERNS: RegExp[] = [
  // /e/o/ and /tr/op/ are the dominant ESP endpoints used by Sendgrid,
  // Mailgun, Customer.io, Sendinblue/Brevo, Daytona, Scraperapi, etc.
  /\/e\/o\//,
  /\/tr\/op\//,
  /\/tr\/c(?:\/|$|\?)/,
  // Open-tracking endpoints.
  /\/track(?:ing)?\/open/,
  /\/open(?:ing)?(?:_log|_log_pic|ing_pixel|ing_beacon)\.php/,
  /\/open[/?]/,
  /\/o\?(?:e|c)=/,                     // tiny/shorthand open-tracker
  // Generic sigifiers.
  /\/pixel\.(?:gif|png|jsp|php|aspx)/,
  /\/beacon\//,
  /\/log\.gif/,
  /\/blank\.gif/,
  /\/spacer\.gif/,
  /\/1x1\.(?:gif|png|jpg)/,
  /\/clear\.gif/,
  // Vendor-specific knobs seen in the wild.
  /email_open_log/,
  /open\.gif\?/,
  /mailtrack\./,
  /\/t\?(?:open|click|type)=/,
  // Social campaign trackers.
  /facebook\.com\/email_open_log/,
  /instagram\.com\/.*\/open/,
];

// Image file extensions we consider "real content" — anything ending in these
// is presumed a normal image even if other heuristics fire.
const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|avif|bmp|svg|ico|tiff?|heic|heif)(?:[?#]|$)/i;

/**
 * Decide whether a single URL smells like a tracker. Empty/null URLs are
 * not trackers (they break before we ever see them anyway).
 */
export const isTrackerUrl = (url: string | null | undefined): boolean => {
  if (!url) return false;

  // data:/cid:/blob: are local content, not network leaks.
  if (/^(?:data:|cid:|blob:|mailto:|tel:)/i.test(url)) return false;

  const lower = url.toLowerCase();

  // Small size + no extension → almost certainly a tracking pixel. ESP
  // open-track endpoints (e.g. sendibt3.com /tr/op/) carry no file
  // extension, only a long opaque payload.
  for (const re of TRACKER_URL_PATTERNS) {
    if (re.test(lower)) return true;
  }

  // Pixels coming off paths that AREN'T image extensions and come from a
  // domain whose subdomain or zone hints at "tracking" / "email" / "e".
  // Tighter than the path-based list above — we avoid flagging random
  // "/about" pages of legitimate sites.
  try {
    const u = new URL(url, 'https://placeholder.invalid/');
    const host = u.hostname;
    if (!IMAGE_EXT_RE.test(u.pathname)) {
      if (/(?:^|\.)(?:track|tracking|email|open|pixel|beacon|log)\./.test(host)) {
        return true;
      }
      if (/\.r\.bh\.d\./.test(host)) {
        // Sendibt3-style fingerprinted CDN subdomain chains.
        return true;
      }
    }
  } catch {
    // Malformed URL — treat as not-a-tracker (the image will fail on its own).
  }

  return false;
};

/**
 * Parse an <img> tag's declared dimensions. Both `width`/`height` HTML
 * attributes and CSS `style="width:1px; height:1px"` count as signals.
 * Returns null when no size info is present.
 */
const getImgSize = (tag: string): { w: number | null; h: number | null } => {
  const widthAttr = /\bwidth=["']?(\d+)/i.exec(tag);
  const heightAttr = /\bheight=["']?(\d+)/i.exec(tag);
  const styleAttr = /\bstyle=["']([^"']+)["']/i.exec(tag);

  let w: number | null = widthAttr ? parseInt(widthAttr[1], 10) : null;
  let h: number | null = heightAttr ? parseInt(heightAttr[1], 10) : null;

  if (styleAttr) {
    const style = styleAttr[1];
    const cssW = /width:\s*(\d+)px/i.exec(style);
    const cssH = /height:\s*(\d+)px/i.exec(style);
    if (cssW) w = parseInt(cssW[1], 10);
    if (cssH) h = parseInt(cssH[1], 10);
  }

  return { w, h };
};

/**
 * Inspect one <img ...> tag. Returns 'tracker' | 'image' | 'unknown'.
 *
 * Sizing heuristic: 1x1 (or ≤2x2) images with no real file extension are
 * near-universally trackers. We don't flag 2x2+ because some senders use
 * tiny-but-legit spacers for layout.
 */
const classifyImgTag = (tag: string): 'tracker' | 'image' | 'unknown' => {
  const srcMatch = /\bsrc=["']([^"']+)["']/i.exec(tag);
  const src = srcMatch ? srcMatch[1] : null;

  if (isTrackerUrl(src)) return 'tracker';

  const { w, h } = getImgSize(tag);
  const tinySize = (w !== null && w <= 2) && (h !== null && h <= 2);

  if (tinySize && src && !IMAGE_EXT_RE.test(src)) {
    return 'tracker';
  }

  return src ? 'image' : 'unknown';
};

const IMG_TAG_RE = /<img\b[^>]*>/gi;

/**
 * Walk the HTML and remove all <img> tags that classify as 'tracker'.
 * Other remote images are left alone.
 *
 * Returns a new string. The function is idempotent — running it twice on
 * the same input yields the same output.
 */
export const stripTrackersFromHtml = (html: string): string => {
  if (!html) return html;
  return html.replace(IMG_TAG_RE, (tag) =>
    classifyImgTag(tag) === 'tracker' ? '' : tag
  );
};

/**
 * Count <img> tags that classify as trackers. Used to drive the "N
 * trackers blocked" notice. Cheap: single regex pass.
 */
export const countTrackersInHtml = (html: string): number => {
  if (!html) return 0;
  const matches = html.match(IMG_TAG_RE) || [];
  let count = 0;
  for (const tag of matches) {
    if (classifyImgTag(tag) === 'tracker') count++;
  }
  return count;
};

// ---------------------------------------------------------------------------
// Local storage of the bool flag
// ---------------------------------------------------------------------------

const CACHE_KEY = 'mailvoyage_block_trackers_v1';

/** Read the cached preference. Defaults to ON (true). */
export const readBlockTrackers = (): boolean => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw === null || raw === '') return true;
    return raw === '1';
  } catch {
    return true;
  }
};

/** Cache the preference so it survives reloads. Server remains source-of-truth. */
export const writeBlockTrackers = (value: boolean): void => {
  try {
    localStorage.setItem(CACHE_KEY, value ? '1' : '0');
  } catch {
    /* localStorage full / denied — non-fatal */
  }
};

/** Broadcast a custom event so EmailPage (and others) react to toggle changes
 *  in the same tab without a page reload. */
export const BLOCK_TRACKERS_EVENT = 'mailvoyage:block-trackers-changed';

export const notifyBlockTrackersChanged = (value: boolean): void => {
  try {
    window.dispatchEvent(new CustomEvent(BLOCK_TRACKERS_EVENT, { detail: value }));
  } catch {
    /* no-op in SSR or test env */
  }
};
