// Reads the text of a PDF in the browser. Nothing is sent or saved.

async function defaultLoader() {
  return (await import('./pdfLoader.js')).default;
}

export async function readPdfText(file, loadPdfjs = defaultLoader) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  let doc;
  try {
    doc = await task.promise;
  } catch (error) {
    await task.destroy?.();
    throw error;
  }
  const lines = [];
  try {
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const { items } = await page.getTextContent();
      let line = '';
      let lastY = null;
      for (const item of items) {
        if (typeof item.str !== 'string') continue;
        const y = item.transform?.[5];
        if (lastY !== null && y !== undefined && y !== lastY && line) {
          lines.push(line);
          line = '';
        }
        line += item.str;
        if (y !== undefined) lastY = y;
        if (item.hasEOL) {
          lines.push(line);
          line = '';
          lastY = null;
        }
      }
      if (line) lines.push(line);
    }
  } finally {
    await doc.destroy?.();
  }
  const text = lines.map((l) => l.trim()).filter(Boolean).join('\n');
  if (!text) throw new Error('no-text');
  return text;
}

export function pdfErrorCode(error) {
  if (error?.name === 'PasswordException') return 'password';
  if (error instanceof Error && error.message === 'no-text') return 'no-text';
  return 'load-failed';
}
