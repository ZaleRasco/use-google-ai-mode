"use strict";
importScripts("rules.js");

// Dynamic DNR rules are persisted by Chrome, so searches don't need to wake
// this service worker. The worker only runs on install/startup/settings changes.
let updateQueue = Promise.resolve();

function synchronizeRules() {
  updateQueue = updateQueue.catch(() => {}).then(async () => {
    const stored = await chrome.storage.local.get(AiModeRules.DEFAULTS);
    const rules = AiModeRules.createRules(stored);

    for (const rule of rules) {
      const result = await chrome.declarativeNetRequest.isRegexSupported({
        regex: rule.condition.regexFilter,
        isCaseSensitive: false,
        requireCapturing: rule.action.redirect?.regexSubstitution !== undefined
      });
      if (!result.isSupported) throw new Error(`Unsupported trigger rule: ${result.reason || "unknown reason"}`);
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1, 2, 3],
      addRules: rules
    });
  });
  updateQueue.catch(error => console.error("Use Google AI Mode? could not update rules:", error));
  return updateQueue;
}

chrome.runtime.onInstalled.addListener(() => { void synchronizeRules(); });
chrome.runtime.onStartup.addListener(() => { void synchronizeRules(); });
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (Object.keys(AiModeRules.DEFAULTS).some(key => Object.hasOwn(changes, key))) {
    void synchronizeRules();
  }
});
