import { describe, expect, it } from 'vitest';
import { buildFilterFor } from '../src/build-filter.js';

describe('buildFilterFor', () => {
  it('targets a single package by its full scoped name', () => {
    expect(buildFilterFor('@jeius-mcp-servers/pdf')).toEqual([
      'build',
      '--filter',
      '@jeius-mcp-servers/pdf',
    ]);
  });
});
