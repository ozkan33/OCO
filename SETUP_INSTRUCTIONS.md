# Setup Instructions

## Environment Configuration

Your auto-save functionality is not working because the `.env.local` file is missing. Here's how to fix it:

### Step 1: Create Environment File

1. In the `vendor-portal` folder, create a new file called `.env.local`
2. Copy the content from `env-template.txt` into `.env.local`
3. Replace the placeholder values with your actual Supabase credentials

### Step 2: Get Supabase Credentials

Go to your Supabase dashboard and get these values:

1. **NEXT_PUBLIC_SUPABASE_URL**: Settings → API → Project URL
2. **NEXT_PUBLIC_SUPABASE_ANON_KEY**: Settings → API → Project API keys → anon public
3. **SUPABASE_SERVICE_ROLE_KEY**: Settings → API → Project API keys → service_role (secret)
4. **DATABASE_URL**: Settings → Database → Connection string → URI
5. **JWT_SECRET**: Create any secure random string (e.g., use an online generator)

### Step 3: Restart Development Server

After creating the `.env.local` file:

1. Stop the current development server (Ctrl+C)
2. Run `npm run dev` again
3. The logs should no longer show "DATABASE_URL: undefined"

### Step 4: Test Auto-Save

1. Create a new scorecard or select an existing one
2. Make changes to the data
3. You should see "Unsaved changes" indicator
4. Changes should automatically save after a few seconds
5. The indicator should change to "All changes saved"

## Retail Price Display

The retail price column has been updated to:
- Display values with $ prefix (e.g., $25.99)
- Show $ symbol in the input field during editing
- Handle empty/null values properly
- Accept only numeric input with decimal places

If you're still not seeing the $ symbol, try:
1. Add a value to the Retail Price column (e.g., type "25.99")
2. Press Enter or click outside the cell
3. The cell should display "$25.99" 