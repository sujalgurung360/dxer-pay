'use client';

import { ChevronLeft, ChevronRight, Search, Loader2 } from 'lucide-react';

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  pagination?: { page: number; pageSize: number; total: number; totalPages: number };
  onPageChange?: (page: number) => void;
  onSearch?: (query: string) => void;
  searchPlaceholder?: string;
  isLoading?: boolean;
  emptyMessage?: string;
  actions?: (row: T) => React.ReactNode;
}

export function DataTable<T extends Record<string, any>>({
  columns, data, pagination, onPageChange, onSearch,
  searchPlaceholder = 'Search...', isLoading, emptyMessage = 'No data found', actions,
}: DataTableProps<T>) {
  return (
    <div className="card !p-0 overflow-hidden">
      {/* Search */}
      {onSearch && (
        <div className="border-b border-gray-100 p-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              onChange={(e) => onSearch(e.target.value)}
              className="input-field pl-10"
            />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead>
            <tr className="bg-surface-50">
              {columns.map((col) => (
                <th key={col.key} className={`px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 ${col.className || ''}`}>
                  {col.header}
                </th>
              ))}
              {actions && <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className="px-5 py-16 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-purple-500" />
                  <p className="mt-2 text-sm text-gray-400">Loading...</p>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className="px-5 py-16 text-center">
                  <p className="text-sm text-gray-400">{emptyMessage}</p>
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr key={row.id || i} className="hover:bg-surface-50 transition-colors">
                  {columns.map((col) => (
                    <td key={col.key} className={`px-5 py-3.5 text-sm text-gray-600 ${col.className || ''}`}>
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                  {actions && (
                    <td className="px-5 py-3.5 text-right text-sm">{actions(row)}</td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3.5">
          <p className="text-xs text-gray-400">
            {((pagination.page - 1) * pagination.pageSize) + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total}
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => onPageChange?.(pagination.page - 1)} disabled={pagination.page <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-surface-100 hover:text-purple-600 disabled:opacity-20 transition-all">
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => i + 1).map((p) => (
              <button key={p} onClick={() => onPageChange?.(p)}
                className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm font-medium transition-all ${
                  p === pagination.page ? 'bg-purple-600 text-white shadow-purple' : 'text-gray-400 hover:bg-surface-100 hover:text-purple-600'
                }`}>
                {p}
              </button>
            ))}
            {pagination.totalPages > 5 && <span className="px-1 text-gray-300">...</span>}
            <button onClick={() => onPageChange?.(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-surface-100 hover:text-purple-600 disabled:opacity-20 transition-all">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
