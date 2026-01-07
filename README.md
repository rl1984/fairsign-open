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

### Authentication

FairSign supports two authentication methods for API access:

#### 1. Session-Based Authentication
Used by the web application. Requires login via the web interface.

#### 2. API Key Authentication (Enterprise Only)

For programmatic access from external applications, Enterprise users can create API keys.

**API Key Format:** `fs_live_<64-character-random-string>`

**Usage:**
```bash
curl -X POST https://your-fairsign-instance.com/api/admin/documents/from-template \
  -H "Authorization: Bearer fs_live_your_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "templateId": "your-template-uuid",
    "signers": [
      { "name": "John Doe", "email": "john@example.com", "role": "tenant" }
    ],
    "sendEmail": true
  }'
```

**API Key Security:**
- Keys are SHA-256 hashed before storage (reveal-once on creation)
- Keys are scoped to an organization
- Requires active Enterprise subscription
- Last-used timestamp is tracked for auditing

---

### Templates

Templates are reusable document blueprints with pre-defined signature fields.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/templates` | GET | List all templates for the authenticated user |
| `/api/admin/templates` | POST | Create a new HTML template |
| `/api/admin/templates/pdf` | POST | Upload a PDF template |
| `/api/admin/templates/:id` | GET | Get template details |
| `/api/admin/templates/:id` | PATCH | Update a template |
| `/api/admin/templates/:id` | DELETE | Delete a template |
| `/api/admin/templates/:id/fields` | GET | Get template fields |
| `/api/admin/templates/:id/fields` | POST | Save template fields |

---

### Documents

#### Create Document from Template

Creates a new document from an existing template and sends signing invitations.

```
POST /api/admin/documents/from-template
```

**Request Body:**
```json
{
  "templateId": "uuid-of-template",
  "signers": [
    {
      "name": "John Doe",
      "email": "john@example.com",
      "role": "tenant",
      "orderIndex": 0
    }
  ],
  "creatorFieldValues": {
    "field_api_tag": "pre-filled value"
  },
  "sendEmail": true
}
```

**Response:**
```json
{
  "documentId": "uuid-of-created-document",
  "document_id": "uuid-of-created-document",
  "signers": [
    {
      "email": "john@example.com",
      "name": "John Doe",
      "role": "tenant",
      "signLink": "https://your-domain.com/d/{documentId}?token={signerToken}"
    }
  ],
  "status": "created",
  "emailsSent": true
}
```

**Important IDs:**
- **Template ID**: Used in the request to specify which template to use
- **Document ID**: Returned in response, used for the signing page URL

#### Create One-Off Document

Upload a PDF directly without using a template.

```
POST /api/admin/documents/one-off
Content-Type: multipart/form-data
```

**Form Fields:**
- `pdf`: The PDF file to sign
- `title`: Document title
- `signers`: JSON array of signers
- `fields`: JSON array of signature/field positions
- `sendEmails`: "true" or "false"

#### Other Document Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/documents` | GET | List all documents |
| `/api/admin/documents/:id` | GET | Get document details |
| `/api/admin/documents/:id/archive` | POST | Archive a document |
| `/api/admin/documents/:id/signers` | GET | Get document signers |

---

### Signing Endpoints

These endpoints are used by signers (no authentication required, token-based):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/documents/:id?token=...` | GET | Get document data for signing |
| `/api/documents/:id/signatures?token=...` | POST | Upload signature image |
| `/api/documents/:id/text-field?token=...` | POST | Submit text field value |
| `/api/documents/:id/complete?token=...` | POST | Complete signing |
| `/api/documents/:id/unsigned.pdf?token=...` | GET | Download unsigned PDF |
| `/api/documents/:id/signed.pdf?token=...` | GET | Download signed PDF |

---

### Webhooks

FairSign sends webhook notifications when document status changes.

**Events:**
- `document.created` - Document created
- `document.signed` - A signer completed their portion
- `document.completed` - All signers have signed

**Payload:**
```json
{
  "event": "document.completed",
  "documentId": "uuid",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "status": "completed",
    "signers": [...]
  }
}
```

**Verification:**
Webhooks include an `X-FairSign-Signature` header for HMAC-SHA256 verification.

---

### BoldSign Compatibility Mode

For integration with existing Property Management Systems expecting BoldSign API format, enable compatibility mode:

```env
WEBHOOK_COMPAT_MODE=boldsign
INTERNAL_API_KEY=your-internal-api-key
```

**Compatible Endpoints:**
- `GET /api/document/getEmbeddedSignLink?documentId=...&signerEmail=...`
- `GET /api/document/download?documentId=...`

---

## Security

- **PDF Integrity**: Signatures are flattened into the PDF layer.
- **Access Control**: Admin routes are protected by session authentication.
- **Isolation**: Each document uses a unique, cryptographically secure token.

## License

**FairSign Core** is open-source software licensed under the **AGPLv3**.
*You are free to use, modify, and host this software. If you modify it and offer it as a service to others, you must open-source your modifications.*