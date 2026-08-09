---
name: WhatsApp QR fix
description: How to keep the WhatsApp QR working with Baileys on Replit.
---

# WhatsApp QR Fix

## Rule
Always hardcode browser version and call `fetchLatestWaWebVersion()` before `makeWASocket()`.

**Why:** `Browsers.macOS("Chrome")` returned Chrome version `14.4.1` (from 2011); WhatsApp rejected the handshake. The stale default protocol version also caused failures.

## How to apply (in `whatsapp.js`)
```js
import { ..., fetchLatestWaWebVersion } from "@whiskeysockets/baileys";
const { version } = await fetchLatestWaWebVersion();
const sock = makeWASocket({
  version,
  browser: ["Mac OS", "Chrome", "124.0.0"],
  ...
});
```
Use `@whiskeysockets/baileys` rc13 or later.

## Stale QR after pause
When 408 (QR expired unscanned) pauses auto-reconnect, `lastQR` must be cleared — otherwise the panel serves an expired QR and the phone says "no se puede vincular". `/api/whatsapp/qr` calls `forceReconnect()` when no QR is available and reconnection is paused, generating a fresh QR automatically.
