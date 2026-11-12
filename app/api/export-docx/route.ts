// app/api/export-docx/route.ts
//
// Конвертує згенерований Markdown-документ у .docx для завантаження.
// Використовує html-to-docx поверх простого Markdown -> HTML перетворення.

import { NextRequest } from "next/server";
import HTMLtoDOCX from "html-to-docx";
import { marked } from "marked";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { title, markdown } = (await req.json()) as {
    title: string;
    markdown: string;
  };

  const body = await marked.parse(markdown ?? "");
  const html = `<h1>${title}</h1>${body}`;

  const buffer = await HTMLtoDOCX(html, undefined, {
    title,
    font: "Times New Roman",
    fontSize: 24, // 12pt у half-points
  });

  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${title.replace(
        /[^\w\-]+/g,
        "_"
      )}.docx"`,
    },
  });
}
