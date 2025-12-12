import { useReducer, useCallback } from 'react';

export interface ModelConfigState {
  selectedProvider: string;
  selectedModel: string;
  isCustomModel: boolean;
  customModel: string;
  excludedDirs: string;
  excludedFiles: string;
  includedDirs: string;
  includedFiles: string;
  showModelOptions: boolean;
  isModelDropdownOpen: boolean;
  modelConfig: {providers: Array<{id: string; name: string; models: Array<{id: string; name: string}>; supportsCustomModel?: boolean}>} | null;
  expandedProviders: Set<string>;
  customModelInput: {providerId: string; value: string} | null;
}

export type ModelConfigAction =
  | { type: 'SET_SELECTED_PROVIDER'; payload: string }
  | { type: 'SET_SELECTED_MODEL'; payload: string }
  | { type: 'SET_IS_CUSTOM_MODEL'; payload: boolean }
  | { type: 'SET_CUSTOM_MODEL'; payload: string }
  | { type: 'SET_EXCLUDED_DIRS'; payload: string }
  | { type: 'SET_EXCLUDED_FILES'; payload: string }
  | { type: 'SET_INCLUDED_DIRS'; payload: string }
  | { type: 'SET_INCLUDED_FILES'; payload: string }
  | { type: 'SET_SHOW_MODEL_OPTIONS'; payload: boolean }
  | { type: 'SET_MODEL_DROPDOWN_OPEN'; payload: boolean }
  | { type: 'SET_MODEL_CONFIG'; payload: {providers: Array<{id: string; name: string; models: Array<{id: string; name: string}>; supportsCustomModel?: boolean}>} | null }
  | { type: 'TOGGLE_PROVIDER_EXPANDED'; payload: string }
  | { type: 'SET_CUSTOM_MODEL_INPUT'; payload: {providerId: string; value: string} | null }
  | { type: 'RESET_MODEL_CONFIG' }
  | { type: 'UPDATE_FROM_PARAMS'; payload: { provider: string; model: string; isCustomModel: boolean; customModel: string; excludedDirs: string; excludedFiles: string; includedDirs: string; includedFiles: string } };

const createInitialState = (): ModelConfigState => ({
  selectedProvider: '',
  selectedModel: '',
  isCustomModel: false,
  customModel: '',
  excludedDirs: '',
  excludedFiles: '',
  includedDirs: '',
  includedFiles: '',
  showModelOptions: false,
  isModelDropdownOpen: false,
  modelConfig: null,
  expandedProviders: new Set(),
  customModelInput: null,
});

function modelConfigReducer(state: ModelConfigState, action: ModelConfigAction): ModelConfigState {
  switch (action.type) {
    case 'SET_SELECTED_PROVIDER':
      return {
        ...state,
        selectedProvider: action.payload,
      };

    case 'SET_SELECTED_MODEL':
      return {
        ...state,
        selectedModel: action.payload,
      };

    case 'SET_IS_CUSTOM_MODEL':
      return {
        ...state,
        isCustomModel: action.payload,
      };

    case 'SET_CUSTOM_MODEL':
      return {
        ...state,
        customModel: action.payload,
      };

    case 'SET_EXCLUDED_DIRS':
      return {
        ...state,
        excludedDirs: action.payload,
      };

    case 'SET_EXCLUDED_FILES':
      return {
        ...state,
        excludedFiles: action.payload,
      };

    case 'SET_INCLUDED_DIRS':
      return {
        ...state,
        includedDirs: action.payload,
      };

    case 'SET_INCLUDED_FILES':
      return {
        ...state,
        includedFiles: action.payload,
      };

    case 'SET_SHOW_MODEL_OPTIONS':
      return {
        ...state,
        showModelOptions: action.payload,
      };

    case 'SET_MODEL_DROPDOWN_OPEN':
      return {
        ...state,
        isModelDropdownOpen: action.payload,
      };

    case 'SET_MODEL_CONFIG':
      return {
        ...state,
        modelConfig: action.payload,
      };

    case 'TOGGLE_PROVIDER_EXPANDED':
      const newExpanded = new Set(state.expandedProviders);
      if (newExpanded.has(action.payload)) {
        newExpanded.delete(action.payload);
      } else {
        newExpanded.add(action.payload);
      }
      return {
        ...state,
        expandedProviders: newExpanded,
      };

    case 'SET_CUSTOM_MODEL_INPUT':
      return {
        ...state,
        customModelInput: action.payload,
      };

    case 'RESET_MODEL_CONFIG':
      return createInitialState();

    case 'UPDATE_FROM_PARAMS':
      return {
        ...state,
        selectedProvider: action.payload.provider,
        selectedModel: action.payload.model,
        isCustomModel: action.payload.isCustomModel,
        customModel: action.payload.customModel,
        excludedDirs: action.payload.excludedDirs,
        excludedFiles: action.payload.excludedFiles,
        includedDirs: action.payload.includedDirs,
        includedFiles: action.payload.includedFiles,
      };

    default:
      return state;
  }
}

export function useModelConfig(
  initialProvider?: string,
  initialModel?: string,
  initialIsCustomModel?: boolean,
  initialCustomModel?: string,
  initialExcludedDirs?: string,
  initialExcludedFiles?: string,
  initialIncludedDirs?: string,
  initialIncludedFiles?: string
) {
  const [state, dispatch] = useReducer(modelConfigReducer, {
    ...createInitialState(),
    selectedProvider: initialProvider || '',
    selectedModel: initialModel || '',
    isCustomModel: initialIsCustomModel || false,
    customModel: initialCustomModel || '',
    excludedDirs: initialExcludedDirs || '',
    excludedFiles: initialExcludedFiles || '',
    includedDirs: initialIncludedDirs || '',
    includedFiles: initialIncludedFiles || '',
  });

  // Action creators
  const actions = {
    setSelectedProvider: useCallback((provider: string) => {
      dispatch({ type: 'SET_SELECTED_PROVIDER', payload: provider });
    }, []),

    setSelectedModel: useCallback((model: string) => {
      dispatch({ type: 'SET_SELECTED_MODEL', payload: model });
    }, []),

    setIsCustomModel: useCallback((isCustom: boolean) => {
      dispatch({ type: 'SET_IS_CUSTOM_MODEL', payload: isCustom });
    }, []),

    setCustomModel: useCallback((customModel: string) => {
      dispatch({ type: 'SET_CUSTOM_MODEL', payload: customModel });
    }, []),

    setExcludedDirs: useCallback((dirs: string) => {
      dispatch({ type: 'SET_EXCLUDED_DIRS', payload: dirs });
    }, []),

    setExcludedFiles: useCallback((files: string) => {
      dispatch({ type: 'SET_EXCLUDED_FILES', payload: files });
    }, []),

    setIncludedDirs: useCallback((dirs: string) => {
      dispatch({ type: 'SET_INCLUDED_DIRS', payload: dirs });
    }, []),

    setIncludedFiles: useCallback((files: string) => {
      dispatch({ type: 'SET_INCLUDED_FILES', payload: files });
    }, []),

    setShowModelOptions: useCallback((show: boolean) => {
      dispatch({ type: 'SET_SHOW_MODEL_OPTIONS', payload: show });
    }, []),

    setModelDropdownOpen: useCallback((open: boolean) => {
      dispatch({ type: 'SET_MODEL_DROPDOWN_OPEN', payload: open });
    }, []),

    setModelConfig: useCallback((config: {providers: Array<{id: string; name: string; models: Array<{id: string; name: string}>; supportsCustomModel?: boolean}>} | null) => {
      dispatch({ type: 'SET_MODEL_CONFIG', payload: config });
    }, []),

    toggleProviderExpanded: useCallback((providerId: string) => {
      dispatch({ type: 'TOGGLE_PROVIDER_EXPANDED', payload: providerId });
    }, []),

    setCustomModelInput: useCallback((input: {providerId: string; value: string} | null) => {
      dispatch({ type: 'SET_CUSTOM_MODEL_INPUT', payload: input });
    }, []),

    resetModelConfig: useCallback(() => {
      dispatch({ type: 'RESET_MODEL_CONFIG' });
    }, []),

    updateFromParams: useCallback((
      provider: string,
      model: string,
      isCustomModel: boolean,
      customModel: string,
      excludedDirs: string,
      excludedFiles: string,
      includedDirs: string,
      includedFiles: string
    ) => {
      dispatch({
        type: 'UPDATE_FROM_PARAMS',
        payload: {
          provider,
          model,
          isCustomModel,
          customModel,
          excludedDirs,
          excludedFiles,
          includedDirs,
          includedFiles,
        },
      });
    }, []),
  };

  return {
    ...state,
    ...actions,
  };
}