import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getPatientSummary, formatPatientSummaryForLogging } from '@/lib/patient-summary';
import { buildJourneyRoadmapPrompt, buildPatientSummaryPrompt } from '@/lib/prompt-builder';
import { generateMedicalSummary } from '@/lib/gemini';

/**
 * POST /api/ai-summary
 * 
 * Generates a comprehensive AI medical summary for the authenticated user.
 * This endpoint:
 * 1. Authenticates the request using Supabase session
 * 2. Fetches all patient medical data
 * 3. Builds a professional medical prompt
 * 4. Calls Gemini API to generate the summary
 * 5. Returns the markdown summary
 * 
 * Security:
 * - Requires valid Supabase session token
 * - Only returns data for the authenticated user
 * - API key never exposed to frontend
 */

export async function POST(request: NextRequest) {
  try {
    // Get authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7); // Remove "Bearer " prefix

    // Verify token and get user ID using Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase environment variables');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    // Get the authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('Authentication error:', authError);
      return NextResponse.json(
        { error: 'Unauthorized - invalid or expired session' },
        { status: 401 }
      );
    }

    const userId = user.id;
    console.log(`Generating summary for user: ${userId}`);

    // Fetch patient summary data using the request-scoped Supabase client
    console.log('Fetching patient summary data...');
    const patientSummary = await getPatientSummary(userId, supabase);

    // Check if we have meaningful data
    if (!patientSummary.profile) {
      console.error('Patient profile missing for user:', userId);
      try {
        console.error('Fetched summary:', formatPatientSummaryForLogging(patientSummary));
      } catch (e) {
        console.error('Failed to format patient summary for logging', e);
      }
      return NextResponse.json(
        { error: 'Patient profile not found' },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));

    // Build the prompt for Gemini
    console.log('Building prompt for Gemini...');
    const prompt = body.mode === 'journey-roadmap'
      ? buildJourneyRoadmapPrompt(patientSummary)
      : buildPatientSummaryPrompt(patientSummary);

    // Generate the summary using Gemini
    console.log('Calling Gemini API...');
    const summary = await generateMedicalSummary(prompt);

    // Return the summary
    return NextResponse.json(
      {
        success: true,
        summary,
        generatedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in /api/ai-summary:', error);

    // Determine appropriate error response
    if (error instanceof Error) {
      if (error.message.includes('Unauthorized') || error.message.includes('invalid')) {
        return NextResponse.json(
          { error: error.message },
          { status: 401 }
        );
      }
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: error.message },
          { status: 404 }
        );
      }
      if (error.message.includes('Gemini')) {
        return NextResponse.json(
          { error: 'Failed to generate summary with AI service. Please try again.' },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS handler for CORS
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
