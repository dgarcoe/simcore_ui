/** LLM model names as Simcore (LiteLLM) expects them, and what Ollama has installed. */

export const SUGGESTED_MODELS = ['ollama/qwen2.5:7b', 'ollama/qwen2.5:3b', 'ollama/llama3.2:3b', 'gpt-4o-mini', 'anthropic/claude-haiku-4-5'];

const LOCAL_PREFIX = /^ollama(_chat)?\//;

export function isLocalModel(model: string): boolean {
  return LOCAL_PREFIX.test(model);
}

/** "ollama/llama3.2" → "llama3.2:latest", the name `ollama list` shows. */
export function ollamaName(model: string): string {
  const name = model.replace(LOCAL_PREFIX, '');
  return name.includes(':') ? name : `${name}:latest`;
}

/** Models installed in Ollama, as LiteLLM names; null when Ollama can't be reached. */
export async function listLocalModels(): Promise<string[] | null> {
  try {
    const res = await fetch('/ollama/api/tags', { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { models?: Array<{ name?: string; model?: string }> };
    const names = (data.models ?? []).map((m) => m.name ?? m.model ?? '').filter(Boolean);
    return [...new Set(names)].sort().map((n) => `ollama/${n}`);
  } catch {
    return null;
  }
}

export type ModelProblem = 'cloud' | 'missing' | null;

/**
 * Why `model` may not run here: a cloud model (needs its API key) or a local
 * one Ollama doesn't have. Unknown when the installed list isn't available.
 */
export function modelProblem(model: string, installed: string[] | null): ModelProblem {
  if (!model) return null;
  if (!isLocalModel(model)) return 'cloud';
  if (!installed) return null;
  const want = ollamaName(model);
  return installed.some((m) => ollamaName(m) === want) ? null : 'missing';
}

/** Options for the model selector: what's installed (or suggestions if unknown), plus the current value. */
export function modelOptions(value: string, installed: string[] | null): { installed: string[]; suggested: string[]; current: string | null } {
  const inst = installed ?? [];
  const suggested = installed ? SUGGESTED_MODELS.filter((m) => !isLocalModel(m)) : SUGGESTED_MODELS;
  const known = [...inst, ...suggested];
  const current = value && !known.includes(value) ? value : null;
  return { installed: inst, suggested, current };
}
