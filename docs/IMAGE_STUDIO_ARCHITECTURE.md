# RK DIGITAL WORLD – IMAGE STUDIO
## Product architecture and implementation plan

### Product principles
- Original RK Digital World branding and interface; Pi7 is a workflow reference only.
- Browser-first processing for privacy, speed, and lower hosting cost.
- No fake controls, fake progress, or fake output. A tool is marked available only after its processing path is implemented and verified.
- All outputs are re-opened/decoded and measured before download. KB targets are treated as maximum limits unless an exact byte target is technically achievable without corrupting the image.
- AI tools require a configured server-side provider. API keys must never be sent to the browser.

### Application structure
- `/` – Image Studio dashboard and searchable tool directory.
- `/image-studio.html?tool=<slug>` – focused tool workspace; one route per tool.
- Shared workspace: upload/drop zone, source preview, source metadata, controls, process state, output preview, measured output metadata, download, reset/edit again.
- Shared browser engine: Canvas, ImageBitmap, Blob, Web Workers where useful, ZIP library for batches.
- Server API (later, only where needed): authenticated provider proxy, temporary upload handling, rate limits, file validation, automatic cleanup, health checks.
- AI provider adapters: background removal, object removal, face enhancement, restoration. Provider selection and billing must be configured through server environment variables.

### Tool registry / pages
1. Image Compressor: exact/max KB, preset KB targets, custom KB/MB, JPEG compression, bulk compression, increase output size.
2. Image Resizer: pixels, cm, mm, inches, DPI presets, custom dimensions, aspect lock, upscale, bulk resize.
3. Passport & Documents: passport photo, white/blue/red background, 2x2 inch, 35x45 mm, 3.5x4.5 cm, 600x600, PAN, SSC, UPSC, signatures, photo/signature merge, name/date.
4. Editing: crop, circle/square/freehand crop, rotate, flip, border, text, watermark, blur, background blur, rounded corners, aspect ratio, join, split.
5. AI editing: enhancer, upscaler, face enhancement, retouch, wrinkles/blemishes, unblur, restoration, background replacement, object/logo/text removal.
6. Converters: JPG/JPEG/PNG/WEBP/HEIC/AVIF/JFIF, image-to-PDF, OCR, image-to-Word, constrained JPG-to-PDF.
7. Other: signature maker, Hindi signature, text-to-handwriting, collage, color picker, metadata viewer/editor/remover, GIF maker/compressor, slideshow, video-to-GIF, photos-to-video.
8. PDF Tools: separate category; PDF-specific tools require their own validated processing implementation.

### Processing and verification contracts
- Input validation: MIME sniffing where possible, extension is never trusted alone, file-size/pixel-count limits, clear error messages.
- Image decode: prefer createImageBitmap; fallback to HTMLImageElement.
- Canvas export: JPEG/WebP quality search with a final Blob size check; PNG is lossless and cannot promise arbitrary target sizes.
- Size increase: never claim added visual detail; padding/metadata or format changes can increase bytes, but cannot restore missing image information.
- Dimensions: pixel dimensions are authoritative. Physical dimensions are derived from pixels and requested DPI: pixels = inches × DPI; cm/mm converted to inches.
- DPI: browser Canvas does not reliably persist DPI metadata across formats. A metadata-writing backend may be needed for files that must carry a specific DPI tag.
- Bulk: per-file status and verified output; ZIP only after all files succeed.
- Privacy: browser-side tools do not upload files. Server-side temporary files are deleted after processing and via scheduled cleanup.

### Dependencies and boundaries
- Core browser tools: Canvas API, ImageBitmap, File/Blob, object URLs.
- Bulk ZIP: JSZip (pinned version, self-host where possible).
- HEIC decode: dedicated decoder such as heic2any; verify browser support and licensing.
- PDF generation: jsPDF or pdf-lib.
- OCR: Tesseract.js (large download; optional lazy-load).
- Video/GIF: ffmpeg.wasm (large download; lazy-load and memory limits).
- AI tools: paid or self-hosted model/provider integration; not enabled until credentials, privacy terms, rate limits and cost controls are configured.
- Background removal and object removal are not honestly reproducible with simple Canvas filters.

### Delivery and test gates
- Gate A: architecture, navigation, responsive dashboard, tool route registry.
- Gate B: each browser tool implemented with real output and file-size/dimension assertions.
- Gate C: document/photo presets validated against stated dimensions and output requirements.
- Gate D: bulk ZIP, converters, PDF/OCR/video modules tested on representative fixtures.
- Gate E: AI provider integration and security review.
- Gate F: desktop/mobile, large image, malformed file, memory, accessibility, performance and privacy testing.
- Production release only after each enabled tool passes its own test cases. Do not describe unimplemented tools as complete.
