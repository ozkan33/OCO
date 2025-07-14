// Simple test to check environment variables (no dotenv needed)
console.log('=== Environment Variables Check ===');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'UNDEFINED');
console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'UNDEFINED');
console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'SET' : 'UNDEFINED');
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'UNDEFINED');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'SET' : 'UNDEFINED');
console.log('=== End Check ==='); 