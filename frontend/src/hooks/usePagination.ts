import { useEffect, useMemo, useState } from "react";

export const ROWS_PER_PAGE_OPTIONS = [10, 20, 50, 100];

// Shared client-side pagination for every data table in the app (Discovered
// Tools, Employees, Endpoint Devices, Manage Users, Classify history) — one
// hook so "10 / 20 / 50 / 100 rows per page" behaves identically everywhere
// instead of five separate ad-hoc slice() calls.
export function usePagination<T>(rows: T[], initialPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));

  // Clamp back to the last valid page whenever the underlying row count
  // shrinks below the current page (a search/filter narrowing the set
  // while sitting on, say, page 4) — otherwise the table just renders
  // empty with no visible way back except manually clicking to page 1.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  function setPageSize(size: number) {
    setPageSizeState(size);
    setPage(1);
  }

  return { page, setPage, pageSize, setPageSize, pageCount, paged, totalRows: rows.length };
}
