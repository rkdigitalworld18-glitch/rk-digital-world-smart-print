# Image Studio deployment checklist

## Render environment

The existing Smart Print server still requires:
- `OWNER_TOKEN`
- `AGENT_TOKEN`

Optional paid background replacement:
- `REMOVE_BG_API_KEY` — create an API key with remove.bg and store it only in Render → Service → Environment. Never commit it to GitHub or paste it into the HTML.

The server uses Node.js 18+ (global `fetch`, `FormData`, and `Blob` are required). After setting the optional key, redeploy the Render service.

## Post-deploy smoke checks

1. Open `/api/health`; expect JSON `ok: true`.
2. Open `/api/studio/capabilities`; `backgroundRemoval` should be `true` only after the key is configured.
3. Open `/image-studio.html` and test one small JPG with: compression to 100 KB, 600×600 resize, rotate, WEBP conversion, image-to-PDF, OCR, and signature export.
4. Test bulk compression with 2–3 images; verify each ZIP entry and its actual byte size.
5. Test background removal only after adding the paid key; confirm PNG transparency/background color and confirm the server temporary upload is deleted.
6. Test on mobile and desktop, and verify browser console/network errors.

## Current limitations that must remain visible

- Exact byte-for-byte KB is not guaranteed; compression tools enforce a maximum size and report the actual output.
- Embedded DPI metadata is not written by Canvas. Dimensions are calculated using DPI, but print portals requiring an actual EXIF/JFIF DPI tag need a separate metadata writer.
- Passport dimensions are crop/resize presets. White/blue/red background replacement depends on the optional paid background-removal provider.
- Face enhancement, AI upscaling, skin retouching, object/logo/text removal, old-photo restoration and advanced inpainting are not enabled.
- GIF creation from still photos is implemented; GIF optimization, video-to-GIF and photos-to-video still need a video/GIF decoder pipeline.
- HEIC conversion uses a browser decoder loaded on demand. AVIF depends on native browser decoding support.
- The browser loads JSZip, pdf-lib, Tesseract.js, docx, ExifReader, piexifjs, heic2any and gifenc from CDNs only when needed. Production hardening should self-host pinned library assets and review each license.

## Release rule

Do not describe the project as production-ready until the smoke checks above have been executed on the deployed Render instance and the pending feature list has either been implemented or intentionally removed from the public tool catalogue.
