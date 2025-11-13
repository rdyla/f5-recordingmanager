// _worker.js – Zoom Phone Recording Explorer backend

const ZOOM_API_BASE = "https://api.zoom.us/v2";
const ZOOM_OAUTH_TOKEN_URL = "https://zoom.us/oauth/token";

/**
 * Simple in-memory access token cache
 */
let cachedToken = null;
let cachedTokenExp = 0;

async function getZoomAccessToken(env) {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExp - 30_000) {
    return cachedToken;
  }

  const basicAuth = btoa(`${env.ZOOM_CLIENT_ID}:${env.ZOOM_CLIENT_SECRET}`);

  const url = new URL(ZOOM_OAUTH_TOKEN_URL);
  url.searchParams.set("grant_type", "account_credentials");
  url.searchParams.set("account_id", env.ZOOM_ACCOUNT_ID);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to get Zoom token (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenExp = Date.now() + (data.expires_in || 3600) * 1000;
  return cachedToken;
}

/* -------------------- PHONE RECORDINGS -------------------- */

async function handleGetRecordings(req, env) {
  const url = new URL(req.url);
  const upstreamUrl = new URL(`${ZOOM_API_BASE}/phone/recordings`);

  for (const [key, value] of url.searchParams.entries()) {
    upstreamUrl.searchParams.set(key, value);
  }

  const token = await getZoomAccessToken(env);

  const upstreamRes = await fetch(upstreamUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await upstreamRes.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  return new Response(JSON.stringify(body), {
    status: upstreamRes.status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

/* -------------------- MEETING RECORDINGS (STUB FOR NOW) -------------------- */

async function handleGetMeetingRecordings(req, env) {
  // Prove routing works without Zoom dependencies
  const now = new Date().toISOString();

  const fakeResponse = {
    from: "2025-11-01",
    to: "2025-11-13",
    page_size: 30,
    next_page_token: "",
    meetings: [
      {
        uuid: "dummy-uuid",
        id: 123456789,
        topic: "Test Meeting (stub)",
        start_time: now,
        duration: 45,
        host_id: "host-123",
        host_email: "host@example.com",
        recording_files: [
          {
            id: "file-1",
            recording_start: now,
            recording_end: now,
            download_url: "https://example.com/download",
            file_type: "MP4",
          },
        ],
      },
    ],
  };

  return new Response(JSON.stringify(fakeResponse), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/* -------------------- MEETING IDENTITY -------------------- */

async function handleGetMeetingIdentity(req, env) {
  const userId = env.ZOOM_MEETINGS_USER_ID || "me";

  return new Response(
    JSON.stringify({
      userId,
      source: env.ZOOM_MEETINGS_USER_ID ? "ZOOM_MEETINGS_USER_ID" : "default_me",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

/* -------------------- DOWNLOAD PROXY (OPTIONAL) -------------------- */

async function handleDownloadRecording(req, env) {
  const url = new URL(req.url);
  const target = url.searchParams.get("url");

  if (!target) {
    return json(400, { error: "Missing 'url' query parameter" });
  }

  let zoomUrl;
  try {
    zoomUrl = new URL(target);
  } catch {
    return json(400, { error: "Invalid URL" });
  }

  if (
    zoomUrl.hostname !== "zoom.us" ||
    !zoomUrl.pathname.startsWith("/v2/phone/recording/download")
  ) {
    return json(400, { error: "Blocked URL" });
  }

  const token = await getZoomAccessToken(env);

  const zoomRes = await fetch(zoomUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  const headers = new Headers();
  if (zoomRes.headers.get("content-type"))
    headers.set("Content-Type", zoomRes.headers.get("content-type"));
  if (zoomRes.headers.get("content-disposition"))
    headers.set("Content-Disposition", zoomRes.headers.get("content-disposition"));

  return new Response(zoomRes.body, { status: zoomRes.status, headers });
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/* -------------------- ROUTER -------------------- */

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // Phone recordings
    if (url.pathname === "/api/phone/recordings" && req.method === "GET") {
      return handleGetRecordings(req, env);
    }

    // Phone download proxy
    if (url.pathname === "/api/phone/recordings/download" && req.method === "GET") {
      return handleDownloadRecording(req, env);
    }

    // Meeting recordings (stub)
    if (url.pathname === "/api/meeting/recordings" && req.method === "GET") {
      return handleGetMeetingRecordings(req, env);
    }

    // Meeting identity
    if (url.pathname === "/api/meeting/identity" && req.method === "GET") {
      return handleGetMeetingIdentity(req, env);
    }

    // Asset serving (your React UI)
    if (env.ASSETS) {
      return env.ASSETS.fetch(req);
    }

    return new Response("Recording Explorer backend", { status: 200 });
  },
};
