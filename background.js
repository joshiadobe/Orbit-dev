chrome.runtime.onMessage.addListener(handleRuntimeMessage);

function handleRuntimeMessage(request, sender, sendResponse) {
  if (!request || !request.type) {
    return;
  }

  if (request.type === "GET_TAB_ID") {
    sendTabIdResponse(sender, sendResponse);
    return;
  }

  if (request.type === "AI_CALL") {
    handleAICallRequest(request, sendResponse);
    return true;
  }
}

function sendTabIdResponse(sender, sendResponse) {
  var tabId = null;

  if (sender && sender.tab && typeof sender.tab.id === "number") {
    tabId = sender.tab.id;
  }

  sendResponse({ tabId: tabId });
}

async function handleAICallRequest(request, sendResponse) {
  try {
    var response = await fetch("http://10.51.242.50:3000/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: request.prompt,
        previousResponseId: request.previousResponseId || null,
        history: Array.isArray(request.history) ? request.history : [],
        fresh: Boolean(request.fresh)
      })
    });

    var data = await response.json();

    if (!response.ok) {
      sendResponse({
        success: false,
        error: data && data.error ? data.error : "Backend request failed"
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
      error: err && err.message ? err.message : "Unknown background error"
    });
  }
}