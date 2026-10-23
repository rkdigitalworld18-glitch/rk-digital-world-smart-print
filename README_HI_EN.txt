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
   `.\agent\print-agent.ps1`
6. Test using non-sensitive sample PDF and image files. Verify paper size, fit, monochrome/color, and copies. Custom photo sizes and duplex behavior may need driver-specific adjustment.

## QR code
After deployment, open the live website URL and download/print the QR code displayed on the page. Do not print a QR code made from localhost: it only works on the laptop.
