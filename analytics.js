const DATASTREAM_ID = "783dc2f0-c852-4804-a43f-581b69986af7";

const EDGE_URL =
  `https://edge.adobedc.net/ee/v2/interact?datastreamId=${DATASTREAM_ID}`;

function getCaseId() {
  try {
    return [...document.querySelectorAll("div")]
      .find(el => el.textContent.trim() === "Case ID")
      ?.closest('[data-preview_orientation="column"]')
      ?.querySelector("div div div")
      ?.innerText.trim();
  } catch {
    return "";
  }
}

function getEngineer() {
  try {
    return window?.Xrm
      ?.Utility
      ?.getGlobalContext()
      ?.userSettings
      ?.userName || "unknown";
  } catch {
    return "unknown";
  }
}

async function track(eventType, data = {}) {

  const body = {
    events: [
      {
        xdm: {

          eventType,

          timestamp: new Date().toISOString(),

          web: {
            webPageDetails: {
              URL: location.href,
              name: document.title
            }
          },

          device: {
            screenWidth: screen.width,
            screenHeight: screen.height
          },

          _experience: {
            analytics: {
              customDimensions: {

                props: {
                  prop6: getCaseId(),
                  prop7: getEngineer(),
                  prop8: data.buttonName || "",
                  prop9: data.action || "",
                  prop10: data.contextMode || "",
                  
                },

                // eVars: {
                //   eVar1: getCaseId(),
                //   eVar2: getEngineer(),
                //   eVar3: "Orbit Extension"
                // }
              }
            }
          }
        }
      }
    ]
  };

  try {

    await fetch(EDGE_URL, {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify(body)
    });

    console.log("[Analytics Sent]", body);

  } catch (err) {
    console.error("[Analytics Error]", err);
  }
}

window.Analytics = {
  track
};