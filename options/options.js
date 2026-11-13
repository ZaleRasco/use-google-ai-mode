"use strict";

const DEFAULTS = {
  trigger: "?",
  position: "suffix",
  removeTrigger: false
};

const form = document.getElementById("settings-form");
const triggerInput = document.getElementById("trigger");
const removeInput = document.getElementById("remove-trigger");
const status = document.getElementById("status");
const exampleSearch = document.getElementById("example-search");
const exampleDestination = document.getElementById("example-destination");
const saveButton = document.getElementById("save-button");

function selectedPosition() {
  return form.elements.position.value;
}

function getFormSettings() {
  return {
    trigger: triggerInput.value.trim(),
    position: selectedPosition(),
    removeTrigger: removeInput.checked
  };
}

function populate(settings) {
  triggerInput.value = settings.trigger;
  form.elements.position.value = settings.position;
  removeInput.checked = settings.removeTrigger;
  updatePreview();
}

function updatePreview() {
  const { trigger, position, removeTrigger } = getFormSettings();
  const token = trigger || "?";
  const text = "why is the sky blue";
  let example;
  switch (position) {
    case "prefix": example = `${token} ${text}`; break;
    case "anywhere": example = `why is ${token} the sky blue`; break;
    default: example = `${text}${token}`;
  }
  exampleSearch.textContent = example;
  exampleDestination.textContent = removeTrigger
    ? `Opens AI Mode without “${token}” in the search`
    : "Opens Google AI Mode (trigger kept in search)";
}

function message(text, isError = false) {
  status.textContent = text;
  status.classList.toggle("error", isError);
}

async function save() {
  const values = getFormSettings();
  if (!values.trigger) {
    message("Enter a non-empty trigger.", true);
    triggerInput.focus();
    return;
  }
  saveButton.disabled = true;
  try {
    await browser.storage.local.set(values);
    message("Saved. Your next Google search will use these settings.");
  } catch (error) {
    message(`Could not save preferences: ${error.message || error}`, true);
  } finally {
    saveButton.disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void save();
});

document.getElementById("reset-button").addEventListener("click", () => {
  populate(DEFAULTS);
  void save();
});

form.addEventListener("input", () => {
  updatePreview();
  message("");
});
form.addEventListener("change", () => {
  updatePreview();
  message("");
});

(async () => {
  try {
    const saved = await browser.storage.local.get(DEFAULTS);
    populate({
      trigger: typeof saved.trigger === "string" && saved.trigger.trim() ? saved.trigger : "?",
      position: ["prefix", "suffix", "anywhere"].includes(saved.position) ? saved.position : "suffix",
      removeTrigger: saved.removeTrigger === true
    });
  } catch (error) {
    populate(DEFAULTS);
    message("Could not load saved preferences; showing defaults.", true);
  }
})();
