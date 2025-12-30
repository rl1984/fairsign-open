#!/bin/bash

# ---------------- CONFIGURATION ----------------
# ⚠️ REPLACE THIS with your Private Repo URL
PRIVATE_REPO_URL="https://github.com/rl1984/fairsign.git"
TEMP_DIR="temp_private_build"

echo "🚀 Starting PRIVATE (Enterprise) Publication..."

# 1. Clean up old builds
rm -rf "$TEMP_DIR"

# 2. Clone the Private Repo
echo "📥 Cloning private repo..."
git clone "$PRIVATE_REPO_URL" "$TEMP_DIR"

# Check if clone worked (or create if empty)
if [ ! -d "$TEMP_DIR" ]; then
    echo "⚠️  Repo not found or empty. Initializing new folder..."
    mkdir "$TEMP_DIR"
    cd "$TEMP_DIR"
    git init
    git remote add origin "$PRIVATE_REPO_URL"
    cd ..
fi

# 3. Clean the target directory safely
# We wipe the folder to ensure deleted files in Replit are removed from GitHub too
echo "🧼 Cleaning target directory..."
cd "$TEMP_DIR"
# Delete everything except .git
ls -A | grep -v ".git" | xargs rm -rf
cd ..

# 4. Sync ALL Files
# Note: We do NOT exclude 'src/ee' or 'server/ee' here.
# We only exclude build artifacts and temp folders.
echo "📂 Syncing FULL Enterprise codebase..."
tar -cf - \
    --exclude="./$TEMP_DIR" \
    --exclude='./temp_oss_build' \
    --exclude='./.git' \
    --exclude='./node_modules' \
    --exclude='./dist' \
    --exclude='./.replit' \
    --exclude='./.env' \
    --exclude='./attached_assets' \
    . | (cd "$TEMP_DIR" && tar -xf -)

# 5. No Sanitization Needed
# Since this is the private repo, we WANT the 'ee' folders and the original package.json.
echo "✅ Keeping Enterprise features intact."

# 6. Push to GitHub
echo "📤 Pushing to Private GitHub..."
cd "$TEMP_DIR"
git add -A
git commit -m "Release: Update Private Enterprise Version"
git branch -M main

# Force push to make it an exact mirror of Replit
git push -u origin main --force

echo "🔒 Success! Your Private Enterprise repo is up to date."