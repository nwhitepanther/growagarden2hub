const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

function loadEnvFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (err) {
    // .env is optional
  }
}

loadEnvFile(path.join(__dirname, ".env"));

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, "..");
const DISCORD_WEBHOOK_URL =
  process.env.DISCORD_WEBHOOK_URL ||
  "https://discord.com/api/webhooks/1515203240319520878/vNJwVdLIBXJkEn65iVHHfSFd4hurCRVY-91Kvi3DNoQJE6WC-ET46TLQqYu1AW_Z5muG";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

async function fetchRobloxUser(username) {
  const response = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usernames: [username],
      excludeBannedUsers: false,
    }),
  });

  if (!response.ok) {
    const error = new Error("Roblox user lookup failed");
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  if (!payload.data || payload.data.length === 0) {
    const error = new Error("Username not found");
    error.status = 404;
    throw error;
  }

  return payload.data[0];
}

async function fetchRobloxAvatar(userId) {
  const url =
    "https://thumbnails.roblox.com/v1/users/avatar-headshot" +
    `?userIds=${userId}&size=420x420&format=Png&isCircular=false`;

  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  return payload.data?.[0]?.imageUrl ?? null;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

async function handleLookup(req, res, query) {
  const username = String(query.get("username") || "").trim();

  if (!username) {
    return sendJson(res, 400, { error: "Username is required." });
  }

  if (username.length > 20) {
    return sendJson(res, 400, { error: "Username is too long." });
  }

  try {
    const user = await fetchRobloxUser(username);
    const avatarUrl = await fetchRobloxAvatar(user.id);

    return sendJson(res, 200, {
      userId: user.id,
      username: user.name,
      displayName: user.displayName,
      avatarUrl,
      profileUrl: `https://www.roblox.com/users/${user.id}/profile`,
    });
  } catch (err) {
    const status = err.status || 500;
    const message =
      status === 404
        ? "That Roblox username does not exist."
        : "Unable to look up that username right now. Please try again.";

    return sendJson(res, status, { error: message });
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

async function sendToDiscord(payload) {
  if (!DISCORD_WEBHOOK_URL) {
    return { sent: false, reason: "DISCORD_WEBHOOK_URL not configured" };
  }

  const content = [
    "**New Grow a Garden 2 Hub Sign-up**",
    `Username: \`${payload.username}\``,
    `Display Name: ${payload.displayName}`,
    `User ID: ${payload.userId}`,
    `Profile: ${payload.profileUrl}`,
  ].join("\n");

  const response = await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new Error("Failed to send data to Discord.");
  }

  return { sent: true };
}

async function handleSignupSubmit(req, res) {
  try {
    const payload = await readJsonBody(req);
    const username = String(payload.username || "").trim();
    const userId = payload.userId;
    const displayName = String(payload.displayName || "").trim();
    const profileUrl = String(payload.profileUrl || "").trim();

    if (!username || !userId || !displayName) {
      return sendJson(res, 400, { error: "Missing required signup fields." });
    }

    const discordResult = await sendToDiscord({
      username,
      userId,
      displayName,
      profileUrl,
      avatarUrl: payload.avatarUrl || null,
    });

    if (!discordResult.sent) {
      return sendJson(res, 500, {
        error: discordResult.reason || "Failed to send sign-up to Discord.",
      });
    }

    return sendJson(res, 200, {
      ok: true,
      discord: discordResult,
    });
  } catch (err) {
    const message =
      err.message === "Invalid JSON body"
        ? "Invalid request body."
        : err.message || "Unable to process sign-up.";

    return sendJson(res, 500, { error: message });
  }
}

function serveStatic(req, res, pathname) {
  let filePath = path.join(ROOT, pathname === "/" ? "index.html" : pathname);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
      res.end(data);
    });
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(requestUrl.pathname);

  if (req.method === "GET" && pathname === "/api/roblox/lookup") {
    return handleLookup(req, res, requestUrl.searchParams);
  }

  if (req.method === "POST" && pathname === "/api/signup/submit") {
    return handleSignupSubmit(req, res);
  }

  if (req.method === "GET") {
    return serveStatic(req, res, pathname);
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log(`Grow a Garden 2 Hub running at http://localhost:${PORT}`);
  console.log(
    DISCORD_WEBHOOK_URL
      ? "Discord webhook: configured"
      : "Discord webhook: NOT configured (sign-ups will fail)"
  );
});
