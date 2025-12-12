// Local repository functions

export interface LocalRepoStructure {
  file_tree: string;
  readme: string;
}

export const fetchLocalRepoStructure = async (localPath: string): Promise<LocalRepoStructure> => {
  const response = await fetch(`/local_repo/structure?path=${encodeURIComponent(localPath)}`);

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Local repository API error (${response.status}): ${errorData}`);
  }

  return response.json();
};