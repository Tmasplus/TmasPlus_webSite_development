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
  edit,
  onPageChange: (page: number) => void;
};

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  page,
  pageSize,
  edit,
  onPageChange,
}: Props<T>) {
  const total = rows.length;
  const start = (page - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  const slice = rows.slice(start, end);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="w-full">
      <div className="overflow-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
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
            {slice.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                {columns.map((c) => (
                  <td
                    key={String(c.header)}
                    className={classNames("px-3 py-3 text-slate-700", c.width)}
                  >
                    {c.accessor(row)}
                  </td>
                ))}
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => edit() }
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => alert(`Eliminar ${row.id}`)}
                    >
                      Eliminar
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
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
