const DEBUG = true;
const ENFORCE_NO_BOLD = false;

const AI_ACTIONS = [
  {
    label: "Executive Summary",
    prompt: "Provide executive summary for leadership in 5 points.\n\n"
  },
  {
    label: "Find Relevant JIRA",
    prompt: "Suggest relevant JIRA. Priotise any similar and relavent jira whoes status is open then look for other closed relavent simmilar JIRA,why thsese jira are similar summarise all that info in table as well also show the current status of the JIRAs\n\n"
  },
  {
    label: "Similar Cases",
    prompt: "Find similar dynamic cases with 1 liner explnination why they fit and provide the exact adobe-ent.crm.dynamics.com link for every case and make sure link are clickable.\n\n"
  },
  {
    label: "Next Steps",
    prompt: "Provide next steps to investigate the case. from the payload that you have got for this case from dynamics in that object there would be an key with the name  activities from this key's value array show me the last object only out of the complete payload and its heading should be 'Disclamer! Latest response from Dynamic sent me'\n\n"
  },
  {
    label: "Close Escalation",
    prompt: "give me 1 liner each point for this case Issue Summary Customer Impact Root Cause Corrective Action in past tense imperative\n\n"
  },
  {
    label: "FTS Notes",
    prompt: "perpare FTS notes in less than 100 words so it can be shared with next geo engineer who will work on this case, It should have Client's Org name, CaseID, Issue, Next Steps \n\n"
  },
  {
    label: "Case Closure",
    prompt: "Skim thorugh the complete ticket and Please provide details about case resolution, this will be customer facing in less then 100 words make a final response that can be shared with client in past tense imparative \n\n"
  }
];

const PROCESSING_MESSAGES = [
  "⏳ Please wait while the minions do their work",
  "🛠️ Grabbing extra minions",
  "💪 Doing the heavy lifting",
  "😴 Waking up the minions",
  "📞 You are number 2843684714 in the queue",
  "Swapping time and space",
  "Don't worry - a few bits tried to escape, but we caught them",
  "The server is powered by a lemon and two electrodes",
  "Just count to 10",
  "I feel like im supposed to be loading something",
  "Keeping all the 1's and removing all the 0's",
  "Convincing AI not to turn evil",
  "Distracted by cat gifs",
  "Go ahead, hold your breath and do an ironman plank till loading complete",
  "Fact: Alt-F4 speeds things up, try",
  "Discovering new ways of making you wait",
];

let lastProcessingIndex = -1;

function getRandomProcessingMessage() {
  let index;

  do {
    index = Math.floor(
      Math.random() * PROCESSING_MESSAGES.length
    );
  } while (
    PROCESSING_MESSAGES.length > 1 &&
    index === lastProcessingIndex
  );

  lastProcessingIndex = index;

  return PROCESSING_MESSAGES[index];
}

function log(tag, ...args) {
  if (!DEBUG) return;
  console.log("%c[abjoshi][" + tag + "]", "color:#4caf50", ...args);
}

/* ---------- MARKDOWN ---------- */

const MarkdownIt = window.markdownit;

if (!MarkdownIt) {
  console.error("❌ markdown-it not loaded");
}

let md = MarkdownIt
  ? MarkdownIt({
    html: false,
    linkify: true,
    breaks: true
  })
  : null;

if (md) {
  const defaultRender =
    md.renderer.rules.link_open ||
    function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };

  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const token = tokens[idx];

    token.attrSet("target", "_blank");
    token.attrSet("rel", "noopener noreferrer");

    return defaultRender(tokens, idx, options, env, self);
  };
}
/* ---------- MARKDOWN FIX ---------- */

function normalizeMarkdownTables(text) {
  return text.replace(
    /(\|.+\|\n\|[-| ]+\|\n)([\s\S]*?)(\n\n|$)/g,
    (match) => match.replace(/\n\s*\n/g, "\n")
  );
}

/* ---------- STATE ---------- */

let panel;
let chatContainer;
let primaryBtn;
let authBtn;
let expanded = false;

const LOCAL_CACHE_KEY =
  "orbit_recent_cache_v1";

function getConversationCacheKey() {

  const caseId =
    getCaseId();

  return caseId
    ? "case::" + caseId
    : "unknown";
}

function loadRecentCache() {

  return new Promise(resolve => {

    chrome.storage.local.get(
      [LOCAL_CACHE_KEY],

      data => {

        const cache =
          data[
          LOCAL_CACHE_KEY
          ] || {};

        resolve(
          cache[
          getConversationCacheKey()
          ] || null
        );
      }
    );
  });
}

function saveRecentCache(
  payload
) {

  chrome.storage.local.get(
    [LOCAL_CACHE_KEY],

    data => {

      const cache =
        data[
        LOCAL_CACHE_KEY
        ] || {};

      cache[
        getConversationCacheKey()
      ] = {
        messages:
          payload.messages || [],

        latestResponseId:
          payload.latestResponseId || null,

        lastSyncedAt:
          Date.now()
      };

      chrome.storage.local.set({
        [LOCAL_CACHE_KEY]:
          cache
      });
    }
  );
}



/* ---------- STORAGE ---------- */

function getPageKey() {
  const match = location.href.match(/id=([^&]+)/);
  return match ? match[1] : location.href;
}



/* ---------- AUTH ---------- */

function parseJwt(token) {
  try {
    return JSON.parse(
      atob(token.split(".")[1])
    );
  } catch (err) {
    return null;
  }
}

function getAuthStatus(cb) {
  chrome.runtime.sendMessage({ type: "GET_AUTH_STATUS" }, (res) => {
    cb(res);
  });
}

function refreshAuthButton() {
  if (!authBtn) return;

  chrome.storage.local.get(
    ["orbit_auth_v1"],
    (storage) => {

      const auth =
        storage.orbit_auth_v1;

      if (
        auth &&
        auth.accessToken &&
        auth.idToken
      ) {
        const payload =
          parseJwt(auth.idToken);

        const displayName =
          payload?.name ||
          payload?.preferred_username ||
          payload?.email ||
          "Signed In";

        authBtn.textContent =
          displayName;

        authBtn.disabled = true;

        authBtn.title =
          "Authenticated user";

        return;
      }

      authBtn.textContent =
        "Sign In";

      authBtn.disabled = false;

      authBtn.title =
        "Sign in with Okta";
    }
  );
}

function startSignIn() {

  addMessage(
    "🔐 Starting sign-in...",
    "system"
  );

  chrome.runtime.sendMessage(
    { type: "SIGN_IN" },

    (res) => {

      if (
        !res ||
        !res.success
      ) {

        let errorMessage =
          res?.error ||
          "Unknown error";

        /* ---------- VPN / NETWORK ---------- */

        const normalized =
          String(errorMessage)
            .toLowerCase();

        if (
          normalized.includes(
            "failed to fetch"
          ) ||

          normalized.includes(
            "network"
          ) ||

          normalized.includes(
            "refresh failed"
          ) ||

          normalized.includes(
            "token exchange failed"
          )
        ) {

          errorMessage =
            "🔐 Please connect to Adobe VPN and sign in again.";
        }

        addMessage(
          "❌ Sign-in failed: " +
          errorMessage,
          "system"
        );

        refreshAuthButton();

        return;
      }

      addMessage(
        "✅ Signed in successfully.",
        "system"
      );

      refreshAuthButton();
    }
  );
}

/* ---------- SCROLL ---------- */

function scrollToBottom() {
  if (!chatContainer) return;

  const threshold = 120;
  const nearBottom =
    chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < threshold;

  if (!nearBottom) return;

  requestAnimationFrame(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  });
}

function getTextarea() {

  return [...document.querySelectorAll("textarea")]
    .find(el => el.id !== "ai-input");
}

function hasTimelineItems() {
  return document.querySelectorAll("button ~ li").length > 0;
}

function getTimelineText() {
  return Array.from(document.querySelectorAll("button ~ li"))
    .map(e => e.innerText.trim())
    .join("\n\n");
}

function getCaseId() {
  try {
    return [...document.querySelectorAll("div")]
      .find(el => el.textContent.trim() === "Case ID")
      ?.closest('[data-preview_orientation="column"]')
      ?.querySelector("div div div")
      ?.innerText.trim();
  } catch {
    return null;
  }
}

function getRelevantText() {
  // control li tags vales
  // if (hasTimelineItems()) return getTimelineText();

  const t = getTextarea();

  return t ? t.value.trim() : "";
}

/* ---------- PROMPT BUILDER ---------- */

function buildFinalPrompt(basePrompt, text) {
  let prompt = basePrompt || "";

  const caseId = getCaseId();

  if (caseId) {
    prompt += "Case ID: " + caseId + "\n\n";
  }

  prompt += text;

  if (ENFORCE_NO_BOLD) {
    prompt += "\n\n make sure response is nicely formated proper headings n everything.";
  }

  return prompt;
}

/* ---------- PRIMARY BUTTON ---------- */

function getPrimaryAction() {
  if (hasTimelineItems()) {
    return {
      label: "Summarise",
      prompt:
        "Summarize the complete ticket in easy to understand way, in pointers. Maximum info All in 250 words\n\n"
    };
  }

  return {
    label: "Draft First Response",
    prompt:
      "make an one complete single empathetic first response based on case's description that can be shared with customer, keep it polite and humble like good customer success agent , keep Sense of Urgency acknowledged the issue, Understood and restated issue to ensure customer agreement by paraphrasing avoid words like 'sorry', 'frustatring'. also ask client to approve impersonation request they would have received an email form 'message@adobe.com'. \n\n"
  };
}

function updatePrimaryButton() {
  const action = getPrimaryAction();
  primaryBtn.textContent = action.label;
}

function handlePrimaryClick() {

  const action =
    getPrimaryAction();

  const text =
    getRelevantText();

  if (action.label === "Draft First Response" && !text) {

    addMessage(
      "⚠️ No case content found.",
      "system"
    );

    return;
  }

  const prompt =
    action.label ===
      "Draft First Response"

      ? buildFinalPrompt(
        action.prompt,
        text
      )

      : buildFinalPrompt(
        action.prompt,
        ""
      );

  

  Analytics.track(
    "orbit.primary.clicked",
    {
      caseId: getCaseId(),

      buttonName:
        action.label,

      promptType:
        "primary"
    }
  );

  /* ---------- ONLY FIRST RESPONSE IS FRESH ---------- */

  const forceFresh =
    action.label ===
    "Draft First Response";

  sendToAI(
    prompt,
    forceFresh,
  action.label
  );
}

/* ---------- LINKIFY FALLBACK ---------- */

function createLinkedText(container, text) {
  const urlRegex = /((https?:\/\/|www\.)[^\s]+)/g;

  let lastIndex = 0;
  let match;

  while ((match = urlRegex.exec(text)) !== null) {
    let rawUrl = match[0];

    const before = text.slice(lastIndex, match.index);

    if (before) {
      container.appendChild(document.createTextNode(before));
    }

    let cleanedUrl = rawUrl.trim();

    while (/[.,)\]\}]/.test(cleanedUrl.slice(-1))) {
      cleanedUrl = cleanedUrl.slice(0, -1);
    }

    if (!cleanedUrl.startsWith("http")) {
      cleanedUrl = "https://" + cleanedUrl;
    }

    try {
      new URL(cleanedUrl);
    } catch {
      container.appendChild(document.createTextNode(rawUrl));
      lastIndex = match.index + rawUrl.length;
      continue;
    }

    const link = document.createElement("a");

    link.href = cleanedUrl;
    link.textContent = rawUrl.replace(/[.,)\]\}]+$/, "");
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "ai-link";

    container.appendChild(link);

    lastIndex = match.index + rawUrl.length;
  }

  const remaining = text.slice(lastIndex);

  if (remaining) {
    container.appendChild(document.createTextNode(remaining));
  }
}

/* ---------- UI ---------- */

function createUI() {
  panel = document.createElement("div");
  panel.id = "ai-box";
  panel.style.display = "none";

  const header = document.createElement("div");
  header.id = "ai-header";

  const title = document.createElement("span");
  title.textContent = "Volt ⚡";

  const actions = document.createElement("div");

  primaryBtn = document.createElement("button");

  const authButton = document.createElement("button");
  authButton.textContent = "Sign In";
  authButton.classList.add("btn-clear");
  authButton.title = "Sign in with Okta";

  const clearBtn = document.createElement("button");
  clearBtn.textContent = "Clear";
  clearBtn.classList.add("btn-clear");

  const newChatBtn = document.createElement("button");
  newChatBtn.textContent = "New Chat";

  const resizeBtn = document.createElement("button");
  resizeBtn.textContent = "Expand";

  const menuBtn = document.createElement("button");
  menuBtn.textContent = "⋯";
  menuBtn.id = "ai-menu-btn";

  actions.append(
    primaryBtn,
    authButton,
    clearBtn,
    newChatBtn,
    resizeBtn,
    menuBtn
  );

  header.append(title, actions);

  chatContainer = document.createElement("div");
  chatContainer.id = "ai-chat";

  const inputBox = document.createElement("div");
  inputBox.id = "ai-input-box";

  const input = document.createElement("textarea");

  input.placeholder =
    "Ask Volt anything about this case ⚡";

  input.rows = 1;

  input.id = "ai-input";

  const sendBtn = document.createElement("button");
  sendBtn.textContent = "Send";

  inputBox.append(input, sendBtn);

  panel.append(header, chatContainer, inputBox);

  document.body.appendChild(panel);

  authBtn = authButton;
  refreshAuthButton();

  /* ---------- MENU ---------- */

  const menu = document.createElement("div");
  menu.id = "ai-menu";
  menu.style.display = "none";

  /* ---------- MENU HEADER ---------- */

  const menuHeader = document.createElement("div");
  menuHeader.className = "ai-menu-header";

  const menuTitle = document.createElement("span");
  menuTitle.textContent = "Actions";

  const menuClose = document.createElement("button");
  menuClose.textContent = "✕";
  menuClose.className = "ai-menu-close";

  menuClose.onclick = function () {
    menu.style.display = "none";
  };

  menuHeader.append(menuTitle, menuClose);

  menu.appendChild(menuHeader);

  document.body.appendChild(menu);

  menuBtn.onclick = function (e) {
    e.stopPropagation();

    if (menu.style.display === "block") {
      menu.style.display = "none";
      return;
    }

    menu.innerHTML = "";
    menu.appendChild(menuHeader);

    AI_ACTIONS.forEach(action => {
      const item = document.createElement("div");

      item.className = "ai-menu-item";
      item.textContent = action.label;

      item.onclick = function () {
        const text = getRelevantText();


        if (!text) return;

        // attach description or not 
        // const prompt = buildFinalPrompt(action.prompt, text);
        const prompt = buildFinalPrompt(action.prompt, "");

        

        Analytics.track("orbit.menu.clicked", {
          caseId: getCaseId(),
          buttonName: action.label,
          promptType: "menu_action"
        });

        sendToAI(
  prompt,
  false,
  action.label
);

        menu.style.display = "none";
      };

      menu.appendChild(item);
    });

    const rect = menuBtn.getBoundingClientRect();

    menu.style.position = "fixed";
    menu.style.top = rect.bottom + "px";
    menu.style.right = "20px";
    menu.style.display = "block";
  };

  /* ---------- OUTSIDE CLICK ---------- */

  document.addEventListener("click", function (e) {
    if (
      menu.style.display === "block" &&
      !menu.contains(e.target) &&
      !menuBtn.contains(e.target)
    ) {
      menu.style.display = "none";
    }
  });

  /* ---------- BUTTON EVENTS ---------- */

  primaryBtn.onclick =
    handlePrimaryClick;

  authBtn.onclick =
    function () {

      startSignIn();
    };

  clearBtn.onclick =
    function () {

      Analytics.track(
        "orbit.chat.clear",
        {
          caseId: getCaseId()
        }
      );

      while (
        chatContainer.firstChild
      ) {
        chatContainer.removeChild(
          chatContainer.firstChild
        );
      }
    };

  newChatBtn.onclick =
    function () {

      Analytics.track(
        "orbit.chat.new",
        {
          caseId: getCaseId()
        }
      );

      while (
        chatContainer.firstChild
      ) {
        chatContainer.removeChild(
          chatContainer.firstChild
        );
      }
    };

  resizeBtn.onclick =
    function () {

      Analytics.track(
        "orbit.panel.resize",
        {
          caseId: getCaseId(),
          expanded: !expanded
        }
      );

      expanded = !expanded;

      panel.classList.toggle(
        "expanded"
      );

      resizeBtn.textContent =
        expanded
          ? "Collapse"
          : "Expand";
    };

  sendBtn.onclick =
    function () {

      handleSend(input);
    };

  input.addEventListener(
    "keydown",
    
    function (e) {

      /* ---------- ENTER = SEND ---------- */

      if (
        e.key === "Enter" &&
        !e.shiftKey
      ) {

        e.preventDefault();

        handleSend(input);

        return;
      }

      /* ---------- SHIFT + ENTER ---------- */

      if (
        e.key === "Enter" &&
        e.shiftKey
      ) {

        return;
      }
    }
  );

  /* ---------- AUTO GROW ---------- */

input.addEventListener(
  "input",

  function () {

    input.style.height =
      "auto";

    input.style.height =
      Math.min(
        input.scrollHeight,
        160
      ) + "px";
  }
);


}

/* ---------- CHAT ---------- */

function addMessage(text, role) {
  const wrapper = document.createElement("div");

  wrapper.className = "ai-msg";

  const content = document.createElement("div");

  let rendered = false;

  if (md) {
    try {
      const clean = normalizeMarkdownTables(text || "");

      const html = md.render(clean);

      const container = document.createElement("div");

      container.innerHTML = html;

      content.appendChild(container);

      rendered = true;
    } catch (e) {
      log("MD", "Render failed", e);
    }
  }

  if (!rendered) {
    (text || "").split("\n").forEach(line => {
      const el = document.createElement("div");

      createLinkedText(el, line);

      content.appendChild(el);
    });
  }

  wrapper.appendChild(content);

  /* ---------- COPY BUTTON ---------- */

  if (role === "ai") {
    const copyBtn = document.createElement("button");

    copyBtn.className = "ai-copy-btn";
    copyBtn.textContent = "Copy";

    copyBtn.onclick = async () => {
      Analytics.track("orbit.copy.clicked", {
        caseId: getCaseId()
      });
      try {
        const clone = content.cloneNode(true);

        clone.querySelectorAll("table").forEach(table => {
          table.style.borderCollapse = "collapse";
          table.style.width = "100%";
          table.style.fontFamily = "Arial, sans-serif";
          table.style.fontSize = "13px";
        });

        clone.querySelectorAll("th, td").forEach(cell => {
          cell.style.border = "1px solid #ccc";
          cell.style.padding = "6px";
          cell.style.textAlign = "left";
        });

        clone.querySelectorAll("th").forEach(th => {
          th.style.background = "#f5f5f5";
          th.style.fontWeight = "bold";
        });

        clone.querySelectorAll("p").forEach(p => {
          p.style.margin = "6px 0";
        });

        const htmlContent = `
          <div style="font-family: Arial, sans-serif; font-size: 13px; color: #000;">
            ${clone.innerHTML}
          </div>
        `;

        const plainText = clone.innerText;

        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([htmlContent], {
              type: "text/html"
            }),
            "text/plain": new Blob([plainText], {
              type: "text/plain"
            })
          })
        ]);

        copyBtn.textContent = "Copied!";

        setTimeout(() => {
          copyBtn.textContent = "Copy";
        }, 1500);

      } catch (err) {
        console.error("Copy failed", err);

        navigator.clipboard.writeText(text);
      }
    };

    wrapper.appendChild(copyBtn);
  }

  chatContainer.appendChild(wrapper);

  scrollToBottom();
}
/* ---------- TYPING EFFECT ---------- */

function typeMessage(text, role = "ai", speed = 8) {
  const wrapper = document.createElement("div");
  wrapper.className = "ai-msg";

  const content = document.createElement("div");
  wrapper.appendChild(content);

  chatContainer.appendChild(wrapper);

  scrollToBottom();

  let current = "";
  let index = 0;

  const interval = setInterval(() => {
    current += text[index];
    index++;

    let rendered = false;

    if (md) {
      try {
        const clean = normalizeMarkdownTables(current);
        content.innerHTML = md.render(clean);
        rendered = true;
      } catch (e) { }
    }

    if (!rendered) {
      content.textContent = current;
    }

    if (index % 20 === 0) scrollToBottom();

    if (index >= text.length) {
      clearInterval(interval);

      // add copy button after typing completes
      if (role === "ai") {
        const copyBtn = document.createElement("button");

        copyBtn.className = "ai-copy-btn";
        copyBtn.textContent = "Copy";

        copyBtn.onclick = async () => {

          window.Analytics?.track(
            "orbit.copy.clicked",
            {
              caseId: getCaseId()
            }
          );

          try {

            const clone =
              content.cloneNode(true);

            clone.querySelectorAll("table")
              .forEach(table => {

                table.style.borderCollapse =
                  "collapse";

                table.style.width = "100%";

                table.style.fontFamily =
                  "Arial, sans-serif";

                table.style.fontSize =
                  "13px";
              });

            clone.querySelectorAll("th, td")
              .forEach(cell => {

                cell.style.border =
                  "1px solid #ccc";

                cell.style.padding =
                  "6px";

                cell.style.textAlign =
                  "left";
              });

            clone.querySelectorAll("th")
              .forEach(th => {

                th.style.background =
                  "#f5f5f5";

                th.style.fontWeight =
                  "bold";
              });

            clone.querySelectorAll("p")
              .forEach(p => {

                p.style.margin = "6px 0";
              });

            const htmlContent = `
      <div style="
        font-family: Arial, sans-serif;
        font-size: 13px;
        color: #000;
      ">
        ${clone.innerHTML}
      </div>
    `;

            const plainText =
              clone.innerText;

            await navigator.clipboard.write([
              new ClipboardItem({

                "text/html":
                  new Blob(
                    [htmlContent],
                    {
                      type: "text/html"
                    }
                  ),

                "text/plain":
                  new Blob(
                    [plainText],
                    {
                      type: "text/plain"
                    }
                  )
              })
            ]);

            copyBtn.textContent =
              "Copied!";

            setTimeout(() => {

              copyBtn.textContent =
                "Copy";

            }, 1500);

          } catch (err) {

            console.error(
              "Copy failed",
              err
            );
          }
        };

        wrapper.appendChild(copyBtn);
      }
    }
  }, speed);
}
/* ---------- PROMPT → LABEL LOOKUP ---------- */

function resolveDisplayLabel(content) {
  const allActions = [...AI_ACTIONS, getPrimaryAction()];
  const trimmed = content.trim();
  const matched = allActions.find(a => {
    const p = a.prompt.trim();
    return trimmed === p || trimmed.startsWith(p);
  });
  return matched ? matched.label : content;
}

/* ---------- SEND ---------- */

function handleSend(input) {
  const text = input.value.trim();

  if (!text) return;

  input.value = "";
  input.style.height = "";

  const prompt = buildFinalPrompt("", text);

  const visibleLabel = resolveDisplayLabel(text);

  Analytics.track("orbit.followup.sent", {
    caseId: getCaseId(),
    inputLength: text.length
  });

  sendToAI(
  prompt, false, visibleLabel
);
}

/* ---------- AI ---------- */

function sendToAI(
  prompt,
  forceFresh,
  visibleLabel
) {

  /* ---------- SHOW USER LABEL ---------- */

  if (visibleLabel) {

    addMessage(
      visibleLabel,
      "user"
    );
  }

  const loading =
    document.createElement("div");

  loading.className =
    "ai-msg processing-msg";

  const baseMessage =
    getRandomProcessingMessage();

  let dots = 0;

  loading.textContent =
    baseMessage;

  const dotsInterval =
    setInterval(() => {

      dots = (dots + 1) % 4;

      loading.textContent =
        baseMessage +
        ".".repeat(dots);

    }, 500);

  chatContainer.appendChild(
    loading
  );

  scrollToBottom();

  let fresh;

  if (forceFresh === true) {

    fresh = true;

    log(
      "CTX",
      "Forced fresh"
    );

  } else {

    fresh = false;

    log(
      "CTX",
      "Backend continuity"
    );
  }

  const requestStartTime = performance.now();

  Analytics.track(
    "orbit.ai.request",
    {
      caseId:
        getCaseId(),

      promptLength:
        prompt.length,

      freshContext:
        fresh
    }
  );

  chrome.runtime.sendMessage(
    {
      type: "AI_CALL",

      prompt,

      caseId:
        getCaseId(),

      fresh
    },

    res => {

      clearInterval(
        dotsInterval
      );

      loading.remove();

      scrollToBottom();

      /* ---------- ERROR ---------- */

      if (
        !res ||
        !res.success
      ) {

        Analytics.track(
          "orbit.ai.error",
          {
            caseId:
              getCaseId(),

            error:
              res?.error ||
              "Unknown"
          }
        );

        let errorMessage =
          res?.error ||
          "Unknown error";

        /* ---------- VPN / NETWORK ---------- */

        const normalized =
          String(errorMessage)
            .toLowerCase();

        if (
          normalized.includes(
            "failed to fetch"
          ) ||

          normalized.includes(
            "network"
          ) ||

          normalized.includes(
            "refresh failed"
          ) ||

          normalized.includes(
            "token exchange failed"
          )
        ) {

          errorMessage =
            "🔐 Please connect to Adobe VPN and try again.";
        }

        addMessage(
          "❌ Error: " +
          errorMessage,
          "system"
        );

        /* ---------- SIGN IN ---------- */

        if (
          res?.error &&
          String(res.error)
            .includes(
              "SIGN_IN_REQUIRED"
            )
        ) {

          addMessage(
            "🔐 Please click Sign In and try again.",
            "system"
          );
        }

        return;
      }

      /* ---------- SUCCESS ---------- */

      const aiText =
        res.data.text;

      const duration =
        Math.round(
          performance.now() -
          requestStartTime
        );

      Analytics.track(
        "orbit.ai.response",
        {
          caseId:
            getCaseId(),

          responseLength:
            aiText.length,

          duration,

          success: true,

          contextMode:
            res.data.contextMode
        }
      );

      log("AI", aiText);

      typeMessage(
        aiText,
        "ai"
      );

      // addMessage(
      //   "⚙️ Context Mode: " +
      //     res.data.contextMode,
      //   "system"
      // );
    }
  );
}

/* ---------- LOAD ---------- */

async function loadSavedChat() {

  const caseId =
    getCaseId();

  if (!caseId) {
    return;
  }

  /* -------------------------------- */
  /* STEP 1: INSTANT CACHE RENDER    */
  /* -------------------------------- */

  const cached =
    await loadRecentCache();

  if (
    cached &&
    Array.isArray(
      cached.messages
    )
  ) {

    while (
      chatContainer.firstChild
    ) {
      chatContainer.removeChild(
        chatContainer.firstChild
      );
    }

    cached.messages.forEach(m => {
      const role = m.role === "assistant" ? "ai" : m.role;
      const content = m.role === "user" ? resolveDisplayLabel(m.content) : m.content;

      addMessage(content, role);
    });

    scrollToBottom();

    log(
      "CACHE",
      "Rendered local cache"
    );
  }

  /* -------------------------------- */
  /* STEP 2: BACKGROUND REVALIDATE   */
  /* -------------------------------- */

  chrome.runtime.sendMessage(
    {
      type:
        "LOAD_RECENT_MESSAGES",

      caseId
    },

    (res) => {

      if (
        !res ||
        !res.success
      ) {

        console.error(
          "Failed loading messages"
        );

        return;
      }

      const messages =
        res.data.messages || [];

      /* ---------- SAVE CACHE ---------- */

      saveRecentCache({
        messages,

        latestResponseId:
          res.data
            .latestResponseId
      });

      /* ---------- RE-RENDER ---------- */

      while (
        chatContainer.firstChild
      ) {
        chatContainer.removeChild(
          chatContainer.firstChild
        );
      }

      messages.forEach(m => {
        const role = m.role === "assistant" ? "ai" : m.role;
        const content = m.role === "user" ? resolveDisplayLabel(m.content) : m.content;

        addMessage(content, role);
      });

      scrollToBottom();

      log(
        "CACHE",
        "Background sync complete"
      );
    }
  );
}

/* ---------- INIT ---------- */

function init() {
  createUI();

  createButton();

  setInterval(() => {
    chrome.runtime.sendMessage({ type: "PING" }).catch(() => {});
  }, 20000);

  

  /* ---------- PAGE CHANGE DETECTION ---------- */


  let lastUrl = location.href;

  let navTimeout;

  const observer = new MutationObserver(() => {

    clearTimeout(navTimeout);

    navTimeout = setTimeout(() => {

      if (location.href !== lastUrl) {

        lastUrl = location.href;

        log("NAV", "Page changed");

        updatePrimaryButton();

        loadSavedChat();

        window.Analytics?.track(
          "orbit.case.changed",
          {
            caseId: getCaseId(),
            url: location.href
          }
        );
      }
      updatePrimaryButton();

    }, 300);

  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function createButton() {
  const btn = document.createElement("div");

  btn.id = "ai-btn";
  btn.textContent = "⚡";

  btn.onclick = function () {
    const open =
      panel.style.display === "flex";


    /* ---------- DYNAMIC PANEL POSITION ---------- */

    const rect =
      btn.getBoundingClientRect();

    const viewportWidth =
      window.innerWidth;

    const viewportHeight =
      window.innerHeight;

    /* ---------- HORIZONTAL ---------- */

    const openLeft =
      rect.left >
      viewportWidth / 2;

    if (openLeft) {

      panel.style.right =
        (
          viewportWidth -
          rect.right
        ) + "px";

      panel.style.left =
        "auto";

    } else {

      panel.style.left =
        rect.left + "px";

      panel.style.right =
        "auto";
    }

    /* ---------- VERTICAL ---------- */

    const openUp =
      rect.top >
      viewportHeight / 2;

    if (openUp) {

      panel.style.bottom =
        (
          viewportHeight -
          rect.top +
          10
        ) + "px";

      panel.style.top =
        "auto";

    } else {

      panel.style.top =
        (
          rect.bottom +
          10
        ) + "px";

      panel.style.bottom =
        "auto";
    }
    panel.style.display = open
      ? "none"
      : "flex";

    Analytics.track("orbit.panel.toggle", {
      state: open ? "closed" : "opened",
      caseId: getCaseId()
    });

    // CLOSE MENU
    const menu =
      document.getElementById("ai-menu");

    if (menu) {
      menu.style.display = "none";
    }

    if (!open) {
      updatePrimaryButton();
      const isLoading = !!chatContainer.querySelector(".processing-msg");
      if (!isLoading) {
        loadSavedChat();
      }
      refreshAuthButton();
    }
  };

  document.body.appendChild(btn);

  /* ---------- DRAGGABLE ---------- */

  let isDragging = false;

  let dragOffsetX = 0;
  let dragOffsetY = 0;

  btn.addEventListener(
    "mousedown",

    function (e) {

      isDragging = true;

      dragOffsetX =
        e.clientX -
        btn.getBoundingClientRect().left;

      dragOffsetY =
        e.clientY -
        btn.getBoundingClientRect().top;

      btn.style.transition =
        "none";
    }
  );

  document.addEventListener(
    "mousemove",

    function (e) {

      if (!isDragging) {
        return;
      }

      const left =
        e.clientX - dragOffsetX;

      const top =
        e.clientY - dragOffsetY;

      btn.style.left =
        left + "px";

      btn.style.top =
        top + "px";

      btn.style.right =
        "auto";

      btn.style.bottom =
        "auto";
    }
  );

  document.addEventListener(
    "mouseup",

    function () {

      isDragging = false;

      btn.style.transition =
        "";
    }
  );
}

function waitForCaseAndBoot() {

  const interval =
    setInterval(() => {

      const caseId =
        getCaseId();

      if (!caseId) {
        return;
      }

      clearInterval(interval);

      log(
        "INIT",
        "Case detected:",
        caseId
      );

      init();

    }, 1000);
}

if (
  document.readyState !==
  "loading"
) {

  waitForCaseAndBoot();

} else {

  document.addEventListener(
    "DOMContentLoaded",
    waitForCaseAndBoot
  );
}
