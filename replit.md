## Overview

This project is an internal e-signature service designed to replace third-party solutions for rental property management. It provides a complete signing solution for landlords and tenants, enabling document creation from HTML templates, PDF generation, secure signature capture, and robust document completion workflows. The service aims to streamline the lease agreement process with a user-friendly web interface and comprehensive backend support.

## User Preferences

Preferred communication style: Simple, everyday language.

## Project Structure (Open Source / Enterprise)

This project uses a **Two Entry Points** strategy for open source distribution with optional enterprise features:

```
/                       # Root directory
├── src/
│   ├── index.ts        # OSS entry point - exports createApp() without EE
│   ├── index-ee.ts     # Enterprise entry - imports OSS + attaches EE routes
│   └── ee/             # Enterprise Edition (PROPRIETARY)
│       ├── payments/   # Stripe subscription integration
│       │   └── index.ts
│       ├── sso/        # Future: SAML/Okta SSO
│       │   └── index.ts
│       └── index.ts    # EE feature registration
├── server/             # Core backend (OPEN SOURCE)
│   ├── index.ts        # Delegates to src/index-ee.ts (default)
│   ├── routes.ts       # Main API routes (no EE imports)
│   ├── storage.ts      # Database storage layer
│   ├── services/       # Core services (PDF, email, webhook)
│   └── replit_integrations/  # Auth integration
├── client/             # Frontend (OPEN SOURCE)
│   └── src/
│       ├── pages/      # React pages
│       └── components/ # UI components
└── shared/             # Shared types and schemas
```

### Two Entry Points Strategy
- **OSS Entry** (`src/index.ts`): Exports `createApp()` and `startServer()` functions. Does NOT import any EE modules.
- **EE Entry** (`src/index-ee.ts`): Imports from `src/index.ts`, then attaches payment/SSO routes via `registerEnterpriseRoutes()`.
- **Default** (`server/index.ts`): Delegates to `src/index-ee.ts` so `npm run dev` runs EE version.

### Running Different Versions
- **Enterprise Edition**: `tsx src/index-ee.ts` or `npm run dev` (default)
- **Open Source Edition**: `tsx src/index.ts`

### Enterprise Features
- **Payments** (`src/ee/payments/`): Stripe subscription management, checkout, billing portal
- **SSO** (`src/ee/sso/`): Placeholder for Okta/SAML login (not yet implemented)

Enterprise features are conditionally loaded via `registerEnterpriseRoutes()` based on environment configuration (STRIPE_SECRET_KEY, etc.).

## System Architecture

### UI/UX Decisions
- **Frontend**: React 18 with TypeScript, Wouter for routing.
- **Components**: shadcn/ui built on Radix UI, styled with Tailwind CSS.
- **Theming**: Material Design-inspired with Roboto font.
- **PDF Viewing**: PDF.js for in-browser document preview.
- **Signature Capture**: HTML5 canvas signature pad.

### Technical Implementations
- **Backend**: Node.js with Express, TypeScript, ESM modules.
- **API**: RESTful endpoints under `/api`.
- **File Uploads**: Multer for signature PNG uploads.
- **Validation**: Zod schemas for API request validation.
- **PDF Processing**: Puppeteer for HTML to A4 PDF conversion, pdf-lib for embedding signatures, Audit trail for all signing actions.
- **Data Storage**: PostgreSQL via Drizzle ORM, node-postgres driver. Key tables for documents, signature assets, spots, audit events, templates, and email logs.
- **Security**: Token-based authentication for signing links, HMAC-SHA256 for webhook verification.
- **Template System**: Dual-mode template system supporting HTML and PDF templates.
  - HTML templates use `{{key}}` placeholder syntax.
  - PDF templates support visual field placement with drag-and-drop editor.
  - Template fields stored with API tags for external system integration.
  - PDF.js for in-browser PDF viewing and field editing.
  - pdf-lib for stamping text, signatures, and checkboxes onto PDF templates.
- **Build Tool**: Vite with React plugin and path aliasing.

### Feature Specifications
- Document creation from templates.
- PDF generation and manipulation.
- Electronic signature capture and embedding.
- Secure document completion workflows.
- Webhook notifications for document status changes.
- Admin functionalities for document and template management.
- BoldSign compatibility mode for integration with existing PMS systems, including response aliases, embedded signing links, and compatible webhooks.
- Comprehensive audit trail for all signing events.
- **Multi-signer support** with role-based signature spot assignments:
  - Create documents with multiple signers (e.g., landlord and tenant).
  - Each signer receives a unique signing link.
  - Signers can only sign spots assigned to their role.
  - Per-signer "Signed" webhooks in BoldSign compat mode.
  - Document only completes and PDF is stamped when all signers are done.
  - `getEmbeddedSignLink` endpoint supports signerEmail lookup.
- **Document Storage Choice** (in progress):
  - Users can choose where signed documents are stored: FairSign S3, Google Drive, Dropbox, or Box.
  - FairSign S3 storage uses per-user path segregation (`users/{userId}/documents/`).
  - Client-side encryption utilities available for FairSign storage (Web Crypto API).
  - OAuth integration for external providers with per-user encrypted token storage.
  - Storage Settings page at `/storage-settings` for provider management.
  - API endpoints: `/api/storage/settings`, `/api/storage/oauth/:provider`, `/api/storage/encryption/setup`.
  - **Known limitations**: Document upload/download flows not yet integrated with user storage preferences. External provider APIs (Google Drive, Dropbox, Box) require API credentials via environment variables.

## External Dependencies

- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **PDF Generation**: Puppeteer
- **PDF Manipulation**: pdf-lib
- **Client-side PDF Rendering**: PDF.js
- **Signature Pad**: signature_pad
- **File Uploads**: Multer
- **Object Storage**: Replit Object Storage (default), compatible with S3/Cloudflare R2 (optional)
- **Email Service**: SendGrid or custom SMTP (optional)
- **Payments** (EE): Stripe for subscription management (requires STRIPE_SECRET_KEY, STRIPE_PRO_PRICE_ID, STRIPE_WEBHOOK_SECRET)