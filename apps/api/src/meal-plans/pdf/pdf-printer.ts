import pdfmake from 'pdfmake/js/index';
import vfsFonts from 'pdfmake/build/vfs_fonts';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

// pdfmake 0.3.x ships Roboto inside its virtual file system. The export shape
// has varied across versions, so resolve it defensively.
// In pdfmake 0.3.x, vfs_fonts exports the vfs object directly (module.exports = vfs),
// so the final fallback (vfsFonts as any) is the active branch.
const vfs: Record<string, string> =
  (vfsFonts as any).vfs ??
  (vfsFonts as any).pdfMake?.vfs ??
  (vfsFonts as any).default?.vfs ??
  (vfsFonts as any);

// Write base64 font data into the shared virtual file system.
for (const key of Object.keys(vfs)) {
  (pdfmake as any).virtualfs.writeFileSync(key, vfs[key], 'base64');
}

// Register fonts by filename; pdfmake will resolve them from the virtual fs.
(pdfmake as any).addFonts({
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf',
  },
});

// Deny all external URL and local filesystem access — all assets come from vfs.
(pdfmake as any).setUrlAccessPolicy(() => false);
(pdfmake as any).setLocalAccessPolicy(() => false);

export function renderPdf(doc: TDocumentDefinitions): Promise<Buffer> {
  return (pdfmake as any).createPdf(doc).getBuffer() as Promise<Buffer>;
}
