// Pure utility functions for wiki functionality
import { RequestBody } from '@/types/wiki';

export const getCacheKey = (
  owner: string,
  repo: string,
  repoType: string,
  language: string,
  isComprehensive: boolean = true
): string => {
  return `deepwiki_cache_${repoType}_${owner}_${repo}_${language}_${isComprehensive ? 'comprehensive' : 'concise'}`;
};

export const addTokensToRequestBody = (
  requestBody: RequestBody,
  token: string,
  repoType: string,
  provider: string = '',
  model: string = '',
  isCustomModel: boolean = false,
  customModel: string = '',
  language: string = 'en',
  excludedDirs?: string,
  excludedFiles?: string,
  includedDirs?: string,
  includedFiles?: string
): void => {
  if (token !== '') {
    requestBody.token = token;
  }
  requestBody.provider = provider;
  requestBody.model = model;
  if (isCustomModel && customModel) {
    requestBody.custom_model = customModel;
  }
  requestBody.language = language;
  if (excludedDirs) {
    requestBody.excluded_dirs = excludedDirs;
  }
  if (excludedFiles) {
    requestBody.excluded_files = excludedFiles;
  }
  if (includedDirs) {
    requestBody.included_dirs = includedDirs;
  }
  if (includedFiles) {
    requestBody.included_files = includedFiles;
  }
};

export const generateFileUrl = (
  repoInfo: { type: string; repoUrl?: string; owner?: string; repo?: string; repoPath?: string },
  filePath: string,
  defaultBranch?: string
): string => {
  if (repoInfo.type === 'github') {
    const domain = repoInfo.repoUrl ? new URL(repoInfo.repoUrl).hostname : 'github.com';
    const baseUrl = domain === 'github.com' ? 'https://github.com' : `https://${domain}`;
    return `${baseUrl}/${repoInfo.owner}/${repoInfo.repo}/blob/${defaultBranch || 'main'}/${filePath}`;
  } else if (repoInfo.type === 'gitlab') {
    const domain = repoInfo.repoUrl ? new URL(repoInfo.repoUrl).hostname : 'gitlab.com';
    const baseUrl = domain === 'gitlab.com' ? 'https://gitlab.com' : `https://${domain}`;
    return `${baseUrl}/${repoInfo.repoPath}/-/blob/${defaultBranch || 'main'}/${filePath}`;
  } else if (repoInfo.type === 'bitbucket') {
    return `https://bitbucket.org/${repoInfo.repoPath}/src/${defaultBranch || 'main'}/${filePath}`;
  } else if (repoInfo.type === 'azure') {
    return `${repoInfo.repoUrl}?path=${filePath}&version=GB${defaultBranch || 'main'}`;
  }
  return '';
};

export const processWikiContent = (content: string): string => {
  // Process wiki content for display
  if (!content) return '';

  // Clean up the content
  return content
    .replace(/```(\w+)?\n/g, '```$1\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const extractCategories = (pages: Array<{ category?: string }>): Array<{ id: string; title: string }> => {
  // Extract categories from wiki pages
  const categories = new Set<string>();

  pages.forEach(page => {
    if (page.category) {
      categories.add(page.category);
    }
  });

  return Array.from(categories).map(cat => ({
    id: cat,
    title: cat === 'other' ? 'Other' : cat.charAt(0).toUpperCase() + cat.slice(1)
  }));
};

export const filterPagesByImportance = (pages: Array<{ importance: string; id: string }>, importance: 'high' | 'medium' | 'low') => {
  return pages.filter(page => page.importance === importance).map(page => page.id);
};