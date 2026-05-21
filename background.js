import { AUTH_CONFIG } from "./auth-config.js";
import {
  buildAuthorizeUrl,
  generateCodeChallenge,
  generateCodeVerifier,
  parseOAuthCallback
} from "./pkce.js";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || !request.type) {
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
    handleAICallRequest(request, sendResponse);
    return true;
  }

  
});

function sendTabIdResponse(sender, sendResponse) {
  let tabId = null;

  if (sender && sender.tab && typeof sender.tab.id === "number") {
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
  const data = await storageGet([getAuthStateKey()]);
  return data[getAuthStateKey()] || null;
}

async function saveAuthState(state) {
  await storageSet({
    [getAuthStateKey()]: state
  });
}

async function clearAuthState() {
  await storageRemove([getAuthStateKey()]);
}

function isTokenValid(state) {
  if (!state || !state.accessToken || !state.expiresAt) {
    return false;
  }

  return Date.now() < state.expiresAt - 60 * 1000;
}

function randomState() {
  const bytes = new Uint8Array(16);

  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function loginWithPkce() {
  const redirectUri = chrome.identity.getRedirectURL();

  const state = randomState();

  const codeVerifier = generateCodeVerifier();

  const codeChallenge =
    await generateCodeChallenge(codeVerifier);

  const authorizeUrl = buildAuthorizeUrl({
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
    throw new Error("Login was cancelled");
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
    throw new Error("State mismatch");
  }

  /* ---------------- BACKEND TOKEN EXCHANGE ---------------- */

  const response = await fetch(
    AUTH_CONFIG.BACKEND_URL + "/auth/exchange",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        code: callback.code,
        codeVerifier: codeVerifier,
        redirectUri: redirectUri
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

  const expiresIn =
    Number(tokenData.expires_in || 3600);

  const authState = {
    accessToken:
      tokenData.access_token || null,

    refreshToken:
      tokenData.refresh_token || null,

    idToken:
      tokenData.id_token || null,

    tokenType:
      tokenData.token_type || "Bearer",

    scope:
      tokenData.scope ||
      AUTH_CONFIG.SCOPES,

    expiresAt:
      Date.now() +
      Math.max(expiresIn - 60, 60) * 1000
  };

  if (!authState.accessToken) {
    throw new Error(
      "Access token missing from token response"
    );
  }

  await saveAuthState(authState);

  return authState;
}

async function getValidUserAccessToken(
  interactive
) {
  const state =
    await loadAuthState();

  /* ---------- VALID TOKEN ---------- */

  if (isTokenValid(state)) {
    return state.accessToken;
  }

  /* ---------- REFRESH FLOW ---------- */

  if (
    state &&
    state.refreshToken
  ) {
    try {

      const response =
        await fetch(
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

      console.warn(
        "Refresh failed:",
        err
      );

      await clearAuthState();
    }
  }

  /* ---------- FORCE LOGIN ---------- */

  if (!interactive) {
    throw new Error(
      "SIGN_IN_REQUIRED"
    );
  }

  const loggedIn =
    await loginWithPkce();

  return loggedIn.accessToken;
}

async function handleGetAuthStatus(
  sendResponse
) {
  try {
    const state =
      await loadAuthState();

    sendResponse({
      success: true,

      signedIn:
        Boolean(isTokenValid(state)),

      expiresAt:
        state?.expiresAt || null
    });
  } catch (err) {
    sendResponse({
      success: false,

      error:
        err && err.message
          ? err.message
          : "Failed to read auth state"
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
        err && err.message
          ? err.message
          : "Sign in failed"
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
        err && err.message
          ? err.message
          : "Sign out failed"
    });
  }
}

async function handleAICallRequest(
  request,
  sendResponse
) {
  try {

    const userToken =
      await getValidUserAccessToken(
        true
      );

    const response = await fetch(
      AUTH_CONFIG.BACKEND_URL + "/chat",
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
            request.caseId || "",

          fresh:
            Boolean(request.fresh),

          userToken:
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
          data && data.error
            ? data.error
            : "Backend request failed"
      });

      return;
    }

    sendResponse({
      success: true,
      data: data
    });

  } catch (err) {

    sendResponse({
      success: false,

      error:
        err && err.message
          ? err.message
          : "Unknown background error"
    });
  }
}
async function handleLoadRecentMessages(
    request,
    sendResponse
  ) {
    try {

      const userToken =
        await getValidUserAccessToken(
          true
        );

      const response = await fetch(
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

      sendResponse({
        success: false,

        error:
          err?.message ||
          "Unknown error"
      });
    }
  }