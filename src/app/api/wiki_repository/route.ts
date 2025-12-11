import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');
    const repoType = searchParams.get('repo_type');
    const authorizationCode = searchParams.get('authorization_code');

    if (!owner || !repo || !repoType) {
      return NextResponse.json(
        { error: 'Missing required parameters: owner, repo, repo_type' },
        { status: 400 }
      );
    }

    // Get API key from environment
    const apiKey = process.env.DEEPWIKI_FRONTEND_API_KEY;
    if (!apiKey) {
      console.error('DEEPWIKI_FRONTEND_API_KEY is not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Build the API URL
    const baseUrl = process.env.NEXT_PUBLIC_SERVER_BASE_URL || 'http://localhost:8001';
    const apiUrl = new URL(`${baseUrl}/api/wiki_repository`);

    // Add query parameters
    apiUrl.searchParams.append('owner', owner);
    apiUrl.searchParams.append('repo', repo);
    apiUrl.searchParams.append('repo_type', repoType);

    if (authorizationCode) {
      apiUrl.searchParams.append('authorization_code', authorizationCode);
    }

    const response = await fetch(apiUrl.toString(), {
      method: 'DELETE',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.detail || 'Failed to delete repository data' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error deleting repository data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}