"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");

async function main() {
  let installed, startup, changed;
  let config = {trigger:"?", position:"suffix", removeTrigger:false};
  let dynamicRules = [];
  let commits = 0;
  const chrome = {
    runtime: {
      onInstalled: {addListener(fn){installed = fn;}},
      onStartup: {addListener(fn){startup = fn;}}
    },
    storage: {
      local: {async get(defaults){return {...defaults,...config};}},
      onChanged: {addListener(fn){changed = fn;}}
    },
    declarativeNetRequest: {
      async isRegexSupported({regex,requireCapturing}) {
        // These patterns use the shared subset of JS regex and Chromium RE2.
        new RegExp(regex, "i");
        if(requireCapturing) assert.ok(regex.includes("("));
        return {isSupported:true};
      },
      async updateDynamicRules({removeRuleIds,addRules}) {
        dynamicRules=dynamicRules.filter(rule=>!removeRuleIds.includes(rule.id));
        dynamicRules.push(...addRules);
        commits++;
      }
    }
  };
  const context={chrome,console,URL,URLSearchParams};
  vm.createContext(context);
  const code=fs.readFileSync(path.join(root,"background.js"),"utf8");
  context.importScripts=(file)=>vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),context);
  vm.runInContext(code,context);
  assert.equal(typeof installed,"function");
  assert.equal(typeof startup,"function");
  assert.equal(typeof changed,"function");

  installed();
  await vm.runInContext("updateQueue",context);
  assert.equal(commits,1);
  assert.deepEqual(dynamicRules.map(x=>x.id).sort(),[1,2]);

  config={trigger:"ai:",position:"prefix",removeTrigger:true};
  changed({trigger:{newValue:"ai:"},position:{newValue:"prefix"},removeTrigger:{newValue:true}},"local");
  await vm.runInContext("updateQueue",context);
  assert.equal(commits,2);
  assert.deepEqual(dynamicRules.map(x=>x.id).sort(),[1,2,3]);
  assert.equal(dynamicRules.find(x=>x.id===2).action.type,"redirect");
  assert.ok(dynamicRules.find(x=>x.id===2).action.redirect.regexSubstitution);

  changed({trigger:{newValue:"irrelevant"}},"sync");
  await vm.runInContext("updateQueue",context);
  assert.equal(commits,2);

  config={trigger:"?",position:"suffix",removeTrigger:false};
  startup();
  await vm.runInContext("updateQueue",context);
  assert.equal(commits,3);
  assert.deepEqual(dynamicRules.map(x=>x.id).sort(),[1,2]);
  console.log("PASS: service worker install, dynamic rule replacement, storage change, restart, wrong-area isolation");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
