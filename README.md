# Use Google AI Mode?

A lightweight Firefox extension that opens **Google AI Mode** when your search matches a customizable trigger. All other searches use regular Google Search.

By default, simply add a **question mark** to the end of a search.

| Search from Firefox's address bar | Result |
| --- | --- |
| `why is the sky blue?` | Google AI Mode |
| `why is the sky blue` | Regular Google Search |
| `best restaurants near me?` | Google AI Mode |
| `best restaurants near me` | Regular Google Search |

**[Get it on Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/use-google-ai-mode/)**

## Customize the trigger

Open **Firefox → Add-ons and themes → Use Google AI Mode? → Preferences** to change the behavior.

- **Trigger text:** Any literal string, such as `?`, `ai:`, or `!ai`
- **Position:** Prefix, suffix, or anywhere in the search query
- **Remove trigger:** Optionally strip the matching trigger before sending the query to Google
- **Matching:** Case-insensitive; outer whitespace ignored

For example, set the trigger to `ai:` with *Prefix* matching and trigger removal, then search for `ai: explain neural networks`.

**Note:** *Anywhere* also matches inside other words. For example, `ai` matches `train`, so choose a distinctive trigger.

## Privacy and technical details

- Only intercepts top-level HTTPS Google Search navigations on `google.com` and `www.google.com`.
- Uses Firefox's `webRequest.onBeforeRequest` API to route matching searches before the regular results page loads.
- Doesn't inject scripts into Google, contact third-party services, or collect analytics.
- Stores preferences locally in Firefox with `browser.storage.local`.
- Leaves unmatched searches and existing Google AI Mode or specialized-tab searches unchanged.
- Uses Google's `udm=50` search mode parameter, which Google may change. AI Mode availability may vary by account or region.

This is an **independent, open-source extension**, not affiliated with Google.

## Development

The source is intentionally small, readable, and unbundled. The source files in this repository correspond to version **1.1.2**, the release submitted to Mozilla on November 13, 2026.

- `manifest.json` — extension metadata and permissions
- `background.js` — search routing logic
- `options/` — preferences interface
- `icons/` — extension icons
- `scripts/make_icons.py` — icon-generation script (Pillow and a local Inter ExtraBold font required)
- `tests/test.js` — automated routing and configuration tests

Run tests:

```sh
node tests/test.js
```

To test locally, open `about:debugging` in Firefox → **This Firefox** → **Load Temporary Add-on**, then select `manifest.json`.

To package for Mozilla submission, ZIP the extension files from the repository root while **excluding `tests/` and `scripts/`**. The version submitted to Mozilla includes the root files, `options/`, and `icons/`.

## License

[MIT License](LICENSE) — copyright © 2026 Zale Rasco.
