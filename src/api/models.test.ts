import { describe, expect, it } from 'vitest';
import { isLocalModel, modelOptions, modelProblem, ollamaName } from './models';

describe('models', () => {
  it('tells local from cloud models', () => {
    expect(isLocalModel('ollama/qwen2.5:7b')).toBe(true);
    expect(isLocalModel('ollama_chat/llama3.2')).toBe(true);
    expect(isLocalModel('gpt-4o-mini')).toBe(false);
  });

  it('normalises Ollama names', () => {
    expect(ollamaName('ollama/llama3.2')).toBe('llama3.2:latest');
    expect(ollamaName('ollama/qwen2.5:3b')).toBe('qwen2.5:3b');
  });

  it('flags cloud and missing models', () => {
    const installed = ['ollama/qwen2.5:3b', 'ollama/llama3.2:latest'];
    expect(modelProblem('gpt-4o-mini', installed)).toBe('cloud');
    expect(modelProblem('ollama/qwen2.5:7b', installed)).toBe('missing');
    expect(modelProblem('ollama/llama3.2', installed)).toBe(null);
    expect(modelProblem('ollama/qwen2.5:7b', null)).toBe(null);
    expect(modelProblem('', installed)).toBe(null);
  });

  it('lists installed models and keeps an unknown current value selectable', () => {
    const o = modelOptions('gpt-4o', ['ollama/qwen2.5:3b']);
    expect(o.installed).toEqual(['ollama/qwen2.5:3b']);
    expect(o.suggested.every((m) => !m.startsWith('ollama/'))).toBe(true);
    expect(o.current).toBe('gpt-4o');
    expect(modelOptions('gpt-4o-mini', ['ollama/qwen2.5:3b']).current).toBe(null);
    expect(modelOptions('ollama/qwen2.5:7b', null).current).toBe(null);
  });
});
