"use strict";

// Declarative Net Request (DNR) rules for Chrome's Manifest V3.
// This file is loaded by both the options page and the background service worker.
// No search queries are read by extension JavaScript: Chrome evaluates the rules.
const AiModeRules = (() => {
  const DEFAULTS = Object.freeze({trigger: "?", position: "suffix", removeTrigger: false});
  const SEARCH = String.raw`^https://(?:www\.)?google\.com/search\?`;
  const Q_PREFIX = `${SEARCH}(?:[^#]*&)?q=`;
  const WS = String.raw`(?:\+|%20)*`;
  const SUFFIX = String.raw`(?:&|#|$)`;

  function normalized(settings) {
    const input = settings && typeof settings === "object" ? settings : {};
    return {
      trigger: typeof input.trigger === "string" && input.trigger.trim() &&
        input.trigger.trim().length <= 64 ? input.trigger.trim() : DEFAULTS.trigger,
      position: ["prefix", "suffix", "anywhere"].includes(input.position)
        ? input.position : DEFAULTS.position,
      removeTrigger: input.removeTrigger === true
    };
  }

  // Chrome's DNR regexFilter is ASCII-only, matched against the encoded URL.
  // Match common percent-encoded and literal forms of each trigger character.
  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function triggerPattern(trigger) {
    return Array.from(trigger, (character) => {
      if (character === " ") return String.raw`(?:\+|%20)`;
      const encoded = new URLSearchParams({q: character}).toString().slice(2);
      // Raw '+' means a space in a query; raw '&' and '#' delimit parts of URL.
      const rawIsSafe = character !== "+" && character !== "&" &&
        character !== "#" && /^[\x21-\x7e]$/.test(character);
      if (rawIsSafe && encoded.toLowerCase() !== character.toLowerCase()) {
        return `(?:${escapeRe(encoded)}|${escapeRe(character)})`;
      }
      return escapeRe(encoded);
    }).join("");
  }

  function createRules(settings) {
    const config = normalized(settings);
    const token = triggerPattern(config.trigger);
    // High-priority allow rule preserves an explicitly chosen Google tab
    // (e.g. Images, Videos, Web, AI Mode) and prevents redirect loops.
    const rules = [{
      id: 1, priority: 10,
      action: {type: "allow"},
      condition: {
        regexFilter: `${SEARCH}(?:[^#]*&)?(?:udm|tbm)=`,
        resourceTypes: ["main_frame"]
      }
    }];

    let pattern;
    let action;
    if (!config.removeTrigger) {
      if (config.position === "prefix") {
        pattern = `${Q_PREFIX}${WS}${token}`;
      } else if (config.position === "suffix") {
        pattern = `${Q_PREFIX}[^&#]*${token}${WS}${SUFFIX}`;
      } else {
        pattern = `${Q_PREFIX}[^&#]*${token}`;
      }
      action = {
        type: "redirect",
        redirect: {transform: {queryTransform: {addOrReplaceParams: [{key: "udm", value: "50"}]}}}
      };
    } else {
      // Captures: 1 = URL through q=, 2/3 = remaining query text,
      // 3/4 = other parameters, 4/5 = fragment.
      // Using substitution updates q and appends udm=50 in a single redirect.
      const start = `(${Q_PREFIX})`;
      const tail = String.raw`(&[^#]*)?(#.*)?$`;
      if (config.position === "prefix") {
        pattern = `${start}${WS}${token}${WS}([^&#]+?)${tail}`;
        action = {type: "redirect", redirect: {regexSubstitution: String.raw`\1\2\3&udm=50\4`}};
      } else if (config.position === "suffix") {
        pattern = `${start}([^&#]+?)${WS}${token}${WS}${tail}`;
        action = {type: "redirect", redirect: {regexSubstitution: String.raw`\1\2\3&udm=50\4`}};
      } else {
        pattern = `${start}([^&#]*?)${token}([^&#]*?)${tail}`;
        action = {type: "redirect", redirect: {regexSubstitution: String.raw`\1\2\3\4&udm=50\5`}};
      }
      // With removal enabled, a trigger-only query should not go to AI Mode.
      rules.push({
        id: 3, priority: 9,
        action: {type: "allow"},
        condition: {
          regexFilter: `${Q_PREFIX}${WS}${token}${WS}${SUFFIX}`,
          resourceTypes: ["main_frame"]
        }
      });
    }

    rules.push({
      id: 2, priority: 1, action,
      condition: {regexFilter: pattern, resourceTypes: ["main_frame"]}
    });
    return rules;
  }

  return {DEFAULTS, normalized, triggerPattern, createRules};
})();
