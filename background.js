"use strict";

// Firefox-only extension: redirects top-level Google Search navigations
// before the normal Google results page loads. It never sends requests itself.
const DEFAULT_SETTINGS = Object.freeze({
  trigger: "?",
  position: "suffix",
  removeTrigger: false
});

const VALID_POSITIONS = new Set(["prefix", "suffix", "anywhere"]);

function normalizeSettings(settings) {
  const input = settings && typeof settings === "object" ? settings : {};
  const trigger = typeof input.trigger === "string" &&
    input.trigger.trim().length > 0 && input.trigger.length <= 64
    ? input.trigger.trim()
    : DEFAULT_SETTINGS.trigger;

  return {
    trigger,
    position: VALID_POSITIONS.has(input.position)
      ? input.position
      : DEFAULT_SETTINGS.position,
    removeTrigger: input.removeTrigger === true
  };
}

// Returns the starting index of the trigger in the ORIGINAL query, or -1.
// Spaces surrounding the whole search query don't affect prefix/suffix matches.
function findTrigger(query, settings) {
  const trimmed = query.trim();
  if (!trimmed) return -1;

  const offset = query.length - query.trimStart().length;
  const haystack = trimmed.toLowerCase();
  const needle = settings.trigger.toLowerCase();

  let index = -1;
  if (settings.position === "prefix" && haystack.startsWith(needle)) {
    index = 0;
  } else if (settings.position === "suffix" && haystack.endsWith(needle)) {
    index = haystack.length - needle.length;
  } else if (settings.position === "anywhere") {
    index = haystack.indexOf(needle);
  }
  return index < 0 ? -1 : offset + index;
}

function removeTriggerOnce(query, index, length) {
  const left = query.slice(0, index);
  let right = query.slice(index + length);
  // Joining "something [trigger] else" should yield "something else".
  if (/\s$/.test(left) && /^\s/.test(right)) {
    right = right.replace(/^\s+/, "");
  }
  return (left + right).trim();
}

function aiModeUrlIfMatched(rawUrl, settings) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    !["www.google.com", "google.com"].includes(url.hostname) ||
    url.pathname !== "/search"
  ) {
    return null;
  }

  // Never override an explicit Google AI/search tab. Allow "Web" (udm=14)
  // to switch to AI Mode when the user's trigger is present.
  const currentMode = url.searchParams.get("udm");
  if ((currentMode && currentMode !== "14") || url.searchParams.has("tbm")) {
    return null;
  }

  const query = url.searchParams.get("q");
  if (!query) return null;

  const config = normalizeSettings(settings);
  const index = findTrigger(query, config);
  if (index === -1) return null;

  if (config.removeTrigger) {
    const cleaned = removeTriggerOnce(query, index, config.trigger.length);
    if (!cleaned) return null; // Don't navigate to an empty search.
    url.searchParams.set("q", cleaned);
  }

  // Changing only udm=50 preserves the query and any other Google parameters.
  // Subsequent redirects are prevented by the existing udm check above.
  url.searchParams.set("udm", "50");
  return url.href;
}

let currentSettings = DEFAULT_SETTINGS;
let settingsReady = false;

// Read from local Firefox storage once; regular searches then use cached
// settings synchronously. Only an exceptionally early request awaits startup.
const initialLoad = browser.storage.local.get(DEFAULT_SETTINGS)
  .then((stored) => {
    currentSettings = normalizeSettings(stored);
  })
  .catch((error) => {
    console.warn("Use Google AI Mode?: using defaults", error);
  })
  .finally(() => {
    settingsReady = true;
  });

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  const updated = { ...currentSettings };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (Object.prototype.hasOwnProperty.call(changes, key)) {
      updated[key] = changes[key].newValue;
    }
  }
  currentSettings = normalizeSettings(updated);
});

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    const decide = () => {
      const redirectUrl = aiModeUrlIfMatched(details.url, currentSettings);
      return redirectUrl ? { redirectUrl } : {};
    };
    return settingsReady ? decide() : initialLoad.then(decide);
  },
  {
    urls: ["https://www.google.com/search*", "https://google.com/search*"],
    types: ["main_frame"]
  },
  ["blocking"]
);
