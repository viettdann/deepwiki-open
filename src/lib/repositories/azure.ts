// Azure DevOps API functions
import { AzureRepoInfo } from '@/types/wiki';

export const createAzureHeaders = (azureToken: string): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (azureToken) {
    const encoded = btoa(`:${azureToken}`);
    headers['Authorization'] = `Basic ${encoded}`;
  }
  return headers;
};

export const parseAzureRepoUrl = (repoUrl: string | null): AzureRepoInfo | null => {
  if (!repoUrl) return null;

  try {
    const url = new URL(repoUrl);
    const segments = url.pathname.split('/').filter(Boolean);
    let organization = '';
    let project = '';
    let repository = '';

    if (url.hostname.includes('dev.azure.com')) {
      organization = segments[0];
      project = segments[1];
      const repoIndex = segments.findIndex((seg) => seg.toLowerCase() === '_git');
      repository = repoIndex >= 0 && segments[repoIndex + 1] ? segments[repoIndex + 1] : segments[3];

      return organization && project && repository
        ? {
            organization,
            project,
            repository,
            baseUrl: `${url.protocol}//${url.hostname}`,
          }
        : null;
    } else if (url.hostname.includes('visualstudio.com')) {
      // Legacy format: https://account.visualstudio.com/Project/_git/Repo
      const parts = url.hostname.split('.')[0];
      organization = parts;
      project = segments[0];
      const repoIndex = segments.findIndex((seg) => seg.toLowerCase() === '_git');
      repository = repoIndex >= 0 && segments[repoIndex + 1] ? segments[repoIndex + 1] : segments[1];

      return organization && project && repository
        ? {
            organization,
            project,
            repository,
            baseUrl: `${url.protocol}//${url.hostname}`,
          }
        : null;
    }

    return null;
  } catch (error) {
    console.error('Error parsing Azure repo URL:', error);
    return null;
  }
};

export const fetchAzureFileTree = async (
  azureInfo: AzureRepoInfo,
  token: string
): Promise<{ value: Array<{ type: string; path: string }> }> => {
  const apiUrl = `${azureInfo.baseUrl}/${azureInfo.organization}/${azureInfo.project}/_apis/git/repositories/${azureInfo.repository}/items?recursionLevel=Full&api-version=6.0`;

  const response = await fetch(apiUrl, {
    headers: createAzureHeaders(token)
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Azure DevOps API error (${response.status}): ${errorData}`);
  }

  return response.json();
};

export const fetchAzureReadme = async (
  azureInfo: AzureRepoInfo,
  token: string
): Promise<string> => {
  const apiUrl = `${azureInfo.baseUrl}/${azureInfo.organization}/${azureInfo.project}/_apis/git/repositories/${azureInfo.repository}/items?path=README.md&api-version=6.0`;

  const response = await fetch(apiUrl, {
    headers: createAzureHeaders(token)
  });

  if (response.ok) {
    return response.text();
  }
  return '';
};