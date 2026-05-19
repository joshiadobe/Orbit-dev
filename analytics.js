const DATASTREAM_ID =
  "783dc2f0-c852-4804-a43f-581b69986af7";

const EDGE_URL =
  `https://edge.adobedc.net/ee/v2/interact?datastreamId=${DATASTREAM_ID}`;

/* ------------------------------------------------ */
/* DEBUG                                            */
/* ------------------------------------------------ */

const ANALYTICS_DEBUG = true;

function analyticsLog(...args) {

  if (!ANALYTICS_DEBUG) return;

  console.log(
    "%c[Orbit Analytics]",
    "color:#ff9800;font-weight:bold;",
    ...args
  );
}

/* ------------------------------------------------ */
/* HELPERS                                          */
/* ------------------------------------------------ */

function getEngineerName() {

  try {

    return [...document.querySelectorAll("div")]
      .find(
        el =>
          el.textContent.trim() ===
          "Support Engineer"
      )
      ?.closest('[data-preview_orientation="column"]')
      ?.querySelector("a")
      ?.innerText
      ?.trim() || "unknown";

  } catch {

    return "unknown";
  }
}

function getViewport() {

  return {
    viewportWidth:
      window.innerWidth || 0,

    viewportHeight:
      window.innerHeight || 0
  };
}

function getOrientation() {

  try {

    return (
      window.screen.orientation?.type ||
      "unknown"
    );

  } catch {

    return "unknown";
  }
}

/* ------------------------------------------------ */
/* TRACK EVENT                                      */
/* ------------------------------------------------ */

async function track(
  eventName,
  payload = {}
) {

  const body = {

    event: {

      xdm: {

        /* ---------- EVENT ---------- */

        eventType:
          "web.webpagedetails.pageViews",

        timestamp:
          new Date().toISOString(),

        /* ---------- WEB ---------- */

        web: {

          webPageDetails: {

            URL:
              location.href,

            name:
              document.title,

            pageViews: {
              value: 1
            }
          },

          webReferrer: {

            URL:
              document.referrer || ""
          }
        },

        /* ---------- DEVICE ---------- */

        device: {

          screenHeight:
            window.screen.height,

          screenWidth:
            window.screen.width,

          screenOrientation:
            getOrientation()
        },

        /* ---------- ENVIRONMENT ---------- */

        environment: {

          type: "browser",

          browserDetails: {
            ...getViewport()
          }
        },

        /* ---------- PLACE ---------- */

        placeContext: {

          localTimezoneOffset:
            new Date().getTimezoneOffset(),

          localTime:
            new Date().toISOString()
        },

        /* ---------- IMPLEMENTATION ---------- */

        // implementationDetails: {

        //   name:
        //     "Orbit Chrome Extension",

        //   version:
        //     chrome.runtime.getManifest().version,

        //   environment:
        //     "browser_extension"
        // },

        /* ---------- ADOBE ANALYTICS ---------- */

        _experience: {

          analytics: {

            customDimensions: {

              props: {

                prop1:
                  payload.caseId || "",

                prop2:
                  eventName || "",

                prop3:
                  payload.buttonName || "",

                prop4:
                  payload.promptType || "",

                prop5:
                  payload.contextMode || "",

                prop6:
                  String(
                    payload.duration || ""
                  ),

                prop7:
                  String(
                    payload.success || ""
                  ),

                prop8:
                  payload.error || ""
              },

              eVars: {

                eVar1:
                  payload.caseId || "",

                eVar2:
                  getEngineerName(),

                eVar3:
                  eventName || "",

                eVar4:
                  chrome.runtime.getManifest().version
              }
            }
          }
        }
      }
    }
  };

  try {

    analyticsLog(
      "Sending Event:",
      eventName
    );

    analyticsLog(
      "Payload:",
      JSON.stringify(body, null, 2)
    );

    const response = await fetch(
      EDGE_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(body)
      }
    );

    analyticsLog(
      "Status:",
      response.status
    );

    const responseText =
      await response.text();

    analyticsLog(
      "Response:",
      responseText
    );

    return response;

  } catch (err) {

    console.error(
      "[Orbit Analytics Error]",
      err
    );
  }
}

/* ------------------------------------------------ */
/* EXPORT                                           */
/* ------------------------------------------------ */

window.Analytics = {
  track
};