import { describe, it, expect } from 'vitest';
import { shapeItem } from '../src/pdf/text.js';

describe('shapeItem', () => {
  it('omits fontFamily when empty', () => {
    const out = shapeItem({
      str: 'x',
      x: 1,
      y: 2,
      width: 3,
      height: 4,
      fontSize: 5,
      fontFamily: '',
      dir: 'ltr',
      hasEOL: false,
    });
    expect('fontFamily' in out).toBe(false);
  });

  it('keeps fontFamily when non-empty', () => {
    const out = shapeItem({
      str: 'x',
      x: 1,
      y: 2,
      width: 3,
      height: 4,
      fontSize: 5,
      fontFamily: 'sans-serif',
      dir: 'ltr',
      hasEOL: false,
    });
    expect(out.fontFamily).toBe('sans-serif');
  });
});
