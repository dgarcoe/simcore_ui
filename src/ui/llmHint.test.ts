import { describe, expect, it } from 'vitest';
import { useSim } from '../store/simStore';
import { llmHint } from './LlmStatus';

describe('llmHint', () => {
  it('explains cloud models without credentials', () => {
    useSim.getState().setScenarioConfig({
      simulation: { name: 'x' },
      llm: { model: 'gpt-4o-mini' },
      environment: { locations: [] },
      agents: [],
    });
    const hint = llmHint('litellm.InternalServerError: OpenAIException - Missing credentials. Please pass an `api_key`');
    expect(hint).toContain('gpt-4o-mini');
    expect(hint).toContain('ollama/qwen2.5:7b');
    expect(hint).toContain('scripts/simcore-up.sh');
  });
  it('recognises unreachable Ollama and missing models', () => {
    expect(llmHint('Cannot connect to host localhost:11434')).toMatch(/no llega a Ollama/);
    expect(llmHint('OllamaException - model "qwen2.5:7b" not found, try pulling it first')).toMatch(/no está descargado/);
  });
});
