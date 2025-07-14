@echo off
echo Backing up current .env.local file...
copy .env.local .env.local.backup
echo Replacing .env.local with fixed version...
copy env-fixed.txt .env.local
echo Done! Environment file has been fixed.
echo Please restart your development server with: npm run dev 