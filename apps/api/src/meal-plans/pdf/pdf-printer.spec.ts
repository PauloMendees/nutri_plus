import { renderPdf } from './pdf-printer';

describe('renderPdf', () => {
  it('renders a document definition into a non-empty PDF buffer', async () => {
    const buf = await renderPdf({ content: ['Olá, açúcar e proteína'] });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
