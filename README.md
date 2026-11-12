# RK DIGITAL WORLD – IMAGE STUDIO

Professional browser-first image tools for RK Digital World.

## Run locally

- Node.js 18 or newer
- `npm install`
- Set the existing Smart Print secrets `OWNER_TOKEN` and `AGENT_TOKEN` (the server currently requires both at startup).
- `npm start`
- Open `http://localhost:3000/image-studio.html`

## Image Studio processing

The Image Studio is served from `public/image-studio.html`. Common image processing runs in the browser using Canvas and Blob APIs; files for these tools are not uploaded to the server. Bulk ZIP, PDF generation and OCR load their processing libraries on demand from jsDelivr, so the first use requires an internet connection.

Implemented browser-side modules include image compression (maximum target KB), resizing, passport/signature dimension presets, crop, rotate/flip, border, watermark, blur, circle crop, format conversion, bulk ZIP compression/resizing, image-to-PDF with maximum-size mode, Hindi/English OCR, OCR-to-DOCX, HEIC decode, animated GIF creation from photos, multi-image join/collage, photo-signature composition, image splitting, color sampling, EXIF viewing/editing, metadata-stripping re-export and signature drawing.

## Optional AI background removal

The background-removal tool uses the remove.bg paid API. Add `REMOVE_BG_API_KEY` to the Render service's Environment settings. Never put the key in HTML or browser JavaScript.

- API health/configuration: `GET /api/studio/capabilities`
- Processing: `POST /api/studio/remove-background` as multipart form field `image`
- Uploaded temporary image is deleted after provider processing.
- The endpoint applies a basic per-IP rate limit. Provider usage may incur charges.

Other AI features (face retouching, object removal, AI upscaling and restoration) are not enabled until a specific provider/model, licensing, privacy policy and server-side adapter are configured.

## Important output notes

- KB compression targets are maximum limits, not a promise of byte-for-byte exact file size. PNG cannot be forced to arbitrary sizes without changing format or image content.
- Size increase uses pixel upscaling and can increase bytes, but does not create genuine missing detail.
- Browser Canvas does not consistently write print DPI metadata tags. Pixel dimensions are computed from DPI settings; use a metadata-writing pipeline if a receiving portal requires an embedded DPI tag.
- Passport sizing crops/resizes to the specified pixel dimensions. It does not remove an existing photo background. Use the separately configured AI background-removal tool for that.
- AI object removal, face enhancement, HEIC decoding, GIF/video encoding and some advanced tools remain clearly marked as pending integrations rather than fake buttons.

## Privacy

Browser-side image tools process files locally. Only the optional background-removal API uploads a temporary image to the RK server and onward to remove.bg; that temporary upload is deleted in the request cleanup path. Review the remove.bg provider's terms and privacy policy before enabling the key for customers.
