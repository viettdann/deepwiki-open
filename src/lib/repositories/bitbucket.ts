// Bitbucket API functions

export const createBitbucketHeaders = (bitbucketToken: string): HeadersInit => {
  const headers: HeadersInit = {
    'Accept': 'application/json',
  };
  if (bitbucketToken) {
    headers['Authorization'] = `Bearer ${bitbucketToken}`;
  }
  return headers;
};

export const fetchBitbucketRepoInfo = async (
  repoPath: string,
  token: string
): Promise<{ mainbranch: { name: string } }> => {
  const encodedRepoPath = encodeURIComponent(repoPath);
  const projectInfoUrl = `https://api.bitbucket.org/2.0/repositories/${encodedRepoPath}`;

  const response = await fetch(projectInfoUrl, {
    headers: createBitbucketHeaders(token)
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Bitbucket repository info error: Status ${response.status}, Response: ${errorData}`);
  }

  return response.json();
};

export const fetchBitbucketFileTree = async (
  repoPath: string,
  defaultBranch: string,
  token: string
): Promise<{ values: Array<{ type: string; path: string }> }> => {
  const encodedRepoPath = encodeURIComponent(repoPath);
  const apiUrl = `https://api.bitbucket.org/2.0/repositories/${encodedRepoPath}/src/${defaultBranch}/?recursive=true&per_page=100`;

  const response = await fetch(apiUrl, {
    headers: createBitbucketHeaders(token)
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Bitbucket API error (${response.status}): ${errorData}`);
  }

  return response.json();
};

export const fetchBitbucketReadme = async (
  repoPath: string,
  defaultBranch: string,
  token: string
): Promise<string> => {
  const encodedRepoPath = encodeURIComponent(repoPath);
  const response = await fetch(
    `https://api.bitbucket.org/2.0/repositories/${encodedRepoPath}/src/${defaultBranch}/README.md`,
    {
      headers: createBitbucketHeaders(token)
    }
  );

  if (response.ok) {
    return response.text();
  }
  return '';
};