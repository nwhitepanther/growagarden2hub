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
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  const username = String(req.query?.username || "").trim();

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
};
