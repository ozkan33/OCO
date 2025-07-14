import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

// Helper function to get user from Supabase token in cookies
async function getUserFromToken(request: Request) {
  console.log('🔍 Starting getUserFromToken...');
  
  const cookieHeader = request.headers.get('Cookie') || request.headers.get('cookie') || '';
  console.log('🍪 Cookie header:', cookieHeader ? 'Present' : 'Missing');
  
  const match = cookieHeader.match(/supabase-access-token=([^;]+)/);
  const token = match ? match[1] : null;
  console.log('🎫 Token extracted:', token ? 'Present' : 'Missing');

  if (!token) {
    console.error('❌ No token found in cookies');
    throw new Error('No token found');
  }

  try {
    console.log('🔐 Attempting to verify token with Supabase...');
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error) {
      console.error('❌ Supabase auth error:', error);
      throw new Error('Invalid token');
    }
    
    if (!user) {
      console.error('❌ No user returned from Supabase');
      throw new Error('Invalid token');
    }
    
    console.log('✅ User authenticated successfully:', user.id);
    return user;
  } catch (error) {
    console.error('❌ Token verification failed:', error);
    throw new Error('Invalid token');
  }
}

// Helper function to migrate local scorecard to database
async function migrateLocalScorecard(localScorecardId: string, user: any, request: Request) {
  console.log('🔄 Starting local scorecard migration for ID:', localScorecardId);
  
  try {
    // Get the scorecard data from the request body or localStorage-like structure
    // In a real scenario, we'd need to get this from the client
    const { searchParams } = new URL(request.url);
    const scorecardDataParam = searchParams.get('scorecard_data');
    
    if (!scorecardDataParam) {
      throw new Error('Scorecard data required for migration');
    }
    
    const scorecardData = JSON.parse(decodeURIComponent(scorecardDataParam));
    console.log('📊 Scorecard data for migration:', scorecardData);
    
    // Create the scorecard in the database
    const { data: newScorecard, error: createError } = await supabaseAdmin
      .from('user_scorecards')
      .insert({
        user_id: user.id,
        title: scorecardData.name || 'Migrated Scorecard',
        data: {
          columns: scorecardData.columns || [],
          rows: scorecardData.rows || []
        },
        is_draft: true
      })
      .select()
      .single();
    
    if (createError) {
      console.error('❌ Failed to create scorecard during migration:', createError);
      throw createError;
    }
    
    console.log('✅ Scorecard migrated successfully:', newScorecard.id);
    return newScorecard;
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Helper function to ensure scorecard exists in database
async function ensureScorecardInDatabase(scorecardId: string, user: any, request: Request) {
  console.log('🔍 Ensuring scorecard exists in database:', scorecardId);
  
  // Check if it's a local scorecard
  if (scorecardId.startsWith('scorecard_')) {
    console.log('🔄 Local scorecard detected, initiating migration...');
    return await migrateLocalScorecard(scorecardId, user, request);
  }
  
  // Verify database scorecard exists and belongs to user
  const { data: scorecard, error } = await supabaseAdmin
    .from('user_scorecards')
    .select('id, title, data')
    .eq('id', scorecardId)
    .eq('user_id', user.id)
    .single();
  
  if (error || !scorecard) {
    console.error('❌ Scorecard not found or access denied:', error);
    throw new Error('Scorecard not found or access denied');
  }
  
  console.log('✅ Database scorecard verified:', scorecard.title);
  return scorecard;
}

// GET /api/comments - Get comments for a specific scorecard
export async function GET(request: Request) {
  console.log('📥 GET /api/comments called');
  
  try {
    const user = await getUserFromToken(request);
    const { searchParams } = new URL(request.url);
    const scorecardId = searchParams.get('scorecard_id');
    
    console.log('🎯 Scorecard ID:', scorecardId);

    if (!scorecardId) {
      console.error('❌ Missing scorecard_id parameter');
      return NextResponse.json({ error: 'Scorecard ID is required' }, { status: 400 });
    }

    // Handle local scorecards - return empty array since they can't have database comments
    if (scorecardId.startsWith('scorecard_')) {
      console.log('📝 Local scorecard detected, returning empty comments');
      return NextResponse.json([]);
    }

    // Verify scorecard exists and belongs to user
    try {
      await ensureScorecardInDatabase(scorecardId, user, request);
    } catch (error) {
      console.error('❌ Scorecard verification failed:', error);
      return NextResponse.json({ error: 'Scorecard not found or access denied' }, { status: 404 });
    }

    console.log('🔍 Querying comments from database...');
    const { data: comments, error } = await supabaseAdmin
      .from('comments')
      .select('*')
      .eq('scorecard_id', scorecardId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Database error fetching comments:', error);
      return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
    }

    console.log('✅ Comments fetched successfully:', comments?.length || 0, 'comments');
    return NextResponse.json(comments);
  } catch (error) {
    console.error('❌ Error in GET /api/comments:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// POST /api/comments - Create a new comment with auto-migration
export async function POST(request: Request) {
  console.log('📤 POST /api/comments called');
  
  try {
    console.log('🔐 Authenticating user...');
    const user = await getUserFromToken(request);
    
    console.log('📋 Parsing request body...');
    const body = await request.json();
    console.log('📋 Request body:', body);
    
    const { scorecard_id, user_id: row_id, text, scorecard_data } = body;
    
    console.log('🔍 Validating required fields...');
    console.log('  - scorecard_id:', scorecard_id);
    console.log('  - row_id:', row_id);
    console.log('  - text:', text);
    console.log('  - has_scorecard_data:', !!scorecard_data);

    if (!scorecard_id || !row_id || !text) {
      console.error('❌ Missing required fields');
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Ensure scorecard exists in database (migrate if necessary)
    let actualScorecard;
    try {
      if (scorecard_id.startsWith('scorecard_')) {
        if (!scorecard_data) {
          console.error('❌ Scorecard data required for migration');
          return NextResponse.json({ 
            error: 'Scorecard data required for local scorecard migration' 
          }, { status: 400 });
        }
        
        // Migrate local scorecard to database
        actualScorecard = await supabaseAdmin
          .from('user_scorecards')
          .insert({
            user_id: user.id,
            title: scorecard_data.name || 'Migrated Scorecard',
            data: {
              columns: scorecard_data.columns || [],
              rows: scorecard_data.rows || []
            },
            is_draft: true
          })
          .select()
          .single();
        
        if (actualScorecard.error) {
          console.error('❌ Failed to migrate scorecard:', actualScorecard.error);
          return NextResponse.json({ 
            error: 'Failed to migrate scorecard to database' 
          }, { status: 500 });
        }
        
        console.log('✅ Scorecard migrated successfully:', actualScorecard.data.id);
        actualScorecard = actualScorecard.data;
      } else {
        // Verify database scorecard
        const { data: scorecard, error } = await supabaseAdmin
          .from('user_scorecards')
          .select('id, title, data')
          .eq('id', scorecard_id)
          .eq('user_id', user.id)
          .single();
        
        if (error || !scorecard) {
          console.error('❌ Scorecard not found or access denied:', error);
          return NextResponse.json({ 
            error: 'Scorecard not found or access denied' 
          }, { status: 404 });
        }
        
        actualScorecard = scorecard;
      }
    } catch (error) {
      console.error('❌ Scorecard verification/migration failed:', error);
      return NextResponse.json({ 
        error: 'Failed to process scorecard' 
      }, { status: 500 });
    }

    console.log('💾 Attempting to insert comment into database...');
    const insertData = {
      scorecard_id: actualScorecard.id,
      user_id: user.id,
      row_id: row_id.toString(),
      text: text.trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    console.log('📝 Insert data:', insertData);

    const { data: comment, error } = await supabaseAdmin
      .from('comments')
      .insert([insertData])
      .select()
      .single();

    if (error) {
      console.error('❌ Database error creating comment:', error);
      console.error('❌ Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
    }

    console.log('✅ Comment created successfully:', comment);

    // Return comment with migration info if applicable
    const response = {
      ...comment,
      row_id: row_id,
      migrated_scorecard: scorecard_id.startsWith('scorecard_') ? {
        old_id: scorecard_id,
        new_id: actualScorecard.id,
        title: actualScorecard.title
      } : null
    };

    console.log('📤 Returning comment with migration info:', response);
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('❌ Error in POST /api/comments:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 