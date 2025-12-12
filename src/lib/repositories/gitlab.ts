// GitLab API functions

export const createGitlabHeaders = (gitlabToken: string): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (gitlabToken) {
    headers['PRIVATE-TOKEN'] = gitlabToken;
  }
  return headers;
};

export const fetchGitlabProjectInfo = async (
  projectDomain: string,
  projectPath: string,
  token: string
): Promise<{ default_branch: string }> => {
  const validatedUrl = new URL(projectDomain);
  const projectInfoUrl = `${validatedUrl.origin}/api/v4/projects/${encodeURIComponent(projectPath)}`;

  const response = await fetch(projectInfoUrl, {
    headers: createGitlabHeaders(token)
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`GitLab project info error: Status ${response.status}, Response: ${errorData}`);
  }

  return response.json();
};

export const fetchGitlabFileTree = async (
  projectDomain: string,
  projectPath: string,
  token: string
): Promise<Array<{ type: string; path: string }>> => {
  const validatedUrl = new URL(projectDomain);
  const projectInfoUrl = `${validatedUrl.origin}/api/v4/projects/${encodeURIComponent(projectPath)}`;
  const headers = createGitlabHeaders(token);

  const filesData: Array<{ type: string; path: string }> = [];
  let page = 1;
  let morePages = true;

  while (morePages) {
    const apiUrl = `${projectInfoUrl}/repository/tree?recursive=true&per_page=100&page=${page}`;
    const response = await fetch(apiUrl, { headers });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Error fetching GitLab repository structure (page ${page}): ${errorData}`);
    }

    const pageData = await response.json();
    filesData.push(...pageData);

    const nextPage = response.headers.get('x-next-page');
    morePages = !!nextPage;
    page = nextPage ? parseInt(nextPage, 10) : page + 1;
  }

  if (!Array.isArray(filesData) || filesData.length === 0) {
    throw new Error('Could not fetch repository structure. Repository might be empty or inaccessible.');
  }

  return filesData;
};

export const fetchGitlabReadme = async (
  projectDomain: string,
  projectPath: string,
  token: string
): Promise<string> => {
  const validatedUrl = new URL(projectDomain);
  const projectInfoUrl = `${validatedUrl.origin}/api/v4/projects/${encodeURIComponent(projectPath)}`;
  const readmeUrl = `${projectInfoUrl}/repository/files/README.md/raw`;

  const response = await fetch(readmeUrl, {
    headers: createGitlabHeaders(token)
  });

  if (response.ok) {
    return response.text();
  }
  return '';
};