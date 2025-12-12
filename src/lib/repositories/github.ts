// GitHub API functions

export const createGithubHeaders = (githubToken: string): HeadersInit => {
  const headers: HeadersInit = {
    'Accept': 'application/vnd.github.v3+json'
  };
  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  }
  return headers;
};

export const getGithubApiUrl = (repoUrl: string | null): string => {
  if (!repoUrl) {
    return 'https://api.github.com';
  }
  try {
    const url = new URL(repoUrl);
    const hostname = url.hostname;
    if (hostname === 'github.com') {
      return 'https://api.github.com';
    }
    return `${url.protocol}//${hostname}/api/v3`;
  } catch {
    return 'https://api.github.com';
  }
};

export const fetchGithubRepoInfo = async (
  owner: string,
  repo: string,
  token: string,
  repoUrl?: string | null
): Promise<{ default_branch: string } | null> => {
  const githubApiBaseUrl = getGithubApiUrl(repoUrl || null);
  const response = await fetch(`${githubApiBaseUrl}/repos/${owner}/${repo}`, {
    headers: createGithubHeaders(token)
  });

  if (response.ok) {
    const repoData = await response.json();
    return repoData;
  }
  return null;
};

export const fetchGithubFileTree = async (
  owner: string,
  repo: string,
  branch: string,
  token: string,
  repoUrl?: string | null
): Promise<{ tree: Array<{ type: string; path: string }> }> => {
  const githubApiBaseUrl = getGithubApiUrl(repoUrl || null);
  const apiUrl = `${githubApiBaseUrl}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const response = await fetch(apiUrl, {
    headers: createGithubHeaders(token)
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${errorData}`);
  }

  return response.json();
};

export const fetchGithubReadme = async (
  owner: string,
  repo: string,
  token: string,
  repoUrl?: string | null
): Promise<string> => {
  const githubApiBaseUrl = getGithubApiUrl(repoUrl || null);
  const response = await fetch(`${githubApiBaseUrl}/repos/${owner}/${repo}/readme`, {
    headers: createGithubHeaders(token)
  });

  if (response.ok) {
    const readmeData = await response.json();
    return atob(readmeData.content);
  }
  return '';
};