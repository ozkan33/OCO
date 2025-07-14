# PowerShell script to fix .env.local file
Write-Host "Fixing .env.local file..."

$envContent = @"
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://nwhdvbysalfyysncjqbz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53aGR2YnlzYWxmeXlzbmNqcWJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIzODU5MjcsImV4cCI6MjA2Nzk2MTkyN30.cvY1XoNEuVGUToMCJ9Ud6
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53aGR2YnlzYWxmeXlzbmNqcWJ6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjM4NTkyNywiZXhwIjoyMDY3OTYxOTI3fQ.6IQOM0aXrx8KaqZ2aJ5LMK7DfCRt-PnJhkHbze8NFw0
JWT_SECRET=khsdhjdf3024890hjkdslkg00klasdaooasdoportnmv029838308948902348dhfkjdsfh91123jhdkjhfasdhjahsjld01100281hhpksdxwza
DATABASE_URL=postgresql://postgres:I6wDUi*k3em@jjvE@db.nwhdvbysalfyysncjqbz.supabase.co:5432/postgres
"@

$envContent | Out-File -FilePath ".env.local" -Encoding UTF8 -NoNewline
Write-Host "Environment file has been fixed!"
Write-Host "Please restart your development server." 