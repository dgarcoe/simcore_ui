import { useState } from 'react';

const KEY = 'simcore-ui:demo';

/**
 * Whether to run scenarios in Simcore's demo mode (canned answers, no LLM).
 * Off by default so runs use the real model; the choice is remembered.
 */
export function useDemoPref(): [boolean, (v: boolean) => void] {
  const [demo, setDemo] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  const set = (v: boolean) => {
    setDemo(v);
    try {
      localStorage.setItem(KEY, v ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  };
  return [demo, set];
}
