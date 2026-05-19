import { Button } from "@/components/ui/Button";
import { classNames } from "@/utils/classNames";

export type Column<T> = {
  header: string;
  accessor: (row: T) => React.ReactNode;
  width?: string; // ej: "w-40"
};

type Props<T> = {
  rows: T[];
  columns: Column<T>[];
  page: number;
  pageSize: number;
  edit?: (row: T) => void;
  onDelete?: (row: T) => void;
  onPageChange: (page: number) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: (visibleRows: T[]) => void;
  isRowSelectable?: (row: T) => boolean;
  rowActions?: (row: T) => React.ReactNode;
};

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  page,
  pageSize,
  edit,
  onDelete,
  onPageChange,
  selectable = false,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  isRowSelectable,
  rowActions,
}: Props<T>) {
  const total = rows.length;
  const start = (page - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  const slice = rows.slice(start, end);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const selectableVisible = selectable
    ? slice.filter((r) => (isRowSelectable ? isRowSelectable(r) : true))
    : [];
  const allVisibleSelected =
    selectable &&
    selectableVisible.length > 0 &&
    selectableVisible.every((r) => selectedIds?.has(r.id));

  return (
    <div className="w-full">
      <div className="overflow-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              {selectable && (
                <th className="px-3 py-2 w-10">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar visibles"
                    checked={allVisibleSelected}
                    disabled={selectableVisible.length === 0}
                    onChange={() => onToggleSelectAll?.(selectableVisible)}
                    className="cursor-pointer"
                  />
                </th>
              )}
              {columns.map((c) => (
                <th
                  key={c.header}
                  className={classNames("px-3 py-2 font-medium whitespace-nowrap", c.width)}
                >
                  {c.header}
                </th>
              ))}
              <th className="px-3 py-2 font-medium whitespace-nowrap w-32">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {slice.map((row) => {
              const rowSelectable = selectable && (isRowSelectable ? isRowSelectable(row) : true);
              const checked = selectable && !!selectedIds?.has(row.id);
              return (
                <tr key={row.id} className="border-t border-slate-100">
                  {selectable && (
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ${row.id}`}
                        checked={checked}
                        disabled={!rowSelectable}
                        onChange={() => onToggleSelect?.(row.id)}
                        className={rowSelectable ? "cursor-pointer" : "cursor-not-allowed opacity-40"}
                      />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td
                      key={String(c.header)}
                      className={classNames("px-3 py-3 text-slate-700", c.width)}
                    >
                      {c.accessor(row)}
                    </td>
                  ))}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {rowActions?.(row)}
                      {edit && (
                        <Button
                          variant="secondary"
                          onClick={() => edit(row)}
                        >
                          Editar
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        onClick={() => onDelete ? onDelete(row) : alert(`Eliminar ${row.id}`)}
                      >
                        Eliminar
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="flex items-center justify-between gap-2 mt-3 text-sm">
        <div className="text-slate-600">
          Mostrando {total === 0 ? 0 : start + 1}-{end} de {total}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            onClick={() => onPageChange(1)}
            disabled={page === 1}
          >
            «
          </Button>
          <Button
            variant="secondary"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
          >
            ←
          </Button>
          <span className="mx-2 text-slate-600">
            {page} / {pages}
          </span>
          <Button
            variant="secondary"
            onClick={() => onPageChange(Math.min(pages, page + 1))}
            disabled={page === pages}
          >
            →
          </Button>
          <Button
            variant="secondary"
            onClick={() => onPageChange(pages)}
            disabled={page === pages}
          >
            »
          </Button>
        </div>
      </div>
    </div>
  );
}
