# Prompt 12 — The Share Engine (Video Export)

> Read AGENTS.md, NOTES.md first. Depends on Prompt 11.

Build the SHARE ENGINE so The Drive (and future cinematics) export as real shareable video — in the browser, no server.

## CORE (js/features/share.js)
- canvas.captureStream(60) + MediaRecorder. Codec negotiation: prefer 'video/mp4;codecs=avc1' where supported, fall back to vp9/vp8 webm — detect via MediaRecorder.isTypeSupported(), pick the best available.
- Record the cinematic in a hidden/offscreen render pass at fixed 1080x1920 (portrait) OR 1920x1080 (landscape toggle) — a dedicated deterministic render, NOT a screen capture of the live view, so export quality is device-independent.
- Progress UI: "Rendering your week… 42%" in the same skeleton/shimmer language; then native share sheet via navigator.share({ files }) with download fallback.
- SAFARI FALLBACK: if MediaRecorder/codec support fails, degrade gracefully to a "Story Pack": 4–6 key frames rendered as PNGs (canvas.toBlob) bundled for download/share — never a dead end.
- Also generate a static "score card" PNG (week result, top 3 performers, route-map mini) optimized for group-chat sharing.

## QUALITY BAR
Exported video must be visually identical to the live cinematic (same timeline drives both). Sane file size (<15MB). Include a "Copy link to this week's recap" stub for future shareable URLs.

## DELIVERABLES
Complete share.js + verification checklist for Chrome desktop, iOS Safari, Android Chrome (what exports on each). Update NOTES.md.
