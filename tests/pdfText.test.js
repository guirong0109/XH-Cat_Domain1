import { describe, expect, it } from 'vitest';
import { pdfErrorCode, readPdfText } from '../src/lib/pdfText.js';

const file = { arrayBuffer: async () => new ArrayBuffer(4) };

function fakeLoader(pages) {
  return async () => ({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: pages.length,
        getPage: async (n) => ({ getTextContent: async () => ({ items: pages[n - 1] }) }),
        destroy: async () => {},
      }),
    }),
  });
}

const item = (str, y, hasEOL = false) => ({ str, hasEOL, transform: [1, 0, 0, 1, 0, y] });

describe('readPdfText', () => {
  it('joins items into lines', async () => {
    const text = await readPdfText(
      file,
      fakeLoader([[item('Python', 700), item(' 3 years', 700, true), item('Excel', 680), item('Team', 660)], [item('Led', 700)]]),
    );
    expect(text).toBe('Python 3 years\nExcel\nTeam\nLed');
  });

  it('empty pdf throws no-text', async () => {
    await expect(readPdfText(file, fakeLoader([[item('  ', 700)]]))).rejects.toThrow('no-text');
  });
});

describe('pdfErrorCode', () => {
  it('maps errors', () => {
    expect(pdfErrorCode({ name: 'PasswordException' })).toBe('password');
    expect(pdfErrorCode(new Error('no-text'))).toBe('no-text');
    expect(pdfErrorCode(new Error('boom'))).toBe('load-failed');
    expect(pdfErrorCode(undefined)).toBe('load-failed');
  });
});

describe('readPdfText failures', () => {
  it('destroys the loading task when opening fails', async () => {
    let destroyed = false;
    const loader = async () => ({
      getDocument: () => ({
        promise: Promise.reject(Object.assign(new Error('pw'), { name: 'PasswordException' })),
        destroy: async () => {
          destroyed = true;
        },
      }),
    });
    await expect(readPdfText(file, loader)).rejects.toMatchObject({ name: 'PasswordException' });
    expect(destroyed).toBe(true);
  });
});
