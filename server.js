// ==============================================================================
// 🌐 Tumnak Proxy Server (Render & Railway Edition)
// High-Performance Zero-Dependency Node.js Server & Proxy
// 🎯 Bypasses Cloudflare Datacenter IP blocking for FreeReels & other providers
// ==============================================================================

import http from 'http';
import { URL } from 'url';
import crypto from 'crypto';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';

// ── FreeReels API Configuration ──────────────────────────────────────────────
const BASE_API_URL = "https://apiv2.free-reels.com/frv2-api";
const LOGIN_API_URL = "https://api.mydramawave.com/h5-api/anonymous/login";
const APP_NAME = "com.freereels.app";
const APP_VERSION = "2.2.10";
const OAUTH_SECRET = "8IAcbWyCsVhYv82S2eofRqK1DF3nNDAv&";
const LIMIT = 18;

let gAuthToken = "UK2oImRfAu7yxea4cGMTwSvqTV0BWk8M";
let gAuthSecret = "ea1616a697a58d0453da2480b5ed208b";
let gLastLogin = 0;
let gDeviceId = "0E955D03290C4D2BC3042F03CAA42B61";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, HEAD",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, Content-Type"
};

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

function stripTags(str) {
  return String(str || "").replace(/<[^>]+>/g, "").replace(/{{|}}/g, "").trim();
}

function cleanPosterUrl(url) {
  if (!url) return "";
  let u = String(url).trim();
  while (u.includes("wsrv.nl/?url=")) {
    const idx = u.indexOf("wsrv.nl/?url=");
    const raw = u.substring(idx + 13);
    try { u = decodeURIComponent(raw); } catch (e) { u = raw; }
  }
  if (u.startsWith("http://")) u = "https://" + u.slice(7);
  return u;
}

function sendJson(res, status, data, extra = {}, statusCode = 200) {
  const payload = JSON.stringify({
    status: status || "success",
    version: "2.0.0",
    proxy: "Render/Railway",
    provider: "freereels",
    provider_name: "FreeReels",
    provider_icon: "https://static-v1.mydramawave.com/avatar/fr_default_guest_dark.png",
    provider_logo: "https://static-v1.mydramawave.com/avatar/fr_default_guest_dark.png",
    icon: "https://static-v1.mydramawave.com/avatar/fr_default_guest_dark.png",
    ...extra,
    data: data || (Array.isArray(data) ? [] : {})
  }, null, 2);

  res.writeHead(statusCode, {
    ...CORS_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

// ── FreeReels Native Auth ────────────────────────────────────────────────────
async function refreshAuthTokens() {
  const now = Date.now();
  if (now - gLastLogin < 3600 * 1000 && gAuthToken) return;
  try {
    const res = await fetch(LOGIN_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "app-name": "com.dramawave.h5",
        "app-version": "1.2.20",
        "device-hash": gDeviceId,
        "device-id": gDeviceId,
        "device": "h5",
        "Skip-Encrypt": "1",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      body: JSON.stringify({ device_id: gDeviceId })
    });
    const json = await res.json();
    if (json && json.code === 200 && json.data?.auth_key) {
      gAuthToken = json.data.auth_key;
      const sec = json.data.auth_secret || "";
      gAuthSecret = md5(`${OAUTH_SECRET}${sec}`);
      gLastLogin = now;
      console.log("[Auth] Refreshed FreeReels token successfully");
    }
  } catch (e) {
    console.error("[Auth] Token refresh error:", e.message);
  }
}

function getFrHeaders() {
  return {
    "Ab-Exps": "676:2113,975:3283,919:3075,909:3019,1013:3420,991:3331,973:3278,876:2898,883:2926,617:1901,957:3225,807:2616,697:2195,477:1439,437:1325,1009:3398,990:3328,988:3322,962:3245,544:1646,769:2459,461:1392,1010:3407,972:3276,987:3319,205:552,971:3272,731:2311,953:3209,534:1611,961:3243,956:3222,970:3271",
    "Accept": "application/json",
    "app-name": APP_NAME,
    "app-version": APP_VERSION,
    "Authorization": `oauth_signature=${gAuthSecret},oauth_token=${gAuthToken},ts=${Date.now()}`,
    "country": "KR",
    "device": "android",
    "device-country": "TH",
    "device-id": gDeviceId,
    "language": "th-TH",
    "device-language": "th-TH",
    "User-Agent": "okhttp/4.12.0"
  };
}

async function apiCall(endpoint, method = "GET", body = null) {
  let headers = getFrHeaders();
  const options = { method, headers: { ...headers } };
  if (body && (method === "POST" || method === "PUT")) {
    options.headers["Content-Type"] = "application/json; charset=UTF-8";
    options.body = JSON.stringify(body);
  }
  const url = endpoint.startsWith("http") ? endpoint : `${BASE_API_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
  let res = await fetch(url, options);
  let json = await res.json();

  if (json.code === 401 || json.code === 403 || json.message?.includes("token") || json.message?.includes("auth")) {
    await refreshAuthTokens();
    headers = getFrHeaders();
    options.headers = { ...headers };
    if (body && (method === "POST" || method === "PUT")) {
      options.headers["Content-Type"] = "application/json; charset=UTF-8";
      options.body = JSON.stringify(body);
    }
    res = await fetch(url, options);
    json = await res.json();
  }
  return json;
}

function formatDramaItem(item) {
  const id = String(item.key || item.id || "");
  const title = stripTags(item.title || item.name || "ไม่มีชื่อเรื่อง");
  const poster = cleanPosterUrl(item.cover || "");
  const synopsis = stripTags(item.desc || item.summary || "ไม่มีเรื่องย่อ");
  const episodes = parseInt(item.episode_count || 0) || 50;
  const isCompleted = Boolean(item.finish_status === 2 || item.finish_status === 1);
  const views = String(item.hot_score || item.views || "150000");

  let genres = ["ทั่วไป"];
  if (Array.isArray(item.content_tags) && item.content_tags.length > 0) {
    genres = item.content_tags.map(t => stripTags(t));
  } else if (Array.isArray(item.series_tag) && item.series_tag.length > 0) {
    genres = item.series_tag.map(t => stripTags(t));
  } else if (Array.isArray(item.tag) && item.tag.length > 0) {
    genres = item.tag.map(t => stripTags(t));
  }

  return {
    id,
    source: "freereels",
    provider: "freereels",
    provider_name: "FreeReels",
    provider_icon: "https://static-v1.mydramawave.com/avatar/fr_default_guest_dark.png",
    provider_logo: "https://static-v1.mydramawave.com/avatar/fr_default_guest_dark.png",
    icon: "https://static-v1.mydramawave.com/avatar/fr_default_guest_dark.png",
    title,
    poster,
    posterPath: poster,
    thumbnail: poster,
    synopsis,
    summary: synopsis,
    episodes,
    episodes_count: episodes,
    is_completed: isCompleted,
    views,
    genres
  };
}

// ── HTTP Request Handler ─────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(200, CORS_HEADERS);
    res.end();
    return;
  }

  const hostHeader = req.headers.host || `localhost:${PORT}`;
  const proto = req.headers["x-forwarded-proto"] || "http";
  const currentOrigin = `${proto}://${hostHeader}`;
  const urlObj = new URL(req.url, currentOrigin);
  const pathname = urlObj.pathname;
  const mode = urlObj.searchParams.get("mode") || "home";

  // Health Check (Render / Railway Ping)
  if (pathname === "/health-check" || pathname === "/health" || pathname === "/ping") {
    res.writeHead(200, { ...CORS_HEADERS, "Content-Type": "text/plain" });
    res.end("SYSTEM_OK");
    return;
  }

  try {
    // ── 1. Universal Proxy (/proxy?url=...) ──────────────────────────────────
    if (pathname === "/proxy" || mode === "proxy") {
      let targetUrl = urlObj.searchParams.get("url") || "";
      if (!targetUrl) {
        res.writeHead(400, CORS_HEADERS);
        res.end("Missing target url parameter");
        return;
      }

      const forwardHeaders = {
        "User-Agent": "okhttp/4.12.0",
        "Referer": "https://apiv2.free-reels.com/",
        "Origin": "https://apiv2.free-reels.com"
      };
      if (req.headers["range"]) {
        forwardHeaders["Range"] = req.headers["range"];
      }

      const upstreamRes = await fetch(targetUrl, {
        method: req.method === "OPTIONS" ? "GET" : req.method,
        headers: forwardHeaders
      });

      const contentType = upstreamRes.headers.get("content-type") || "";

      // Rewrite M3U8 Playlist
      if (targetUrl.includes(".m3u8") || contentType.includes("mpegurl")) {
        const text = await upstreamRes.text();
        const orig = new URL(targetUrl);
        const base = orig.origin + orig.pathname.substring(0, orig.pathname.lastIndexOf("/") + 1);
        const toAbs = (ref) => /^https?:\/\//i.test(ref) ? ref : new URL(ref, base).href;
        const proxyLink = (abs) => `${currentOrigin}/proxy?url=${encodeURIComponent(abs)}`;

        const rewritten = text.split(/\r?\n/).map(line => {
          const t = line.trim();
          if (!t) return line;
          if (t.includes('URI="')) {
            return t.replace(/URI="([^"]+)"/g, (_, ref) => `URI="${proxyLink(toAbs(ref))}"`);
          }
          if (!t.startsWith("#")) {
            return proxyLink(toAbs(t));
          }
          return line;
        }).join("\n");

        res.writeHead(200, {
          ...CORS_HEADERS,
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "public, max-age=3600"
        });
        res.end(rewritten);
        return;
      }

      // Stream Binary Media (.ts, .mp4, .aac)
      const outHeaders = { ...CORS_HEADERS };
      if (contentType) outHeaders["Content-Type"] = contentType;
      const acceptRanges = upstreamRes.headers.get("accept-ranges") || "bytes";
      outHeaders["Accept-Ranges"] = acceptRanges;

      const contentLen = upstreamRes.headers.get("content-length");
      if (contentLen) outHeaders["Content-Length"] = contentLen;

      const contentRange = upstreamRes.headers.get("content-range");
      if (contentRange) outHeaders["Content-Range"] = contentRange;

      outHeaders["Cache-Control"] = "public, max-age=86400";

      res.writeHead(upstreamRes.status, outHeaders);
      const reader = upstreamRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
      return;
    }

    // ── 2. FreeReels Native Engine ──────────────────────────────────────────
    // Mode: home / category
    if (mode === "home" || mode === "category") {
      const page = parseInt(urlObj.searchParams.get("page") || "1", 10);
      let tabKey = urlObj.searchParams.get("tab") || urlObj.searchParams.get("category") || urlObj.searchParams.get("id") || "503";
      if (tabKey === "0" || tabKey === "-1" || tabKey === "all") tabKey = "503";

      const targetUrl = `/homepage/v2/tab/index?tab_key=${tabKey}&position_index=10000&rec_trigger=1`;
      const apiRes = await apiCall(targetUrl);
      const outData = [];
      const seen = new Set();

      if (apiRes.data && Array.isArray(apiRes.data.items)) {
        apiRes.data.items.forEach(module => {
          if (module.key && module.title) {
            const item = formatDramaItem(module);
            if (!seen.has(item.id)) { seen.add(item.id); outData.push(item); }
          }
          if (Array.isArray(module.items)) {
            module.items.forEach(child => {
              if (child.key && child.title) {
                const item = formatDramaItem(child);
                if (!seen.has(item.id)) { seen.add(item.id); outData.push(item); }
              }
            });
          }
          if (module.module_card && Array.isArray(module.module_card.items)) {
            module.module_card.items.forEach(child => {
              if (child.key && child.title) {
                const item = formatDramaItem(child);
                if (!seen.has(item.id)) { seen.add(item.id); outData.push(item); }
              }
            });
          }
        });
      }

      const offset = (page - 1) * LIMIT;
      const paged = outData.slice(offset, offset + LIMIT);
      sendJson(res, "success", paged, { page, count: paged.length, total: outData.length });
      return;
    }

    // Mode: categories
    if (mode === "categories") {
      const apiRes = await apiCall("/homepage/v3/tab/list");
      const categories = [{ id: "503", name: "ทั้งหมด", english: "All" }];
      const addedNames = new Set(["ทั้งหมด", "ยอดนิยม"]);

      if (apiRes.data?.list) {
        apiRes.data.list.forEach(parent => {
          if (parent.children) {
            parent.children.forEach(child => {
              if (!addedNames.has(child.name)) {
                addedNames.add(child.name);
                categories.push({
                  id: String(child.tab_key),
                  name: child.name,
                  english: child.business_name || "Genre"
                });
              }
            });
          }
        });
      }
      sendJson(res, "success", categories, { count: categories.length });
      return;
    }

    // Mode: search
    if (mode === "search") {
      const q = urlObj.searchParams.get("q") || urlObj.searchParams.get("keyword") || "";
      const page = parseInt(urlObj.searchParams.get("page") || "1", 10);
      if (!q) { sendJson(res, "success", [], { page, count: 0 }); return; }

      const apiRes = await apiCall("/search/drama", "POST", {
        "next": "",
        "keyword": q,
        "timestamp": String(Date.now())
      });

      const movies = [];
      const seen = new Set();
      if (apiRes.data && Array.isArray(apiRes.data.items)) {
        apiRes.data.items.forEach(item => {
          const d = formatDramaItem(item);
          if (!seen.has(d.id)) { seen.add(d.id); movies.push(d); }
        });
      }
      sendJson(res, "success", movies, { page, count: movies.length });
      return;
    }

    // Mode: detail
    if (mode === "detail") {
      const id = urlObj.searchParams.get("id") || urlObj.searchParams.get("slug") || "";
      if (!id) { sendJson(res, "error", null, { message: "Missing id" }, 400); return; }

      const apiRes = await apiCall(`/drama/info_v2?series_id=${encodeURIComponent(id)}&clip_content=`);
      if (!apiRes.data?.info) {
        sendJson(res, "error", null, { message: `Drama not found for ID: ${id}` }, 404);
        return;
      }

      const info = apiRes.data.info;
      const eps = apiRes.data.episode_list || info.episode_list || [];

      const episodeList = eps.map((ep, idx) => {
        const epNum = parseInt(ep.index || idx + 1, 10);
        const rawStreamUrl = ep.external_audio_h264_m3u8 || ep.m3u8_url || ep.h264_m3u8 || ep.play_url || "";
        const directProxyUrl = rawStreamUrl ? `${currentOrigin}/proxy?url=${encodeURIComponent(rawStreamUrl)}` : "";
        const playUrl = `${currentOrigin}/?mode=play_mp4&id=${encodeURIComponent(id)}&ep=${epNum}`;

        return {
          episode_no: epNum,
          episodeId: String(ep.id || epNum),
          title: `ตอนที่ ${epNum}`,
          thumbnail: ep.cover || info.cover || "",
          video_url: directProxyUrl || playUrl,
          streamUrl: directProxyUrl || playUrl,
          raw_stream_url: rawStreamUrl,
          servers: [
            { name: "Server 1 (HLS Proxy)", url: playUrl, direct_url: directProxyUrl },
            { name: "Server 2 (CORS Proxy)", url: directProxyUrl || playUrl, direct_url: directProxyUrl }
          ]
        };
      });

      const baseData = formatDramaItem(info);
      baseData.id = String(info.id || id);
      baseData.episodes = episodeList.length || baseData.episodes;
      baseData.episodes_count = episodeList.length || baseData.episodes_count;
      baseData.episode_list = episodeList;
      baseData.episodesList = episodeList;

      sendJson(res, "success", baseData);
      return;
    }

    // Mode: play_mp4 / stream
    if (mode === "play_mp4" || mode === "stream" || mode === "play" || mode === "m3u8") {
      const id = urlObj.searchParams.get("id") || urlObj.searchParams.get("slug") || "";
      const ep = parseInt(urlObj.searchParams.get("ep") || urlObj.searchParams.get("episode") || "1", 10);
      const format = urlObj.searchParams.get("format") || "";

      if (!id) { sendJson(res, "error", null, { message: "Missing id" }, 400); return; }

      const apiRes = await apiCall(`/drama/info_v2?series_id=${encodeURIComponent(id)}&clip_content=`);
      const info = apiRes.data?.info;
      const eps = apiRes.data?.episode_list || info?.episode_list || [];

      let targetEp = eps.find(e => parseInt(e.index, 10) === ep);
      if (!targetEp && eps[ep - 1]) targetEp = eps[ep - 1];
      if (!targetEp && eps.length > 0) targetEp = eps[0];

      if (!targetEp) {
        sendJson(res, "error", null, { message: `Episode ${ep} not found` }, 404);
        return;
      }

      const rawStreamUrl = targetEp.external_audio_h264_m3u8 || targetEp.m3u8_url || targetEp.h264_m3u8 || targetEp.play_url || "";
      if (!rawStreamUrl) {
        sendJson(res, "error", null, { message: `No stream URL for episode ${ep}` }, 404);
        return;
      }

      const proxyUrl = `${currentOrigin}/proxy?url=${encodeURIComponent(rawStreamUrl)}`;

      if (format === "json") {
        sendJson(res, "success", {
          id,
          ep,
          url: proxyUrl,
          streamUrl: proxyUrl,
          rawStreamUrl,
          servers: [
            { name: "Server 1 (HLS Official)", url: proxyUrl },
            { name: "Server 2 (Direct CDN)", url: rawStreamUrl }
          ]
        });
        return;
      }

      res.writeHead(302, { ...CORS_HEADERS, "Location": proxyUrl });
      res.end();
      return;
    }

    sendJson(res, "error", null, { message: `Invalid mode: ${mode}` }, 400);
  } catch (err) {
    console.error("[Server Error]:", err);
    sendJson(res, "error", null, { message: err.message }, 500);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`🚀 Tumnak Proxy Server running at http://${HOST}:${PORT}`);
  console.log(`📡 FreeReels & Universal Proxy active and ready for Render/Railway!`);
});
