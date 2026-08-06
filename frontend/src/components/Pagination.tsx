import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dropdown } from "./Dropdown";
import { ROWS_PER_PAGE_OPTIONS } from "../hooks/usePagination";

interface PaginationProps {
  page: number;
  pageCount: number;
  pageSize: number;
  totalRows: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

const PAGE_SIZE_OPTIONS = ROWS_PER_PAGE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }));

// Footer bar for every data table (Discovered Tools, Employees, Endpoint
// Devices, Manage Users, Classify history) — rows-per-page + prev/next, no
// numbered page list since these tables run at most a few hundred rows.
export function Pagination({ page, pageCount, pageSize, totalRows, onPageChange, onPageSizeChange }: PaginationProps) {
  if (totalRows === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(totalRows, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-tint/[0.015] px-3.5 py-2.5 text-[12.5px] text-muted">
      <div className="flex items-center gap-2">
        Rows per page
        <Dropdown
          value={String(pageSize)}
          onChange={(v) => onPageSizeChange(Number(v))}
          options={PAGE_SIZE_OPTIONS}
          minWidth={64}
        />
      </div>
      <div className="flex items-center gap-3">
        <span>
          {start}&ndash;{end} of {totalRows}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            title="Previous page"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-tint/[0.08] hover:text-text disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronLeft size={14} strokeWidth={2.25} />
          </button>
          <span className="min-w-[52px] px-1 text-center font-semibold text-text">
            {page} / {pageCount}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
            title="Next page"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-tint/[0.08] hover:text-text disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronRight size={14} strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </div>
  );
}
