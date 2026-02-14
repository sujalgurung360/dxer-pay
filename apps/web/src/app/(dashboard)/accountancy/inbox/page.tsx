'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { AccountancyAddButtons } from '@/components/accountancy/add-buttons';

interface UploadedDoc {
  id: number;
  name: string;
  size: number;
  type: string;
}

export default function DocumentsInboxPage() {
  const [docs, setDocs] = useState<UploadedDoc[]>([]);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const next: UploadedDoc[] = [];
    Array.from(files).forEach((file, index) => {
      next.push({
        id: docs.length + index + 1,
        name: file.name,
        size: file.size,
        type: file.type || 'unknown',
      });
    });
    setDocs((prev) => [...prev, ...next]);
  };

  return (
    <div>
      <PageHeader
        title="Documents Inbox"
        description="Shell for uploading statements, invoices, and receipts for AI-based extraction"
        actions={<AccountancyAddButtons />}
      />

      <div className="card mb-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-900">Upload documents</h2>
        <p className="mb-3 text-xs text-gray-400">
          Drop PDFs, images, or CSV files here. In a later phase DXER will scan them, extract metadata,
          and propose expenses, invoices, or bank statement lines feeding into the accounting engine.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="file"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            className="text-xs"
          />
        </div>
      </div>

      <div className="card">
        <h2 className="mb-2 text-sm font-semibold text-gray-900">Uploaded documents (placeholder)</h2>
        {docs.length === 0 ? (
          <p className="text-xs text-gray-400">No documents uploaded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-gray-100 text-gray-400">
                <tr>
                  <th className="py-1 pr-4 font-normal">Name</th>
                  <th className="py-1 pr-4 font-normal">Type</th>
                  <th className="py-1 pr-4 text-right font-normal">Size (KB)</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="border-b border-gray-50">
                    <td className="py-1.5 pr-4 text-gray-700">{d.name}</td>
                    <td className="py-1.5 pr-4 text-gray-500">{d.type || 'unknown'}</td>
                    <td className="py-1.5 pr-4 text-right text-gray-700">
                      {(d.size / 1024).toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

