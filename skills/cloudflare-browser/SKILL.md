---
name: cloudflare-browser
description: Headless Chrome via Cloudflare Browser Rendering CDP WebSocket. Screenshots, scraping, navigation. Requires CDP_SECRET env var.
---

# Cloudflare Browser

CDP over WebSocket for screenshots/scraping. Scripts in `/root/clawd/skills/cloudflare-browser/scripts/`.

## Usage
- Screenshot: `node scripts/screenshot.js https://example.com output.png`
- Video: `node scripts/video.js "https://site1.com,https://site2.com" output.mp4`

## CDP Commands
`Page.navigate`, `Page.captureScreenshot`, `Runtime.evaluate`, `Emulation.setDeviceMetricsOverride`
