import { useReducer, useCallback } from 'react';
import { WikiStructure, WikiPage } from '@/types/wiki';
import { RepoInfo } from '@/types/repoinfo';

export interface WikiState {
  isLoading: boolean;
  loadingMessage?: string;
  error?: string | null;
  wikiStructure?: WikiStructure;
  currentPageId?: string;
  generatedPages: Record<string, WikiPage>;
  pagesInProgress: Set<string>;
  requestInProgress: boolean;
  currentToken: string;
  effectiveRepoInfo: RepoInfo;
  embeddingError: boolean;
  defaultBranch?: string;
  structureRequestInProgress: boolean;
}

export type WikiAction =
  | { type: 'SET_LOADING'; payload: { loading: boolean; message?: string } }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_WIKI_STRUCTURE'; payload: WikiStructure }
  | { type: 'SET_CURRENT_PAGE'; payload: string | undefined }
  | { type: 'SET_GENERATED_PAGES'; payload: Record<string, WikiPage> }
  | { type: 'UPDATE_PAGE'; payload: { id: string; page: WikiPage } }
  | { type: 'SET_PAGES_IN_PROGRESS'; payload: Set<string> }
  | { type: 'ADD_PAGE_IN_PROGRESS'; payload: string }
  | { type: 'REMOVE_PAGE_IN_PROGRESS'; payload: string }
  | { type: 'SET_REQUEST_IN_PROGRESS'; payload: boolean }
  | { type: 'SET_CURRENT_TOKEN'; payload: string }
  | { type: 'SET_EFFECTIVE_REPO_INFO'; payload: RepoInfo }
  | { type: 'SET_EMBEDDING_ERROR'; payload: boolean }
  | { type: 'SET_DEFAULT_BRANCH'; payload: string }
  | { type: 'SET_STRUCTURE_REQUEST_IN_PROGRESS'; payload: boolean }
  | { type: 'RESET_WIKI_STATE' };

const initialState: WikiState = {
  isLoading: true,
  loadingMessage: undefined,
  error: null,
  wikiStructure: undefined,
  currentPageId: undefined,
  generatedPages: {},
  pagesInProgress: new Set(),
  requestInProgress: false,
  currentToken: '',
  effectiveRepoInfo: {} as RepoInfo,
  embeddingError: false,
  defaultBranch: undefined,
  structureRequestInProgress: false,
};

function wikiReducer(state: WikiState, action: WikiAction): WikiState {
  switch (action.type) {
    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload.loading,
        loadingMessage: action.payload.message,
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
      };

    case 'SET_WIKI_STRUCTURE':
      return {
        ...state,
        wikiStructure: action.payload,
      };

    case 'SET_CURRENT_PAGE':
      return {
        ...state,
        currentPageId: action.payload,
      };

    case 'SET_GENERATED_PAGES':
      return {
        ...state,
        generatedPages: action.payload,
      };

    case 'UPDATE_PAGE':
      return {
        ...state,
        generatedPages: {
          ...state.generatedPages,
          [action.payload.id]: action.payload.page,
        },
      };

    case 'SET_PAGES_IN_PROGRESS':
      return {
        ...state,
        pagesInProgress: action.payload,
      };

    case 'ADD_PAGE_IN_PROGRESS':
      return {
        ...state,
        pagesInProgress: new Set([...state.pagesInProgress, action.payload]),
      };

    case 'REMOVE_PAGE_IN_PROGRESS':
      const newInProgress = new Set(state.pagesInProgress);
      newInProgress.delete(action.payload);
      return {
        ...state,
        pagesInProgress: newInProgress,
      };

    case 'SET_REQUEST_IN_PROGRESS':
      return {
        ...state,
        requestInProgress: action.payload,
      };

    case 'SET_CURRENT_TOKEN':
      return {
        ...state,
        currentToken: action.payload,
      };

    case 'SET_EFFECTIVE_REPO_INFO':
      return {
        ...state,
        effectiveRepoInfo: action.payload,
      };

    case 'SET_EMBEDDING_ERROR':
      return {
        ...state,
        embeddingError: action.payload,
      };

    case 'SET_DEFAULT_BRANCH':
      return {
        ...state,
        defaultBranch: action.payload,
      };

    case 'SET_STRUCTURE_REQUEST_IN_PROGRESS':
      return {
        ...state,
        structureRequestInProgress: action.payload,
      };

    case 'RESET_WIKI_STATE':
      return {
        ...initialState,
        currentToken: state.currentToken,
        effectiveRepoInfo: state.effectiveRepoInfo,
      };

    default:
      return state;
  }
}

export function useWikiState(initialToken: string, initialRepoInfo: RepoInfo) {
  const [state, dispatch] = useReducer(wikiReducer, {
    ...initialState,
    currentToken: initialToken,
    effectiveRepoInfo: initialRepoInfo,
  });

  // Action creators
  const actions = {
    setLoading: useCallback((loading: boolean, message?: string) => {
      dispatch({ type: 'SET_LOADING', payload: { loading, message } });
    }, []),

    setError: useCallback((error: string | null) => {
      dispatch({ type: 'SET_ERROR', payload: error });
    }, []),

    setWikiStructure: useCallback((structure: WikiStructure) => {
      dispatch({ type: 'SET_WIKI_STRUCTURE', payload: structure });
    }, []),

    setCurrentPage: useCallback((pageId: string | undefined) => {
      dispatch({ type: 'SET_CURRENT_PAGE', payload: pageId });
    }, []),

    setGeneratedPages: useCallback((pages: Record<string, WikiPage>) => {
      dispatch({ type: 'SET_GENERATED_PAGES', payload: pages });
    }, []),

    updatePage: useCallback((id: string, page: WikiPage) => {
      dispatch({ type: 'UPDATE_PAGE', payload: { id, page } });
    }, []),

    setPagesInProgress: useCallback((pages: Set<string>) => {
      dispatch({ type: 'SET_PAGES_IN_PROGRESS', payload: pages });
    }, []),

    addPageInProgress: useCallback((pageId: string) => {
      dispatch({ type: 'ADD_PAGE_IN_PROGRESS', payload: pageId });
    }, []),

    removePageInProgress: useCallback((pageId: string) => {
      dispatch({ type: 'REMOVE_PAGE_IN_PROGRESS', payload: pageId });
    }, []),

    setRequestInProgress: useCallback((inProgress: boolean) => {
      dispatch({ type: 'SET_REQUEST_IN_PROGRESS', payload: inProgress });
    }, []),

    setCurrentToken: useCallback((token: string) => {
      dispatch({ type: 'SET_CURRENT_TOKEN', payload: token });
    }, []),

    setEffectiveRepoInfo: useCallback((repoInfo: RepoInfo) => {
      dispatch({ type: 'SET_EFFECTIVE_REPO_INFO', payload: repoInfo });
    }, []),

    setEmbeddingError: useCallback((hasError: boolean) => {
      dispatch({ type: 'SET_EMBEDDING_ERROR', payload: hasError });
    }, []),

    setDefaultBranch: useCallback((branch: string) => {
      dispatch({ type: 'SET_DEFAULT_BRANCH', payload: branch });
    }, []),

    setStructureRequestInProgress: useCallback((inProgress: boolean) => {
      dispatch({ type: 'SET_STRUCTURE_REQUEST_IN_PROGRESS', payload: inProgress });
    }, []),

    resetWikiState: useCallback(() => {
      dispatch({ type: 'RESET_WIKI_STATE' });
    }, []),
  };

  return {
    ...state,
    ...actions,
  };
}