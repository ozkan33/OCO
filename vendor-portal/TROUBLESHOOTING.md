# Troubleshooting Environment Variables

## Problem: DATABASE_URL: undefined

If you're seeing `DATABASE_URL: undefined` in the logs, here are the most common causes:

### 1. Check .env.local File Format

Your `.env.local` file should look exactly like this (no spaces around =):

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
JWT_SECRET=your-secret-key-here
DATABASE_URL=postgresql://postgres:[password]@db.your-project.supabase.co:5432/postgres
```

### 2. Common Formatting Issues

❌ **Wrong:**
```
DATABASE_URL = postgresql://...  (spaces around =)
DATABASE_URL=postgresql://...    (missing quotes for complex URLs)
```

✅ **Correct:**
```
DATABASE_URL=postgresql://postgres:password@db.project.supabase.co:5432/postgres
```

### 3. Test Environment Variables

Run this command in the vendor-portal directory to test:
```bash
node debug-env.js
```

This will show you which variables are SET or UNDEFINED.

### 4. Restart Development Server

After making changes to `.env.local`:
1. Stop the server (Ctrl+C)
2. Run `npm run dev` again
3. Check the logs - you should no longer see "DATABASE_URL: undefined"

### 5. Check File Location

Make sure `.env.local` is in the `vendor-portal` directory, not the root directory.

### 6. Database URL Format

Your DATABASE_URL should be in this format:
```
postgresql://postgres:[PASSWORD]@db.[PROJECT_ID].supabase.co:5432/postgres
```

Get this from: Supabase Dashboard → Settings → Database → Connection string → URI

### 7. No Quotes Needed

Don't wrap values in quotes unless they contain spaces:
```
# Wrong
DATABASE_URL="postgresql://..."

# Right
DATABASE_URL=postgresql://...
``` 