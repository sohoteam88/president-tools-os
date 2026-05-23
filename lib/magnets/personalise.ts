import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  getObjectBytes,
  r2KeyForPersonalisedMagnet,
  uploadBytes,
} from "@/lib/storage/r2";

export interface PersonaliseOptions {
  masterPdfKey: string;
  accountId: string;
  accountName: string;
  whatsappNumber: string;
  accountSlug: string | null;
}

export async function personaliseMagnetPdf(opts: PersonaliseOptions): Promise<string> {
  const masterBytes = await getObjectBytes(opts.masterPdfKey);
  const pdfDoc = await PDFDocument.load(masterBytes);
  pdfDoc.registerFontkit(fontkit);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  if (!lastPage) throw new Error("PDF has no pages");

  const { width } = lastPage.getSize();
  const marginX = 40;
  const baseY = 60;
  const lineHeight = 14;

  lastPage.drawLine({
    start: { x: marginX, y: baseY + lineHeight * 4 + 8 },
    end: { x: width - marginX, y: baseY + lineHeight * 4 + 8 },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });

  const contactLines = [
    { text: `Your Guide from: ${opts.accountName}`, bold: true },
    {
      text: opts.whatsappNumber
        ? `WhatsApp: +${opts.whatsappNumber}`
        : "WhatsApp: Contact via funnel page",
      bold: false,
    },
    opts.accountSlug ? { text: `Web: ${opts.accountSlug}.yourteam.com`, bold: false } : null,
    { text: "Independent Herbalife Distributor", bold: false },
  ].filter((line): line is { text: string; bold: boolean } => line !== null);

  contactLines.forEach((line, index) => {
    lastPage.drawText(line.text, {
      x: marginX,
      y: baseY + lineHeight * (contactLines.length - 1 - index),
      size: 9,
      font: line.bold ? boldFont : font,
      color: rgb(0.2, 0.2, 0.2),
    });
  });

  const pdfBytes = await pdfDoc.save();
  const key = r2KeyForPersonalisedMagnet(opts.accountId);
  await uploadBytes(key, pdfBytes, "application/pdf");
  return key;
}
