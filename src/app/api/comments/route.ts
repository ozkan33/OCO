import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import { getUserFromToken } from '../../../../lib/apiAuth';
import { logger } from '../../../../lib/logger';

// Helper function to ensure scorecard exists in database
async function ensureScorecardInDatabase(scorecardId: string, user: any, request: Request) {
  // Check if it's a local scorecard
  if (scorecardId.startsWith('scorecard_')) {
    const { searchParams } = new URL(request.url);
    const scorecardDataParam = searchParams.get('scorecard_data');

    if (!scorecardDataParam) {
      throw new Error('Scorecard data required for migration');
    }

    let scorecardData;
    try {
      scorecardData = JSON.parse(decodeURIComponent(scorecardDataParam));
    } catch {
      throw new Error('Invalid scorecard data format');
    }

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
      throw createError;
    }

    return newScorecard;
  }

  // Verify database scorecard exists and belongs to user
  const { data: scorecard, error } = await supabaseAdmin
    .from('user_scorecards')
    .select('id, title, data')
    .eq('id', scorecardId)
    .eq('user_id', user.id)
    .single();

  if (error || !scorecard) {
    throw new Error('Scorecard not found or access denied');
  }

  return scorecard;
}

// GET /api/comments - Get comments for a specific scorecard
export async function GET(request: Request) {
  logger.debug('📥 GET /api/comments called');
  
  try {
    const user = await getUserFromToken(request);
    const { searchParams } = new URL(request.url);
    const scorecardId = searchParams.get('scorecard_id');
    
    logger.debug('🎯 Scorecard ID:', scorecardId);

    if (!scorecardId) {
      logger.error('❌ Missing scorecard_id parameter');
      return NextResponse.json({ error: 'Scorecard ID is required' }, { status: 400 });
    }

    // Handle local scorecards - return empty array since they can't have database comments
    if (scorecardId.startsWith('scorecard_')) {
      logger.debug('📝 Local scorecard detected, returning empty comments');
      return NextResponse.json([]);
    }

    // Verify scorecard exists and belongs to user
    try {
      await ensureScorecardInDatabase(scorecardId, user, request);
    } catch (error) {
      logger.error('❌ Scorecard verification failed:', error);
      return NextResponse.json({ error: 'Scorecard not found or access denied' }, { status: 404 });
    }

    logger.debug('🔍 Querying comments from database...');
    const { data: comments, error } = await supabaseAdmin
      .from('comments')
      .select('*')
      .eq('scorecard_id', scorecardId)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('❌ Database error fetching comments:', error);
      return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
    }

    logger.debug('✅ Comments fetched successfully:', comments?.length || 0, 'comments');
    return NextResponse.json(comments);
  } catch (error) {
    logger.error('❌ Error in GET /api/comments:', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

// POST /api/comments - Create a new comment with auto-migration
export async function POST(request: Request) {
  logger.debug('📤 POST /api/comments called');
  
  try {
    logger.debug('🔐 Authenticating user...');
    const user = await getUserFromToken(request);
    
    logger.debug('📋 Parsing request body...');
    const body = await request.json();
    logger.debug('📋 Request body:', body);
    
    const { scorecard_id, user_id: row_id, text, scorecard_data } = body;
    
    logger.debug('🔍 Validating required fields...');
    logger.debug('  - scorecard_id:', scorecard_id);
    logger.debug('  - row_id:', row_id);
    logger.debug('  - text:', text);
    logger.debug('  - has_scorecard_data:', !!scorecard_data);

    if (!scorecard_id || !row_id || !text) {
      logger.error('❌ Missing required fields');
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Ensure scorecard exists in database (migrate if necessary)
    let actualScorecard;
    try {
      if (scorecard_id.startsWith('scorecard_')) {
        if (!scorecard_data) {
          logger.error('❌ Scorecard data required for migration');
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
          logger.error('❌ Failed to migrate scorecard:', actualScorecard.error);
          return NextResponse.json({ 
            error: 'Failed to migrate scorecard to database' 
          }, { status: 500 });
        }
        
        logger.debug('✅ Scorecard migrated successfully:', actualScorecard.data.id);
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
          logger.error('❌ Scorecard not found or access denied:', error);
          return NextResponse.json({ 
            error: 'Scorecard not found or access denied' 
          }, { status: 404 });
        }
        
        actualScorecard = scorecard;
      }
    } catch (error) {
      logger.error('❌ Scorecard verification/migration failed:', error);
      return NextResponse.json({ 
        error: 'Failed to process scorecard' 
      }, { status: 500 });
    }

    logger.debug('💾 Attempting to insert comment into database...');
    const insertData = {
      scorecard_id: actualScorecard.id,
      user_id: user.id,
      row_id: row_id.toString(),
      text: text.trim(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    logger.debug('📝 Insert data:', insertData);

    const { data: comment, error } = await supabaseAdmin
      .from('comments')
      .insert([insertData])
      .select()
      .single();

    if (error) {
      logger.error('❌ Database error creating comment:', error);
      logger.error('❌ Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
    }

    logger.debug('✅ Comment created successfully:', comment);

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

    logger.debug('📤 Returning comment with migration info:', response);
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    logger.error('❌ Error in POST /api/comments:', error);
    logger.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 