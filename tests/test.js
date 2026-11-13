"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, "1.1.2");
assert.equal(manifest.name, "Use Google AI Mode?");
assert.deepEqual(manifest.permissions, ["webRequest", "webRequestBlocking", "storage"]);
assert.deepEqual(manifest.host_permissions, ["https://www.google.com/*", "https://google.com/*"]);
assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required, ["none"]);
assert.equal(manifest.browser_specific_settings.gecko.id, "google-question-ai-mode@local.example", "Keep the original extension ID");
assert.equal(manifest.options_ui.page, "options/options.html");
for (const file of [
  manifest.background.scripts[0], manifest.options_ui.page,
  "options/options.js", "options/options.css", "icons/icon-48.png", "icons/icon-96.png", "icons/icon-128.png"
]) assert.ok(fs.statSync(path.join(root, file)).size > 0, `File must exist: ${file}`);

function makeEnv(saved = {}) {
  let requestListener;
  let storageListener;
  let getCount = 0;
  let releaseStartup;
  let failStartup = false;
  const pending = new Promise((resolve) => { releaseStartup = resolve; });
  const browser = {
    storage: {
      local: {
        get: async (defaults) => {
          ++getCount;
          await pending;
          if (failStartup) throw new Error("Simulated local-storage failure");
          return { ...defaults, ...saved };
        }
      },
      onChanged: {
        addListener(fn) { storageListener = fn; }
      }
    },
    webRequest: {
      onBeforeRequest: {
        addListener(fn, filter, extraInfoSpec) {
          requestListener = fn;
          assert.deepEqual(Array.from(filter.types), ["main_frame"]);
          assert.deepEqual(Array.from(extraInfoSpec), ["blocking"]);
          assert.deepEqual(Array.from(filter.urls), ["https://www.google.com/search*", "https://google.com/search*"]);
        }
      }
    }
  };
  const sandbox = {browser, URL, console};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "background.js"), "utf8"), sandbox);
  return {
    sandbox,
    response(url) { return requestListener({url, type:"main_frame"}); },
    resolveStartup() { releaseStartup(); },
    failStartup() { failStartup = true; releaseStartup(); },
    getCount() {return getCount;},
    update(partial) {
      const changes = {};
      for (const [key, value] of Object.entries(partial)) changes[key] = {newValue: value};
      storageListener(changes, "local");
    },
    updateWrongStorage(partial) {
      const changes = {};
      for (const [key, value] of Object.entries(partial)) changes[key] = {newValue: value};
      storageListener(changes, "sync");
    }
  };
}

async function checkRoute(env, raw, expectedMode, expectedQuery) {
  const r = await env.response(raw);
  if (expectedMode === null) {
    assert.equal(r.redirectUrl, undefined, `Must not redirect ${raw}`);
    return;
  }
  assert.ok(r.redirectUrl, `Must redirect ${raw}`);
  const original = new URL(raw);
  const redirected = new URL(r.redirectUrl);
  assert.equal(redirected.searchParams.get("udm"), expectedMode, raw);
  assert.equal(redirected.searchParams.get("q"), expectedQuery, raw);
  assert.equal(redirected.hostname, original.hostname);
  assert.equal(redirected.pathname, original.pathname);
  for (const [key, val] of original.searchParams.entries()) {
    if (key === "udm" || (key === "q" && val !== expectedQuery)) continue;
    assert.equal(redirected.searchParams.get(key), val, `Must preserve '${key}'`);
  }
  assert.equal((await env.response(r.redirectUrl)).redirectUrl, undefined, `Must not loop: ${raw}`);
}

async function main() {
  let checks = 0;
  const env = makeEnv();
  const startupResponse = env.response("https://www.google.com/search?q=how+are+you%3F");
  assert.equal(typeof startupResponse.then, "function", "Wait for settings on early navigation");
  env.resolveStartup();
  assert.equal(new URL((await startupResponse).redirectUrl).searchParams.get("udm"), "50");
  assert.equal(env.getCount(), 1, "Only one storage read per background startup");

  const cases = [
    ["https://www.google.com/search?client=firefox-b-d&q=why+is+the+sky+blue%3F", "50", "why is the sky blue?"],
    ["https://www.google.com/search?q=why+is+the+sky+blue", null],
    ["https://www.google.com/search?q=why%3F+and+how", null],
    ["https://www.google.com/search?q=what+now%3F++", "50", "what now?  "],
    ["https://www.google.com/search?q=%3F", "50", "?"],
    ["https://www.google.com/search?q=why%3F&udm=50", null],
    ["https://www.google.com/search?q=why%3F&udm=14", "50", "why?"],
    ["https://www.google.com/search?q=cat%3F&udm=2", null],
    ["https://www.google.com/search?q=cat%3F&tbm=isch", null],
    ["https://google.com/search?q=what%3F", "50", "what?"],
    ["https://www.google.co.uk/search?q=what%3F", null],
    ["https://www.google.com/search?q=foo%3F&hl=en&client=firefox", "50", "foo?"],
    ["https://www.google.com/search?q=foo%3F&udm=14&hl=en", "50", "foo?"],
    ["https://www.google.com/search?hl=en", null],
    ["https://www.google.com/search/other?q=foo%3F", null],
    ["https://www.google.com/maps/search?q=foo%3F", null],
    ["https://www.google.com/search?q=test%3F#fragment", "50", "test?"],
    ["http://www.google.com/search?q=foo%3F", null],
    ["https://www.google.com/search?q=%3F+why", null],
    ["https://www.google.com/search?q=hello%3F+extra+%3F", "50", "hello? extra ?"],
    ["https://www.google.com/search?q=normal+query%3F&sei=123", "50", "normal query?"],
    ["https://www.google.com/search?q=%E6%98%AF%E4%BB%80%E4%B9%88%EF%BC%9F", null]
  ];
  for (const c of cases) { await checkRoute(env, ...c); ++checks; }
  assert.equal(env.getCount(), 1, "Routing uses cached settings");

  // A customized prefix is case-insensitive, and stripping is optional.
  env.update({trigger:"ai:", position:"prefix", removeTrigger:false});
  await checkRoute(env, "https://www.google.com/search?q=AI%3A+explain+neural+nets", "50", "AI: explain neural nets"); ++checks;
  await checkRoute(env, "https://www.google.com/search?q=explain+neural+nets+ai%3A", null); ++checks;
  await checkRoute(env, "https://www.google.com/search?q=++ai%3A+explain++", "50", "  ai: explain  "); ++checks;
  env.update({removeTrigger:true});
  await checkRoute(env, "https://www.google.com/search?q=AI%3A+explain+neural+nets", "50", "explain neural nets"); ++checks;
  await checkRoute(env, "https://www.google.com/search?q=ai%3A", null); ++checks;
  await checkRoute(env, "https://www.google.com/search?q=ai%3A+ai%3A+hello", "50", "ai: hello"); ++checks;

  // Any literal substring; remove only first occurrence and join spaces.
  env.update({trigger:"!AI", position:"anywhere", removeTrigger:true});
  await checkRoute(env, "https://www.google.com/search?q=explain+%21ai+neural+nets", "50", "explain neural nets"); ++checks;
  await checkRoute(env, "https://www.google.com/search?q=rain%21ai+clouds", "50", "rain clouds"); ++checks;
  await checkRoute(env, "https://www.google.com/search?q=explain+neural+nets", null); ++checks;
  await checkRoute(env, "https://www.google.com/search?q=%21ai%21ai", "50", "!ai"); ++checks;
  env.update({trigger:"ai", removeTrigger:false});
  await checkRoute(env, "https://www.google.com/search?q=train+schedule", "50", "train schedule"); ++checks;

  // Suffix configuration and case folding.
  env.update({trigger:"@GO", position:"suffix", removeTrigger:true});
  await checkRoute(env, "https://www.google.com/search?q=find+information%40go+++", "50", "find information"); ++checks;
  await checkRoute(env, "https://www.google.com/search?q=%40go+find+information", null); ++checks;
  await checkRoute(env, "https://www.google.com/search?q=find+information%40GO&udm=50", null); ++checks;

  // Storage area isolation, and bad settings fall back to safe defaults.
  env.updateWrongStorage({trigger:"??", position:"anywhere"});
  await checkRoute(env, "https://www.google.com/search?q=hello%40go", "50", "hello"); ++checks;
  env.update({trigger:"", position:"nonsense", removeTrigger:"true"});
  await checkRoute(env, "https://www.google.com/search?q=hello%3F", "50", "hello?"); ++checks;
  await checkRoute(env, "https://www.google.com/search?q=%3F+hello", null); ++checks;

  // Ensure storage failures use default rules and don't block navigation.
  const failed = makeEnv();
  const failedEarlyRequest = failed.response("https://www.google.com/search?q=hello%3F");
  failed.failStartup();
  assert.equal(new URL((await failedEarlyRequest).redirectUrl).searchParams.get("udm"), "50");
  checks++;

  // Options page has explicit controls and no inline javascript.
  const html = fs.readFileSync(path.join(root, "options/options.html"), "utf8");
  for (const id of ["trigger", "remove-trigger", "save-button", "reset-button", "example-search", "settings-form"]) {
    assert.ok(html.includes(`id="${id}"`));
  }
  assert.equal((html.match(/name="position"/g) || []).length, 3);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("Anywhere matches text inside words too. Avoid common strings."));
  assert.ok(html.includes("Only Google Search navigations are checked. No data is collected or transmitted by the extension."));
  assert.ok(!html.includes("Preferences stay in this Firefox profile."));

  console.log(`PASS: manifest/options checked, ${checks} routing checks, startup and live settings updates`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
