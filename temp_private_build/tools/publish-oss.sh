#!/bin/bash

# ---------------- CONFIGURATION ----------------
PUBLIC_REPO_URL="https://github.com/rl1984/fairsign-open.git"
TEMP_DIR="temp_oss_build"

echo "🚀 Starting FRESH Open Source Publication (Zero History)..."

# 1. Start with a totally empty local folder
rm -rf "$TEMP_DIR"
mkdir "$TEMP_DIR"

# 2. Sync Files from Replit to Temp
echo "📂 Copying current core files..."
tar -cf - \
    --exclude="./$TEMP_DIR" \
    --exclude='./.git' \
    --exclude='./node_modules' \
    --exclude='./dist' \
    --exclude='./.replit' \
    --exclude='./.env' \
    --exclude='./tools' \
    --exclude='./attached_assets' \
    . | (cd "$TEMP_DIR" && tar -xf -)

# 3. 🛡️ SANITIZE: Remove Enterprise/Private modules
echo "🛡️  Removing Enterprise features..."
rm -rf "$TEMP_DIR/src/ee"
rm -rf "$TEMP_DIR/server/ee"
rm -f "$TEMP_DIR/src/index-ee.ts"
rm -f "$TEMP_DIR/server/index-ee.ts"

# 4. Adjust package.json (Sanitizing start command)
if [ -f "$TEMP_DIR/package.json" ]; then
    sed -i 's/index-ee.js/index.js/g' "$TEMP_DIR/package.json"
fi

# 5. 🔥 THE RESET: Initialize a NEW Git repo locally
# This creates a brand new timeline with NO previous commits.
echo "✨ Creating brand new Git history..."
cd "$TEMP_DIR"
git init
git add .
git commit -m "Initial Open Source Release - FairSign v1.0.0"
git branch -M main
git remote add origin "$PUBLIC_REPO_URL"

# 6. Force Push
# This overwrites ALL previous history on GitHub with your clean commit.
echo "📤 Overwriting GitHub with clean history..."
git push -u origin main --force

echo "✅ Success! Your GitHub history is now 100% clean and branded as FairSign."
