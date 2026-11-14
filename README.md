# Use Google AI Mode?

A lightweight Firefox and Chrome extension that opens Google AI Mode when your search matches a customizable trigger. All other searches use regular Google Search.

By default, simply add a question mark to the end of a search.

| Search from your browser's address bar | Result |
| --- | --- |
| `why is the sky blue?` | Google AI Mode |
| `why is the sky blue` | Regular Google Search |
| `best restaurants near me?` | Google AI Mode |
| `best restaurants near me` | Regular Google Search |

**[Get it on Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/use-google-ai-mode/)**  
Chrome Web Store: submitted for review.

## Customize the trigger

Open your browser's extension preferences (Firefox → Add-ons and themes → Preferences; Chrome → Extensions → Details → Extension options) to change the behavior.

- **Trigger text:** Any literal string, such as `?`, `ai:`, or `!ai`
- **Position:** Prefix, suffix, or anywhere in the search query
- **Remove trigger:** Optionally strip the matching trigger before sending the query to Google
- **Matching:** Case-insensitive; outer whitespace ignored

For example, set the trigger to `ai:` with *Prefix* matching and trigger removal, then search for `ai: explain neural networks`.

**Note:** *Anywhere* also matches inside other words. For example, `ai` matches `train`, so choose a distinctive trigger.

## Privacy and technical details

- Only intercepts top-level HTTPS Google Search navigations on `google.com` and `www.google.com`.
- Firefox uses `webRequest.onBeforeRequest`; Chrome uses `declarativeNetRequest` to route matching searches before the regular results page loads.
- Stores preferences locally in each browser (`browser.storage.local` / `chrome.storage.local`).
- Doesn't inject scripts into Google or collect data.

The repository root contains the Firefox source; the [`chrome/`](chrome/) directory contains the Chrome source and tests.

This is an independent, open-source extension, not affiliated with Google.

## License

[MIT License](LICENSE) — copyright © 2026 Zale Rasco.
