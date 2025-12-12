// Consolidated Wiki Types for RepoWikiClient refactoring

export interface WikiSection {
  id: string;
  title: string;
  pages: string[];
  subsections?: string[];
}

export interface WikiPage {
  id: string;
  title: string;
  content: string;
  filePaths: string[];
  importance: 'high' | 'medium' | 'low';
  relatedPages: string[];
  parentId?: string;
  isSection?: boolean;
  children?: string[];
}

export interface WikiStructure {
  id: string;
  title: string;
  description: string;
  pages: WikiPage[];
  sections: WikiSection[];
  rootSections: string[];
}

// Azure DevOps specific types
export interface AzureRepoInfo {
  organization: string;
  project: string;
  repository: string;
  baseUrl: string;
}

// Request body type for API calls
export type RequestBody = {
  [key: string]: unknown;
};

// Model configuration types
export interface ModelConfig {
  provider: string;
  model: string;
  isCustomModel: boolean;
  customModel: string;
}

// Repository access types
export interface RepositoryCredentials {
  token?: string;
  username?: string;
  password?: string;
}

// Generation status types
export interface GenerationStatus {
  isGenerating: boolean;
  pagesInProgress: string[];
  error?: string;
}