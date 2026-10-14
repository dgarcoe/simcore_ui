import { describe, expect, it } from 'vitest';
import { archetypeFor } from './archetypes';

describe('archetypeFor', () => {
  it.each([
    ['town doctor', 'medic'],
    ['enfermera de guardia', 'medic'],
    ['science officer', 'scientist'],
    ['fighter pilot', 'pilot'],
    ['farmer', 'farmer'],
    ['maintenance technician', 'engineer'],
    ['forklift driver', 'worker'],
    ['security chief', 'security'],
    ['ship captain', 'officer'],
    ['town mayor', 'executive'],
    ['plant manager', 'executive'],
    ['school teacher and mother', 'teacher'],
    ['cook and pilot', 'pilot'],
    ['cocinero', 'cook'],
    ['pastor', 'clergy'],
  ])('%s → %s', (profession, id) => {
    expect(archetypeFor(profession)?.id).toBe(id);
  });

  it('returns null for unknown or empty professions', () => {
    expect(archetypeFor('citizen')).toBeNull();
    expect(archetypeFor('')).toBeNull();
    expect(archetypeFor(undefined)).toBeNull();
  });
});
