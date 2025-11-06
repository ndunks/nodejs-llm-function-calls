import { join } from 'path';
import { homedir } from 'os';
import { existsSync, readdirSync, readFileSync } from 'fs';

/**
* Finds the actual GGUF model file from Ollama's blob storage
*/
function findModelBlob(manifestPath: string, blobsDir: string): string | null {
  try {
    if (!existsSync(manifestPath)) {
      return null;
    }

    // Read the manifest file
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

    // Look for layers in the manifest
    const layers = manifest.layers || [];

    // Find the layer with the model weights (usually the largest file)
    // GGUF files typically have mediaType "application/vnd.ollama.image.model"
    for (const layer of layers) {
      if (layer.mediaType === 'application/vnd.ollama.image.model') {
        const digest = layer.digest.replace('sha256:', 'sha256-');
        const blobPath = join(blobsDir, digest);

        if (existsSync(blobPath)) {
          return blobPath;
        }
      }
    }

    // Fallback: try to find any GGUF file in blobs
    const blobs = readdirSync(blobsDir);
    for (const blob of blobs) {
      const blobPath = join(blobsDir, blob);
      // Read first few bytes to check for GGUF magic number
      if (existsSync(blobPath)) {
        const fd = readFileSync(blobPath);
        if (fd.length > 4) {
          const magic = fd.toString('utf-8', 0, 4);
          if (magic === 'GGUF') {
            return blobPath;
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding model blob:', error);
    return null;
  }
}
/**
 * Parses a model name into name and tag components
 * @param modelName - The model name (e.g., "llama2", "llama2:13b")
 * @returns Object with name and tag
 */
function parseModelName(modelName: string): { name: string; tag: string } {
  const parts = modelName.split(':');
  return {
    name: parts[0],
    tag: parts[1] || 'latest'
  };
}

/**
 * Gets the full path to an Ollama model
 * @param modelName - The model name (e.g., "llama2", "llama2:13b", "mistral:latest")
 */
export function getOllamaModelPath(modelName: string) {
  const { name, tag } = parseModelName(modelName);
  const baseDir = process.env.OLLAMA_MODELS ?? join(homedir(), '.ollama', 'models')

  // Ollama stores models in: ~/.ollama/models/manifests/registry.ollama.ai/library/{model}/{tag}
  const manifestPath = join(
    baseDir,
    'manifests',
    'registry.ollama.ai',
    'library',
    name,
    tag
  );

  const blobsDir = join(baseDir, 'blobs')
  const modelPath = existsSync(manifestPath)
    ? findModelBlob(manifestPath, blobsDir)
    : null;

  return {
    name,
    tag,
    fullPath: manifestPath,
    modelPath,
    exists: existsSync(manifestPath)
  };
}

