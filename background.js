import { AUTH_CONFIG } from "./auth-config.js";
import {
  buildAuthorizeUrl,
  generateCodeChallenge,
  generateCodeVerifier,
  parseOAuthCallback
} from "./pkce.js";

/* =========================================================
   SAFE FETCH WITH TIMEOUT
========================================================= */

async function fetchWithTimeout(
  url,
  options = {},
  timeout = 20000
) {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {

    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    return response;

  } catch (err) {

    clearTimeout(timeoutId);

    if (err.name === "AbortError") {
      throw new Error("Request timeout");
    }

    throw err;
  }
}

/* =========================================================
   KEEP-ALIVE (prevents MV3 service worker termination)
========================================================= */

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("keepAlive", { periodInMinutes: 0.4 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepAlive") {
    chrome.alarms.create("keepAlive", { periodInMinutes: 0.4 });
  }
});

/* =========================================================
   MESSAGE LISTENER
========================================================= */

chrome.runtime.onMessage.addListener(
  (request, sender, sendResponse) => {

    if (!request || !request.type) {
      return;
    }

    if (request.type === "PING") {
      sendResponse({ pong: true });
      return;
    }

    if (request.type === "GET_TAB_ID") {
      sendTabIdResponse(sender, sendResponse);
      return;
    }

    if (request.type === "GET_AUTH_STATUS") {
      handleGetAuthStatus(sendResponse);
      return true;
    }

    if (request.type === "SIGN_IN") {
      handleSignInRequest(sendResponse);
      return true;
    }

    if (request.type === "SIGN_OUT") {
      handleSignOutRequest(sendResponse);
      return true;
    }

    if (
      request.type ===
      "LOAD_RECENT_MESSAGES"
    ) {
      handleLoadRecentMessages(
        request,
        sendResponse
      );

      return true;
    }

    if (request.type === "AI_CALL") {
      handleAICallRequest(
        request,
        sendResponse
      );

      return true;
    }

    if (request.type === "CHECK_AI_STATUS") {
      handleCheckAIStatus(sendResponse);
      return true;
    }
  }
);

/* =========================================================
   HELPERS
========================================================= */

function sendTabIdResponse(
  sender,
  sendResponse
) {
  let tabId = null;

  if (
    sender &&
    sender.tab &&
    typeof sender.tab.id === "number"
  ) {
    tabId = sender.tab.id;
  }

  sendResponse({ tabId: tabId });
}

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function storageSet(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, resolve);
  });
}

function storageRemove(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, resolve);
  });
}

function getAuthStateKey() {
  return AUTH_CONFIG.STORAGE_KEY;
}

async function loadAuthState() {
  const data = await storageGet([
    getAuthStateKey()
  ]);

  return (
    data[getAuthStateKey()] || null
  );
}

async function saveAuthState(state) {
  await storageSet({
    [getAuthStateKey()]: state
  });
}

async function clearAuthState() {
  await storageRemove([
    getAuthStateKey()
  ]);
}

function isTokenValid(state) {
  if (
    !state ||
    !state.accessToken ||
    !state.expiresAt
  ) {
    return false;
  }

  return (
    Date.now() <
    state.expiresAt - 60 * 1000
  );
}

function randomState() {
  const bytes = new Uint8Array(16);

  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((b) =>
      b.toString(16).padStart(2, "0")
    )
    .join("");
}

/* =========================================================
   LOGIN
========================================================= */

async function loginWithPkce() {

  const redirectUri =
    chrome.identity.getRedirectURL();

  const state = randomState();

  const codeVerifier =
    generateCodeVerifier();

  const codeChallenge =
    await generateCodeChallenge(
      codeVerifier
    );

  const authorizeUrl =
    buildAuthorizeUrl({
      authorizeUrl:
        AUTH_CONFIG.OKTA_AUTHORIZE_URL,

      clientId:
        AUTH_CONFIG.CLIENT_ID,

      redirectUri:
        redirectUri,

      state:
        state,

      codeChallenge:
        codeChallenge,

      scopes:
        AUTH_CONFIG.SCOPES
    });

  const callbackUrl =
    await chrome.identity.launchWebAuthFlow({
      url: authorizeUrl,
      interactive: true
    });

  if (!callbackUrl) {
    throw new Error(
      "Login was cancelled"
    );
  }

  const callback =
    parseOAuthCallback(callbackUrl);

  if (callback.error) {
    throw new Error(
      callback.errorDescription ||
      callback.error
    );
  }

  if (!callback.code) {
    throw new Error(
      "Authorization code missing from redirect"
    );
  }

  if (callback.state !== state) {
    throw new Error(
      "State mismatch"
    );
  }

  console.log(
    "Exchanging auth token..."
  );

  const response =
    await fetchWithTimeout(
      AUTH_CONFIG.BACKEND_URL +
        "/auth/exchange",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          code: callback.code,
          codeVerifier:
            codeVerifier,
          redirectUri:
            redirectUri
        })
      }
    );

  const tokenData =
    await response.json();

  if (!response.ok) {
    throw new Error(
      tokenData.error ||
      "Token exchange failed"
    );
  }

  const expiresIn = Number(
    tokenData.expires_in || 3600
  );

  const authState = {
    accessToken:
      tokenData.access_token ||
      null,

    refreshToken:
      tokenData.refresh_token ||
      null,

    idToken:
      tokenData.id_token ||
      null,

    tokenType:
      tokenData.token_type ||
      "Bearer",

    scope:
      tokenData.scope ||
      AUTH_CONFIG.SCOPES,

    expiresAt:
      Date.now() +
      Math.max(
        expiresIn - 60,
        60
      ) *
        1000
  };

  if (!authState.accessToken) {
    throw new Error(
      "Access token missing"
    );
  }

  await saveAuthState(authState);

  return authState;
}

/* =========================================================
   TOKEN
========================================================= */

async function getValidUserAccessToken(
  interactive
) {

  const state =
    await loadAuthState();

  if (isTokenValid(state)) {
    return state.accessToken;
  }

  if (
    state &&
    state.refreshToken
  ) {
    try {

      console.log(
        "Refreshing token..."
      );

      const response =
        await fetchWithTimeout(
          AUTH_CONFIG.BACKEND_URL +
            "/auth/refresh",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              refreshToken:
                state.refreshToken
            })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Refresh failed"
        );
      }

      const expiresIn =
        Number(
          data.expires_in || 3600
        );

      const updatedState = {
        accessToken:
          data.access_token ||
          null,

        refreshToken:
          data.refresh_token ||
          state.refreshToken,

        idToken:
          data.id_token ||
          state.idToken ||
          null,

        tokenType:
          data.token_type ||
          "Bearer",

        scope:
          data.scope ||
          state.scope,

        expiresAt:
          Date.now() +
          Math.max(
            expiresIn - 60,
            60
          ) *
            1000
      };

      await saveAuthState(
        updatedState
      );

      return (
        updatedState.accessToken
      );

    } catch (err) {

      console.error(
        "Refresh failed:",
        err
      );

      await clearAuthState();
    }
  }

  if (!interactive) {
    throw new Error(
      "SIGN_IN_REQUIRED"
    );
  }

  const loggedIn =
    await loginWithPkce();

  return loggedIn.accessToken;
}

/* =========================================================
   AUTH HANDLERS
========================================================= */

async function handleGetAuthStatus(
  sendResponse
) {
  try {

    const state =
      await loadAuthState();

    sendResponse({
      success: true,

      signedIn:
        Boolean(
          isTokenValid(state)
        ),

      expiresAt:
        state?.expiresAt ||
        null
    });

  } catch (err) {

    sendResponse({
      success: false,

      error:
        err?.message ||
        "Failed to read auth state"
    });
  }
}

async function handleSignInRequest(
  sendResponse
) {
  try {

    await getValidUserAccessToken(
      true
    );

    sendResponse({
      success: true,
      signedIn: true
    });

  } catch (err) {

    sendResponse({
      success: false,

      error:
        err?.message ||
        "Sign in failed"
    });
  }
}

async function handleSignOutRequest(
  sendResponse
) {
  try {

    await clearAuthState();

    sendResponse({
      success: true
    });

  } catch (err) {

    sendResponse({
      success: false,

      error:
        err?.message ||
        "Sign out failed"
    });
  }
}

/* =========================================================
   AI CALL
========================================================= */

async function handleAICallRequest(
  request,
  sendResponse
) {
  try {

    if (!navigator.onLine) {
      sendResponse({
        success: false,
        error:
          "No internet connection"
      });

      return;
    }

    console.log(
      "Sending AI request..."
    );

    const userToken =
      await getValidUserAccessToken(
        true
      );

    const response =
      await fetchWithTimeout(
        AUTH_CONFIG.BACKEND_URL +
          "/chat",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            prompt:
              request.prompt,

            caseId:
              request.caseId ||
              "",

            fresh:
              Boolean(
                request.fresh
              ),

            userToken:
              userToken
          })
        },
        300000
      );

    console.log(
      "AI response received"
    );

    if (!response.ok) {

      const contentType =
        response.headers.get("content-type") || "";

      let errorMsg = "Backend request failed (" + response.status + ")";

      if (contentType.includes("application/json")) {
        const errData = await response.json().catch(() => ({}));
        errorMsg = errData?.error || errorMsg;
      }

      sendResponse({
        success: false,
        error: errorMsg
      });

      return;
    }

    const data =
      await response.json();

    sendResponse({
      success: true,
      data: data
    });

  } catch (err) {

    console.error(
      "AI CALL FAILED:",
      err
    );

    sendResponse({
      success: false,
      error: err?.message === "Request timeout"
        ? "RESPONSE_PENDING"
        : (err?.message || "Unknown background error")
    });
  }
}

/* =========================================================
   AI STATUS CHECK
========================================================= */

const STATUS_URL =
  "https://fluffyjaws.adobe.com/api/status/openai-swedencentral";

async function handleCheckAIStatus(sendResponse) {
  try {
    const response = await fetchWithTimeout(STATUS_URL, {}, 10000);

    if (!response.ok) {
      sendResponse({ success: false, error: "Status fetch failed" });
      return;
    }

    const data = await response.json();

    let status = "green";

    if (data.activeIssueCount > 0) {
      status = "red";
    } else if (data.warning === true) {
      status = "yellow";
    }

    const tooltip = data.activeIssueCount > 0
      ? "Azure OpenAI outage detected"
      : data.warning
        ? (data.message || "High latency detected")
        : "Azure OpenAI operational";

    sendResponse({ success: true, status, tooltip });

  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

/* =========================================================
   RECENT MESSAGES
========================================================= */

async function handleLoadRecentMessages(
  request,
  sendResponse
) {
  try {

    const userToken =
      await getValidUserAccessToken(
        true
      );

    console.log(
      "Loading recent messages..."
    );

    const response =
      await fetchWithTimeout(
        AUTH_CONFIG.BACKEND_URL +
          "/conversation/recent",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            caseId:
              request.caseId,

            userToken
          })
        }
      );

    const data =
      await response.json();

    if (!response.ok) {

      sendResponse({
        success: false,

        error:
          data.error ||
          "Failed loading messages"
      });

      return;
    }

    sendResponse({
      success: true,
      data
    });

  } catch (err) {

    console.error(
      "LOAD RECENT FAILED:",
      err
    );

    sendResponse({
      success: false,

      error:
        err?.message ||
        "Unknown error"
    });
  }
}