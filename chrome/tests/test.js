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
assert.deepEqual(manifest.permissions, ["declarativeNetRequestWithHostAccess", "storage"]);
assert.ok(!manifest.permissions.includes("tabs"));
assert.ok(!manifest.permissions.includes("webRequest"));
assert.deepEqual(manifest.host_permissions, ["https://www.google.com/*", "https://google.com/*"]);
assert.equal(manifest.background.service_worker, "background.js");
assert.equal(manifest.options_ui.page, "options/options.html");
for (const file of ["background.js", "rules.js", "options/options.html", "options/options.js", "options/options.css", "icons/icon-48.png", "icons/icon-96.png", "icons/icon-128.png"]) {
  assert.ok(fs.statSync(path.join(root, file)).size > 0, file);
}

const context = {URL, URLSearchParams};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "rules.js"), "utf8") + ";globalThis.Builder=AiModeRules;", context);
const Builder = context.Builder;

// Simulate which DNR rule wins, using the JS regex engine for the supported
// subset of RE2 syntax used by our patterns. Browser-native DNR tested separately.
function evaluate(input, config) {
  const rules = Builder.createRules(config).slice().sort((a,b)=>b.priority-a.priority);
  for(const rule of rules) {
    const re = new RegExp(rule.condition.regexFilter, "i");
    if(!re.test(input)) continue;
    if(rule.action.type === "allow") return {result:input, ruleId:rule.id};
    if(rule.action.redirect.transform) {
      const url = new URL(input);
      url.searchParams.set("udm", "50");
      return {result:url.href, ruleId:rule.id};
    }
    const replacement = rule.action.redirect.regexSubstitution.replace(/\\([1-9])/g,"$$$1");
    return {result:input.replace(re, replacement), ruleId:rule.id};
  }
  return {result:input, ruleId:null};
}
function check(query, mode, expectedQuery, config = {}, extra = "", host="www.google.com") {
  const url = new URL(`https://${host}/search?client=chrome&q=${encodeURIComponent(query)}${extra}`);
  const {result, ruleId}=evaluate(url.href, config);
  const transformed = new URL(result);
  if(mode) {
    assert.equal(ruleId,2, `${query}: expected redirect; got rule ${ruleId} (${result})`);
    assert.equal(transformed.searchParams.get("udm"),"50", query);
    assert.equal(transformed.searchParams.get("q"),expectedQuery,query);
    assert.equal(transformed.searchParams.get("client"),"chrome",query);
    assert.equal(transformed.hostname,host);
    assert.notEqual(evaluate(result, config).ruleId,2, `redirect loop for ${result}`);
  }else {
    assert.notEqual(ruleId,2, `${query}: should not redirect`);
    assert.equal(result,url.href);
  }
}
let count=0;
function t(...args){check(...args);count++;}

// Default behavior, preserving query and Google extras.
t("why is the sky blue?",true,"why is the sky blue?");
t("why is the sky blue",false);
t("why? and how",false);
t("what now?  ",true,"what now?  ");
t("?",true,"?");
t("foo??",true,"foo??");
t("best restaurants near me?",true,"best restaurants near me?");
t("why?",true,"why?",{},"&hl=en&sei=123");
t("why?",false,null,{},"&udm=50");
t("why?",false,null,{},"&udm=14");
t("why?",false,null,{},"&tbm=isch");
t("why?",true,"why?",{},"","google.com");
t("why?",true,"why?",{},"&sourceid=chrome");
t("什么?",true,"什么?");
t("what？",false);

// Strict Google host + path boundaries.
for (const forbidden of ["https://www.google.co.uk/search?q=why%3F", "https://evilgoogle.com/search?q=why%3F", "http://www.google.com/search?q=why%3F", "https://www.google.com/search/other?q=why%3F", "https://www.google.com/maps/search?q=why%3F"]) {
  const got = evaluate(forbidden, {});
  assert.equal(got.ruleId,null,forbidden);
  count++;
}

// Prefix and suffix positions, ASCII and Unicode, case-insensitive.
const prefix={trigger:"ai:",position:"prefix"};
t("ai: explain",true,"ai: explain",prefix);
t("AI: Explain",true,"AI: Explain",prefix);
t("explain ai:",false,null,prefix);
t("ai: explain",true,"explain",{...prefix,removeTrigger:true});
t("ai:",false,null,{...prefix,removeTrigger:true});
t("AI:  explain  ",true,"explain  ",{...prefix,removeTrigger:true});
t("  ai: explain",true,"explain",{...prefix,removeTrigger:true});
const suffix={trigger:"!ai",position:"suffix"};
t("help!ai",true,"help!ai",suffix);
t("help!AI",true,"help!AI",suffix);
t("help!ai   ",true,"help!ai   ",suffix);
t("!ai help",false,null,suffix);
t("help !ai  ",true,"help",{...suffix,removeTrigger:true});
t("!ai",false,null,{...suffix,removeTrigger:true});
t("help!AI",true,"help",{...suffix,removeTrigger:true});
const anywhere={trigger:"!ai",position:"anywhere"};
t("help !ai now",true,"help !ai now",anywhere);
t("rain!ai clouds",true,"rain!ai clouds",anywhere);
t("rain!ai clouds",true,"rain clouds",{...anywhere,removeTrigger:true});
t("help !ai now",true,"help  now",{...anywhere,removeTrigger:true});
t("!ai",false,null,{...anywhere,removeTrigger:true});
t("!ai!ai",true,"!ai",{...anywhere,removeTrigger:true});
t("normal search",false,null,anywhere);
t("train schedule",true,"train schedule",{trigger:"ai",position:"anywhere"});

// Regex meta characters, punctuation, whitespace and non-ASCII search triggers.
for (const trigger of ["?","*",".","+","(","[",")","$","^","|","ai:","!AI","你好","é", "🔥", "hello world"]) {
  for(const position of ["prefix","suffix","anywhere"]){
    const original = position==="prefix"?`${trigger} explain`:
      position==="suffix"?`explain ${trigger}`:`ex${trigger}plain`;
    t(original,true,original,{trigger,position});
    // removal: expected query after trimming for prefix/suffix; anywhere glues tokens.
    const expected = position==="prefix"?"explain":position==="suffix"?"explain":"explain";
    t(original,true,expected,{trigger,position,removeTrigger:true});
  }
}

// Replacing trigger should not overmatch a different configuration.
t("please help?",false,null,{trigger:"!ai",position:"suffix"});
t("why now?",true,"why now?",{position:"invalid",trigger:""});
t("hello?",true,"hello?",{trigger:"?",position:"suffix",removeTrigger:"true"});

console.log(`PASS: ${count} search routing cases + manifest/source checks`);
