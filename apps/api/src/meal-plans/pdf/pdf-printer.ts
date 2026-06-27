import PdfPrinter from 'pdfmake/src/printer';
import vfsFonts from 'pdfmake/build/vfs_fonts';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

// pdfmake 0.2.x ships Roboto inside its virtual file system. The export shape has
// varied across versions, so resolve it defensively (0.2.x uses { pdfMake: { vfs } }).
const vfs: Record<string, string> =
  (vfsFonts as any).pdfMake?.vfs ??
  (vfsFonts as any).vfs ??
  (vfsFonts as any).default?.vfs ??
  (vfsFonts as any);

const fonts = {
  Roboto: {
    normal: Buffer.from(vfs['Roboto-Regular.ttf'], 'base64'),
    bold: Buffer.from(vfs['Roboto-Medium.ttf'], 'base64'),
    italics: Buffer.from(vfs['Roboto-Italic.ttf'], 'base64'),
    bolditalics: Buffer.from(vfs['Roboto-MediumItalic.ttf'], 'base64'),
  },
};

const printer = new PdfPrinter(fonts);

export function renderPdf(doc: TDocumentDefinitions): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const pdfDoc = printer.createPdfKitDocument(doc);
      const chunks: Buffer[] = [];
      pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    } catch (err) {
      reject(err);
    }
  });
}
