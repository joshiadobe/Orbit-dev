# Volt ⚡

Volt is an AI-powered Chrome extension for Adobe support engineers. It sits alongside Dynamics 365 CRM cases and gives you one-click AI assistance — first response drafts, summaries, JIRA lookups, escalation notes, and more — without leaving the case.

---

## Prerequisites

Before installing, you must be a member of the **GRP-ORBITEXTENSION** IAM group. Request access through the standard IAM self-service portal if you are not already subscribed.

[Request Access →](#)

---

## Getting Started

### Installation

Volt is a Chrome extension loaded in developer mode.

[Download Volt ⚡](#)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked** and select the Volt folder
4. The ⚡ button will appear on supported pages
5. Copy your **Extension ID** (shown under the Volt card on `chrome://extensions`) and share it with [abjoshi@adobe.com](mailto:abjoshi@adobe.com) to get activated

### Supported Pages

Volt activates automatically on Adobe Dynamics CRM case pages:

- `https://adobe-ent.crm.dynamics.com/*`

---

## Signing In

Volt uses your Adobe Okta account. You only need to sign in once — it auto-renews in the background.

1. Open any Dynamics case
2. Click the **⚡** floating button to open the panel
3. Click **Sign In** in the panel header
4. Complete your Adobe Okta login in the popup that appears
5. Your name will appear in the Sign In button confirming you are authenticated

> If sign-in fails with a network error or you see repeated okta login attemps, connect to **Adobe VPN** and try again.

### Automatic Sign-In

Volt manages your session silently so you rarely need to sign in manually. Here is what happens under the hood:

- When you trigger any action (button click or chat message), Volt checks whether your token is still valid
- If the token has expired, Volt automatically attempts a **silent refresh** in the background using your refresh token — no popup, no interruption
- If the silent refresh also fails (e.g. your refresh token has expired or you are off VPN), Volt will automatically open the **Okta login popup** so you can re-authenticate and continue without losing your request
- Once re-authenticated, your session renews and future requests proceed normally

> You do not need to manually click Sign In during normal use. The automatic popup only appears when your full session has expired and a silent refresh is not possible.

---

## AI Status Dot

A small dot next to **Volt ⚡** in the panel header shows the current health of the Azure OpenAI backend, updated every 2 minutes. A small **i** button on the right of the title row shows a quick help tip on hover or click.

| Colour | Meaning |
|---|---|
| 🟢 Green | Azure OpenAI operational |
| 🟡 Yellow | High latency or warning detected |
| 🔴 Red | Active outage detected |

Hover over the dot for a one-line status message.

---

## Opening and Moving the Panel

- **Click ⚡** to open or close the Volt panel
- The panel automatically positions itself so it does not overlap the button or fall off-screen
- **Drag the ⚡ button** anywhere on the page to reposition it

---

## Primary Actions

When you open a case, the primary button at the top of the panel changes based on the case state:

| Page state | Button label | What it does |
|---|---|---|
| Case has timeline activity | **Summarise** | 250-word bullet-point summary of the full ticket |
| Case description only | **Draft First Response** | Empathetic first response you can send directly to the customer — acknowledges the issue, restates it back to the customer, and asks them to approve the impersonation request |

Click the button and the response appears in the chat.

---

## Menu Actions

Click **⋯** in the panel header to open the action menu. These actions work on the current case and do not need you to type anything.

| Action | What it produces |
|---|---|
| **Executive Summary** | 5-point summary formatted for leadership |
| **Find Relevant JIRA** | Relevant JIRA tickets (open ones first), with status, similarity explanation, and a summary table |
| **Similar Cases** | Cases similar to this one with a one-liner explanation and clickable Dynamics links |
| **Next Steps** | Investigation steps plus the latest activity from the Dynamics payload |
| **Close Escalation** | Issue Summary, Customer Impact, Root Cause, and Corrective Action in past-tense imperative (for escalation closure) |
| **FTS Notes** | Handoff notes under 100 words: Org name, Case ID, issue, and next steps — ready to share with the next-geo engineer |
| **Case Closure** | Customer-facing resolution summary under 100 words in past-tense imperative |

---

## Follow-up Chat

After any AI response you can keep the conversation going using the text input at the bottom of the panel.

- Press **Enter** to send
- Press **Shift + Enter** for a new line in your message
- Volt remembers the context of the current case — you do not need to re-explain it
- Each sent message has a **↺ retry icon** — click it to resend that exact prompt if the backend did not respond

### Attaching Files

Click the **📎** button next to the input to attach files, or paste an image directly from your clipboard.

- Maximum **20 MB** per file
- Maximum **30 MB** total across all attachments in one message
- Images show a thumbnail preview; other files show the file name
- Click **✕** on a chip to remove an attachment before sending

---

## Copying Responses

Every AI response has a **Copy** button. It copies the content as rich HTML (preserving tables, headings, and formatting) so it pastes cleanly into emails or Dynamics notes. Plain text is also copied as a fallback.

---

## Managing the Chat

| Button | Action |
|---|---|
| **Clear** | Removes all messages from the panel (does not delete server history) |
| **New Chat** | Clears the current panel view to start fresh |
| **Expand / Collapse** | Toggles the panel between compact (360 × 480 px) and wide (700 px × 80 vh) |

### Chat History

Volt automatically loads your previous conversation for a case when you open it. When you switch to a different case the chat reloads for that case. Each case keeps its own separate history.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Sign In fails | Connect to Adobe VPN, then try again |
| AI request fails with a network error | Connect to Adobe VPN |
| Panel does not appear | Check that you are on a supported Dynamics page (`adobe-ent.crm.dynamics.com`) |
| "No case content found" warning | Make sure the case description textarea is visible and populated before clicking a primary action |
| Extension not loading | Go to `chrome://extensions`, find Volt, and click the refresh icon |

---

## Version

**v1.0** — Production build targeting `https://orbit.corp.adobe.com`