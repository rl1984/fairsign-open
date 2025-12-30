# FairSign

**FairSign** is an open-source document signing platform designed to be a fair, transparent, and self-hostable alternative to expensive corporate tools. It provides a complete e-signature solution for individuals and businesses, featuring HTML-to-PDF generation, secure signature capture, and audit-compliant workflows.

## Features

- **Dual-Mode Template System**: Create documents from HTML templates (via Puppeteer) or upload existing PDFs with drag-and-drop field placement.
- **Canvas-Based Signature Capture**: Smooth, responsive signature pad for capturing authentic e-signatures.
- **PDF Stamping**: Automatically embeds signatures, text fields, and checkboxes into PDFs using `pdf-lib`.
- **Multi-Signer Support**: Complex workflows with multiple roles (e.g., Landlord & Tenant) and assigned signature spots.
- **Secure Links**: Token-based, shareable signing URLs that do not require signers to create an account.
- **Webhook Callbacks**: Notify your external systems instantly when a document is signed or completed.
- **Audit Trail**: Full logging of IP addresses, timestamps, and events for compliance.
- **Multi-Tenant Support**: Built-in user authentication (Email/Password) with optional TOTP 2FA.
- **S3 & R2 Support**: Store documents on AWS S3 or use Cloudflare R2 for a generous free tier.

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui, Wouter
- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **PDF Engine**: Puppeteer (Generation) & pdf-lib (Manipulation)
- **Auth**: Session-based (express-session) with bcrypt & TOTP

---

## Local Development

### Prerequisites

- Node.js 18+
- PostgreSQL Database
- npm or yarn

### Setup

1. **Clone the repository**
   ```bash
   git clone [https://github.com/rl1984/fairsign-open.git](https://github.com/rl1984/fairsign-open.git)
   cd fairsign-open
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment**
   Create a `.env` file in the root directory:
   ```env
   # Database Connection
   DATABASE_URL=postgresql://user:password@localhost:5432/fairsign

   # Security (Generate a random string)
   SESSION_SECRET=super_secret_key_change_me_in_prod

   # Domain Configuration (Required for email links)
   BASE_URL=http://localhost:5000

   # Optional: Cloudflare R2 / S3 Storage (Defaults to local disk if omitted)
   S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
   S3_BUCKET=fairsign-storage
   S3_ACCESS_KEY_ID=<your-access-key>
   S3_SECRET_ACCESS_KEY=<your-secret-key>
   S3_REGION=auto
   ```

4. **Initialize Database**
   ```bash
   npm run db:push
   ```

5. **Start Server**
   ```bash
   npm run dev
   ```
   Access the app at `http://localhost:5000`.

### Default Admin Account
*Created automatically on first run:*
- **Email:** `admin@fairsign.local`
- **Password:** `admin123`
*(Please change this immediately upon logging in)*

---

## Deployment Guide (Render & Cloudflare R2)

### Part 1: Hosting on Render

#### 1. The Puppeteer Fix (Crucial)
Render's native Node environment doesn't always include Chrome. The most reliable fix is to use **Docker**.

**Add this `Dockerfile` to your repo root:**

```dockerfile
FROM node:18-slim

# Install Chromium for Puppeteer
RUN apt-get update && apt-get install -y chromium \
    fonts-liberation libasound2 libatk-bridge2.0-0 \
    libnspr4 libnss3 lsb-release xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

*If you use this Dockerfile, switch your Render Environment setting to **Docker**.*

### Part 2: Free Storage with Cloudflare R2

We recommend **Cloudflare R2** for the 10GB free tier. Add these variables to your Render Environment:

```bash
S3_ENDPOINT=https://<your-account-id>.r2.cloudflarestorage.com
S3_BUCKET=fairsign-storage
S3_ACCESS_KEY_ID=<your-access-key-id>
S3_SECRET_ACCESS_KEY=<your-secret-access-key>
S3_REGION=auto
```

---

## API Documentation

### Documents
- **List Documents**: `GET /api/admin/documents`
- **Create Envelope**: `POST /api/admin/documents`

### Signing
- **Retrieve Data**: `GET /api/sign/:token`
- **Finalize Signature**: `POST /api/sign/:token/complete`

---

## Security

- **PDF Integrity**: Signatures are flattened into the PDF layer.
- **Access Control**: Admin routes are protected by session authentication.
- **Isolation**: Each document uses a unique, cryptographically secure token.

## License

**FairSign Core** is open-source software licensed under the **AGPLv3**.
*You are free to use, modify, and host this software. If you modify it and offer it as a service to others, you must open-source your modifications.*