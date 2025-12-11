import { NextResponse } from 'next/server';
import { proxyToBackend } from '@/lib/api-proxy';

// This should match the expected structure from your Python backend
interface ApiProcessedProject {
  id: string;
  owner: string;
  repo: string;
  name: string;
  repo_type: string;
  submittedAt: number;
  language: string;
}
// Payload for deleting a project cache
interface DeleteProjectCachePayload {
  owner: string;
  repo: string;
  repo_type: string;
  language: string;
}

/** Type guard to validate DeleteProjectCachePayload at runtime */
function isDeleteProjectCachePayload(obj: unknown): obj is DeleteProjectCachePayload {
  return (
    obj != null &&
    typeof obj === 'object' &&
    'owner' in obj && typeof (obj as Record<string, unknown>).owner === 'string' && ((obj as Record<string, unknown>).owner as string).trim() !== '' &&
    'repo' in obj && typeof (obj as Record<string, unknown>).repo === 'string' && ((obj as Record<string, unknown>).repo as string).trim() !== '' &&
    'repo_type' in obj && typeof (obj as Record<string, unknown>).repo_type === 'string' && ((obj as Record<string, unknown>).repo_type as string).trim() !== '' &&
    'language' in obj && typeof (obj as Record<string, unknown>).language === 'string' && ((obj as Record<string, unknown>).language as string).trim() !== ''
  );
}


export async function GET() {
  try {
    const response = await proxyToBackend('/api/processed_projects', {
      method: 'GET'
    });

    if (!response.ok) {
      // Try to parse error from backend, otherwise use status text
      let errorBody = { error: `Failed to fetch from Python backend: ${response.statusText}` };
      try {
        errorBody = await response.json();
      } catch {
        // If parsing JSON fails, errorBody will retain its default value
        // The error from backend is logged in the next line anyway
      }
      console.error(`Error from Python backend: ${response.status} - ${JSON.stringify(errorBody)}`);
      return NextResponse.json(errorBody, { status: response.status });
    }

    const projects: ApiProcessedProject[] = await response.json();
    return NextResponse.json(projects);

  } catch (error: unknown) {
    console.error('Network or other error when fetching projects:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json(
      { error: `Failed to connect to the Python backend. ${message}` },
      { status: 503 } // Service Unavailable
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!isDeleteProjectCachePayload(body)) {
      return NextResponse.json(
        { error: 'Invalid request body: owner, repo, repo_type, and language are required and must be non-empty strings.' },
        { status: 400 }
      );
    }
    const { owner, repo, repo_type, language } = body;
    const params = new URLSearchParams({ owner, repo, repo_type, language });
    const response = await proxyToBackend(`/api/wiki_cache?${params}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      let errorBody = { error: response.statusText };
      try {
        errorBody = await response.json();
      } catch {}
      console.error(`Error deleting project cache: ${response.status} - ${JSON.stringify(errorBody)}`);
      return NextResponse.json(errorBody, { status: response.status });
    }
    return NextResponse.json({ message: 'Project deleted successfully' });
  } catch (error: unknown) {
    console.error('Error in DELETE /api/wiki/projects:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: `Failed to delete project: ${message}` }, { status: 500 });
  }
}
