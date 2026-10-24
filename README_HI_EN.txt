# RK Digital World Smart Print — Starter Kit

This is a deployable starter project, not a live hosted service yet. It includes:
- Responsive customer upload website
- Owner approval dashboard (phone-friendly)
- Node.js upload/API server
- Windows PowerShell print-agent template for the shop laptop
- HP Smart Tank 581 target setup notes

## Important before real customer use
1. Deploy only behind HTTPS.
2. Set strong random `OWNER_TOKEN` and `AGENT_TOKEN` values. Keep both private.
3. Add a proper database, rate limiting, malware scanning, audit logs, backups and automatic file deletion before public production.
4. The included JSON file storage is suitable only for a small controlled pilot, not a high-availability service.
5. The agent submits print jobs to the configured Windows printer. Confirm the exact printer name, paper size, and driver settings; test with sample files first. Do not enable unattended printing until tested.
6. Customer-facing print costs are not charged or collected in this starter. No payment gateway is included.
7. Do not upload/store sensitive identity documents without a clear purpose, consent, access controls, and a deletion policy.

## Hardware
HP Smart Tank 581 supports Windows 11 and USB/Wi-Fi connectivity. Install its official Windows 11 software/driver from:
https://support.hp.com/in-en/product/drivers/model/2101277335

## Run locally for testing (Windows 11 or other Node.js system)
Install Node.js LTS from https://nodejs.org/ then open PowerShell in this folder.

```powershell
npm install
$env:OWNER_TOKEN = "use-a-long-random-owner-secret"
$env:AGENT_TOKEN = "use-a-different-long-random-agent-secret"
npm start
```

Open http://localhost:3000 on the same computer. For mobile testing on the same Wi-Fi, use the laptop's LAN IP address (for example `http://192.168.1.x:3000`) and permit access only on a trusted private network. Public customers need an HTTPS hosted domain.

## Owner approval
Open the website > Owner Approval > enter the exact `OWNER_TOKEN` > Load requests > Approve or Reject.

## Configure print agent
1. Install HP Smart Tank 581's official Windows 11 driver and verify a test print.
2. Install SumatraPDF from its official website: https://www.sumatrapdfreader.org/download-free-pdf-viewer
3. In Windows Settings > Bluetooth & devices > Printers & scanners, copy the exact installed printer name.
4. Edit `agent/print-agent.ps1`: set `SERVER_URL`, `AGENT_TOKEN`, `PRINTER_NAME`, and the actual SumatraPDF path.
5. Run PowerShell in the project folder and launch:
   `.\print-agent.ps1`
6. Test using non-sensitive sample PDF and image files. Verify paper size, fit, monochrome/color, and copies. Custom photo sizes and duplex behavior may need driver-specific adjustment.

## Print speed and quality (Windows 11 / HP Smart Tank)
- The updated agent checks for the next approved job every 1 second while the queue is idle (previously 4 seconds).
- Agent logs separately show queue-poll time, download time, and Sumatra/driver handoff time. If a delay repeats, use these measurements to tell whether it is the server, download, or Windows printing stage.
- Raster uploads receive a `dpi=300` assumed-DPI hint in SumatraPDF. Sumatra ignores this hint for PDFs that already contain their own page dimensions; it is not a command to force printer hardware resolution.
- To improve actual output quality, open Windows Settings > Bluetooth & devices > Printers & scanners > HP Smart Tank > Printing preferences > Paper/Quality, select **Best** (or **Maximum DPI**, if the installed HP driver offers it), and set the paper type to the paper actually loaded. HP notes that Best / Maximum DPI can use more ink and print more slowly: https://support.hp.com/in-en/document/ish_14282292-14066381-16
- The ID-card A4 PDF is prepared from a 300-DPI-sized crop. A low-resolution or blurry source photo cannot be restored by upscaling; capture the card clearly, with good light and all four edges visible.
- The printer's advertised maximum output is not the same as the image's effective DPI. For this printer family, HP lists up to 1200 × 1200 rendered dpi black and up to 4800 × 1200 optimized dpi color with 1200-dpi input: https://support.hp.com/in-en/product/product-specs/hp-smart-tank-580-all-in-one-printer/2100992726

## QR code
After deployment, open the live website URL and download/print the QR code displayed on the page. Do not print a QR code made from localhost: it only works on the laptop.
