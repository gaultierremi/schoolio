"use client";

import { useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";

type MiniPdfPreviewProps = {
  pdfUrl: string;
  pageNumber: number;
};

export default function MiniPdfPreview({ pdfUrl, pageNumber }: MiniPdfPreviewProps) {
  useEffect(() => {
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    }
  }, []);

  return (
    <Document
      file={pdfUrl}
      loading={<div className="h-44 w-full animate-pulse rounded-lg bg-gray-800" />}
      error={
        <div className="flex h-44 w-full items-center justify-center rounded-lg bg-gray-800 text-xs text-gray-500">
          Aperçu indisponible
        </div>
      }
    >
      <div className="pointer-events-none overflow-hidden rounded-lg">
        <Page
          pageNumber={pageNumber}
          height={176}
          renderAnnotationLayer={false}
          renderTextLayer={false}
        />
      </div>
    </Document>
  );
}
