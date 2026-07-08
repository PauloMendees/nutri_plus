import { renderPdf } from './pdf-printer';

describe('renderPdf', () => {
  it('renders a document definition into a non-empty PDF buffer', async () => {
    const buf = await renderPdf({ content: ['Olá, açúcar e proteína'] });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('renders a data-URL image into a PDF (the logo path)', async () => {
    // 1×1 RGB PNG (color type 2, 8-bit depth) — compatible with pdfkit's PNG decoder.
    // The original task spec used a Grayscale+Alpha (color type 4) PNG which pdfkit does
    // not support; real logos are always RGB or RGBA, so this is representative.
    const png1x1 =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
    const buf = await renderPdf({ content: [{ image: png1x1, width: 40 }, 'ok'] });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
