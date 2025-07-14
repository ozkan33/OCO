# Auto-Save Setup Guide

## 🚀 Features Implemented

✅ **Auto-save with debouncing** - Saves every 2 seconds after user stops typing
✅ **Visual status indicators** - Shows saved/saving/unsaved/error states
✅ **Offline support** - Saves to localStorage when offline, syncs when back online
✅ **Version history** - Tracks changes with timestamps
✅ **Before unload warning** - Warns users about unsaved changes
✅ **Real-time sync** - Immediate feedback and optimistic updates
✅ **Error handling** - Retry mechanism for failed saves

## 📋 Setup Instructions

### 1. Run the Supabase Schema

Execute the SQL in `supabase_schema.sql` in your Supabase SQL editor:

```sql
-- This creates the necessary tables:
-- - user_scorecards (main data storage)
-- - scorecard_history (version control)
-- - auto_save_sessions (temporary data)
```

### 2. Enable Row Level Security

The schema automatically enables RLS policies so users can only access their own data.

### 3. Test the System

1. **Login** to your admin dashboard
2. **Create a new scorecard** using the "New Scorecard" button
3. **Add/edit data** in the grid - you'll see auto-save indicators
4. **Go offline** (disable network) - changes save to localStorage
5. **Go back online** - changes sync to Supabase
6. **Refresh the page** - your data persists

## 🎯 How It Works

### Auto-Save Hook (`useAutoSave`)
- **Debounced saves**: Waits 2 seconds after last change
- **Status tracking**: saved | saving | unsaved | error | offline
- **Offline backup**: Saves to localStorage when offline
- **Error handling**: Retries failed saves

### Save Status Components
- **Full status**: Shows detailed save information
- **Compact status**: Minimal icon-based indicator
- **Before unload**: Warns about unsaved changes

### Data Flow
1. User makes changes → Status: "unsaved"
2. After 2 seconds → Status: "saving"
3. Save succeeds → Status: "saved"
4. Save fails → Status: "error" + retry option

## 🔧 Configuration Options

```typescript
const autoSave = useScoreCardAutoSave(scorecardId, data, {
  debounceMs: 2000,           // Wait time before saving
  enableOfflineBackup: true,  // Save to localStorage offline
  onSaveSuccess: () => {},    // Success callback
  onSaveError: (error) => {}, // Error callback
});
```

## 📊 Database Schema

### user_scorecards
- `id` - UUID primary key
- `user_id` - References auth.users(id)
- `title` - Scorecard name
- `data` - JSONB containing columns/rows
- `last_modified` - Auto-updated timestamp
- `version` - Simple versioning

### scorecard_history
- `id` - UUID primary key
- `scorecard_id` - References user_scorecards(id)
- `data` - JSONB snapshot
- `version` - Version number
- `created_at` - Timestamp

### auto_save_sessions
- `id` - UUID primary key
- `user_id` - References auth.users(id)
- `scorecard_id` - References user_scorecards(id)
- `temp_data` - JSONB temporary data
- `expires_at` - Auto-cleanup timestamp

## 🚨 Important Notes

1. **Environment Variables**: Ensure your `.env.local` has correct Supabase credentials
2. **Authentication**: Users must be logged in via Supabase auth
3. **RLS Policies**: Users can only access their own scorecards
4. **Cleanup**: Auto-save sessions auto-expire after 1 hour
5. **Versioning**: Each save creates a history entry

## 🔍 Troubleshooting

### Save Status Stuck on "Saving"
- Check browser network tab for API errors
- Verify Supabase connection
- Check authentication status

### Data Not Persisting
- Verify RLS policies are correct
- Check user authentication
- Ensure proper API endpoints

### Offline Mode Not Working
- Check localStorage permissions
- Verify online/offline event listeners
- Test with browser dev tools offline mode

## 📈 Performance Considerations

- **Debouncing**: Prevents excessive API calls
- **Optimistic updates**: UI updates immediately
- **Lazy loading**: Only loads data when needed
- **Cleanup**: Auto-removes expired sessions

## 🎉 Success!

Your admin dashboard now has:
- ✅ Real-time auto-save
- ✅ Offline support
- ✅ Version history
- ✅ Professional UX
- ✅ Data persistence

Users will never lose their work again! 🎊 