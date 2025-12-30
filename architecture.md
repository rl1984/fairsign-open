# Project Architecture & Agent Guidelines

This project has a **Public Open Source** core and a **Private Enterprise** wrapper.
Inside the Enterprise version, features are further split into **Free Tier** and **Pro Tier**.

## 📂 Code Storage Rules

### 1. Open Source Core (Public)
* **What:** The base platform available on GitHub (signing, basic PDF gen).
* **Folder:** `src/` and `server/`
* **Rule:** NO import of `ee/` allowed.

### 2. Enterprise Features (Private)
* **What:** ANYTHING that is part of the hosted SaaS business (both Free & Pro plans).
* **Folder:** `src/ee/` and `server/ee/`
* **Rule:** If it's for the business platform, it goes here.

---

## 🚦 Feature Logic: Free vs. Pro

When building features in the `ee/` folder, you must ask: **"Is this strictly for paid users?"**

### A. Enterprise Free Tier
* **Description:** Features for the hosted business version that non-paying users can access.
* **Implementation:** Place code in `src/ee`. Do **NOT** wrap in subscription checks.

### B. Enterprise Pro Tier
* **Description:** Premium features that require a paid subscription.
* **Implementation:**
    1. Place code in `src/ee`.
    2. **CRITICAL:** You must wrap the UI or API endpoint with a "Gate" or "License Check".
    3. *Example Frontend:* `<ProFeatureGate> ...content... </ProFeatureGate>`
    4. *Example Backend:* `if (!user.hasProPlan) return 403;`

---

## 🤖 Agent Interaction Protocol

When the user requests a feature, you must classify it into one of these three buckets:

1.  **Core / Open Source** -> Put in `src/`.
2.  **Enterprise Free** -> Put in `src/ee/` (No gate).
3.  **Enterprise Pro** -> Put in `src/ee/` (**With Gate**).

**🛑 IF UNSURE:**
You must ask:
> *"Is this a Core feature, an Enterprise Free feature, or a Pro feature? I need to know if I should put it in the `ee` folder and if I should add a paywall check."*