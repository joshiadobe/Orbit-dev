const DEBUG = true;
const ENFORCE_NO_BOLD = false;

const PROCESSING_MESSAGES = [
  "⏳ Please wait while the minions do their work",
  "🛠️ Grabbing extra minions",
  "💪 Doing the heavy lifting",
  "😴 Waking up the minions",
  "📞 You are number 2843684714 in the queue",
  "💸 Our premium plan is faster"
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

let TAB_ID = null;
let panel;
let chatContainer;
let primaryBtn;
let expanded = false;

/* ---------- TAB ---------- */

chrome.runtime.sendMessage({ type: "GET_TAB_ID" }, (res) => {
  TAB_ID = res?.tabId;
  log("INIT", "TAB_ID:", TAB_ID);
});

/* ---------- STORAGE ---------- */

function getPageKey() {
  const match = location.href.match(/id=([^&]+)/);
  return match ? match[1] : location.href;
}

function getStorageKey() {
  const caseId = getCaseId();

  if (caseId) {
    return "case::" + caseId;
  }

  return "page::" + getPageKey();
}
function saveMessages(messages, responseId) {
  chrome.storage.local.get(["responses"], (data) => {
    const responses = data.responses || {};
    responses[getStorageKey()] = { messages, responseId };
    chrome.storage.local.set({ responses });
    log("STORAGE", "Saved", responses[getStorageKey()]);
  });
}

function loadMessages(cb) {
  chrome.storage.local.get(["responses"], (data) => {
    const entry = data.responses?.[getStorageKey()];
    log("STORAGE", "Loaded", entry);
    cb(entry);
  });
}

/* ---------- SCROLL ---------- */

function scrollToBottom() {
  if (!chatContainer) return;

  setTimeout(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }, 0);
}

/* ---------- HELPERS ---------- */

function getTextarea() {
  return document.querySelector("textarea");
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
        "Summarize the case timeline using clean markdown formatting. Use headings, bullet points, and valid markdown tables. Do not insert blank lines inside tables.\n\n"
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
  const action = getPrimaryAction();


  const text = getRelevantText();


  if (!text) {
    addMessage("⚠️ No case content found.", "system");
    return;
  }

  const prompt = buildFinalPrompt(action.prompt, text);

  addMessage("⚡ " + action.label, "system");

  sendToAI(prompt, true);
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
  title.textContent = "Orbit 🪐";

  const actions = document.createElement("div");

  primaryBtn = document.createElement("button");

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
    "Ask Orbit anything about this case...";

  input.rows = 1;

  input.id = "ai-input";

  const sendBtn = document.createElement("button");
  sendBtn.textContent = "Send";

  inputBox.append(input, sendBtn);

  panel.append(header, chatContainer, inputBox);

  document.body.appendChild(panel);

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

  const AI_ACTIONS = [
    {
      label: "Executive Summary",
      prompt: "Provide executive summary in markdown.\n\n"
    },
    {
      label: "Find Relevant JIRA",
      prompt: "Suggest relevant JIRA.\n\n"
    },
    {
      label: "Similar Cases",
      prompt: "Find similar dynamic cases with 1 liner explnination why they fit and provide the exact adobe-ent.crm.dynamics.com link for every case and make sure link are clickable.\n\n"
    },
    {
      label: "Next Steps",
      prompt: "Provide next steps to investigate the case. from the payload that you have got for this case from dynamics in that object there would be an key with the name  activities from this key's value array show me the last object only out of the complete payload and its heading should be 'Disclamer! Latest response from Dynamic' and and provide the exact adobe-ent.crm.dynamics.com link in source\n\n"
    },
    {
      label: "Close Escalation",
      prompt: "give me 1 liner each point for this case Issue Summary Customer Impact Root Cause Corrective Action in past tense imperative\n\n"
    },
    {
      label: "FTS Notes",
      prompt: "perpare FTS notes in less than 100 words so it can be shared with next geo engineer who will work on this case \n\n"
    },
    {
      label: "Case Closuer",
      prompt: "Skim thorugh the complete ticket and Please provide details about case resolution, this will be customer facing in less then 100 words make a final response that can be shared with client in past tense imparative \n\n"
    }
  ];

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

        addMessage(action.label, "system");

        sendToAI(prompt);

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

  primaryBtn.onclick = handlePrimaryClick;

  clearBtn.onclick = function () {
    chatContainer.innerHTML = "";

    loadMessages(entry => {
      saveMessages([], entry?.responseId || null);
    });
  };

  newChatBtn.onclick = function () {
    chatContainer.innerHTML = "";
    saveMessages([], null);
  };

  resizeBtn.onclick = function () {
    expanded = !expanded;

    panel.classList.toggle("expanded");

    resizeBtn.textContent = expanded
      ? "Collapse"
      : "Expand";
  };

  sendBtn.onclick = function () {
    handleSend(input);
  };

  input.addEventListener("input", () => {
  input.style.height = "auto";

  input.style.height =
    Math.min(input.scrollHeight, 160) + "px";
});

  input.addEventListener("keydown", function (e) {

  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();

    handleSend(input);
  }

});
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
    text.split("\n").forEach(line => {
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

    scrollToBottom();

    if (index >= text.length) {
      clearInterval(interval);

      // add copy button after typing completes
      if (role === "ai") {
        const copyBtn = document.createElement("button");

        copyBtn.className = "ai-copy-btn";
        copyBtn.textContent = "Copy";

        copyBtn.onclick = async () => {
          try {
            await navigator.clipboard.writeText(text);

            copyBtn.textContent = "Copied!";

            setTimeout(() => {
              copyBtn.textContent = "Copy";
            }, 1500);

          } catch (err) {
            console.error(err);
          }
        };

        wrapper.appendChild(copyBtn);
      }
    }
  }, speed);
}
/* ---------- SEND ---------- */

function handleSend(input) {
  const text = input.value.trim();

  if (!text) return;

  input.value = "";

  const prompt = buildFinalPrompt("", text);

  addMessage(text, "user");

  sendToAI(prompt);
}

/* ---------- AI ---------- */

function sendToAI(prompt, forceFresh) {
  const loading = document.createElement("div");

  loading.className = "ai-msg processing-msg";

  const baseMessage =
    getRandomProcessingMessage();

  let dots = 0;

  loading.textContent = baseMessage;

  const dotsInterval = setInterval(() => {
    dots = (dots + 1) % 4;

    loading.textContent =
      baseMessage + ".".repeat(dots);

  }, 500);

  chatContainer.appendChild(loading);

  scrollToBottom();

  loadMessages(entry => {
    const messages = entry?.messages || [];

    const previousResponseId =
      entry?.responseId || null;

    let fresh;

    if (forceFresh === true) {
      fresh = true;
      log("CTX", "Forced fresh");
    } else if (previousResponseId) {
      fresh = false;
      log("CTX", "Thread");
    } else if (messages.length > 0) {
      fresh = false;
      log("CTX", "History fallback");
    } else {
      fresh = true;
      log("CTX", "Fresh");
    }

    chrome.runtime.sendMessage(
      {
        type: "AI_CALL",
        prompt,
        fresh,
        previousResponseId,
        history: messages
      },
      res => {
        clearInterval(dotsInterval);
        loading.remove();

        scrollToBottom();

        if (!res || !res.success) {
          addMessage("❌ Error");
          return;
        }

        const aiText = res.data.text;
        log("AI", aiText);

        typeMessage(aiText, "ai");

        addMessage(
          "⚙️ Context Mode: " +
          res.data.contextMode,
          "system"
        );

        const updated = messages.concat([
          {
            role: "user",
            content: prompt
          },
          {
            role: "assistant",
            content: aiText
          }
        ]);

        saveMessages(
          updated,
          res.data.responseId
        );
      }
    );
  });
}

/* ---------- LOAD ---------- */

function loadSavedChat() {
  loadMessages(entry => {
    chatContainer.innerHTML = "";

    if (entry?.messages) {
      entry.messages.forEach(m => {
        addMessage(
          m.content,
          m.role === "assistant"
            ? "ai"
            : m.role
        );
      });
    }
  });
}

/* ---------- INIT ---------- */

/* ---------- INIT ---------- */

function init() {
  createUI();

  createButton();

  updatePrimaryButton();

  /* ---------- PAGE CHANGE DETECTION ---------- */

  let lastUrl = location.href;

  const observer = new MutationObserver(() => {

    if (location.href !== lastUrl) {

      lastUrl = location.href;

      log("NAV", "Page changed");

      updatePrimaryButton();

      loadSavedChat();
    }

  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function createButton() {
  const btn = document.createElement("div");

  btn.id = "ai-btn";
  btn.textContent = "🪐";

  btn.onclick = function () {
    const open =
      panel.style.display === "flex";

    panel.style.display = open
      ? "none"
      : "flex";

    // CLOSE MENU
    const menu =
      document.getElementById("ai-menu");

    if (menu) {
      menu.style.display = "none";
    }

    if (!open) {
      updatePrimaryButton();
      loadSavedChat();
    }
  };

  document.body.appendChild(btn);
}

if (document.readyState !== "loading") {
  init();
} else {
  document.addEventListener(
    "DOMContentLoaded",
    init
  );
}