import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('docs', () => {
  it('the LLM guide links the scenario reference of the pinned Simcore', () => {
    const ref = /ARG SIMCORE_REF=(\w+)/.exec(read('../docker/simcore.Dockerfile'))?.[1];
    expect(ref).toBeTruthy();
    expect(read('../docs/escenarios-con-llm.md')).toContain(`dgarcoe/simcore/blob/${ref}/docs/scenario-reference.md`);
  });

  it('keeps recorded runs in a volume, so they survive rebuilding Simcore', () => {
    const compose = read('../docker-compose.yml');
    expect(compose).toContain('- simcore-runs:/app/runs');
    expect(compose).toMatch(/^volumes:[\s\S]*^  simcore-runs:$/m);
  });
});
