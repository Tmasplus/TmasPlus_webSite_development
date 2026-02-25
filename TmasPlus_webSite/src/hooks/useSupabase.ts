import { useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';
import type { PostgrestError } from '@supabase/supabase-js';
import { ErrorHandler } from '@/utils/errorHandler';
import { toast } from '@/utils/toast';

/**
 * Estado de una operación asíncrona
 */
interface AsyncState<T> {
  data: T | null;
  error: PostgrestError | null;
  isLoading: boolean;
}

/**
 * Hook para operaciones de Supabase con manejo de estado integrado
 * 
 * @template T Tipo de datos esperados
 * 
 * @example
 * ```
 * function DriversList() {
 *   const { data, isLoading, error, execute } = useSupabase<UserRow[]>();
 *   
 *   useEffect(() => {
 *     execute(async () => {
 *       const { data, error } = await supabase
 *         .from('users')
 *         .select('*')
 *         .eq('user_type', 'driver');
 *       
 *       if (error) throw error;
 *       return data;
 *     });
 *   }, []);
 *   
 *   if (isLoading) return <Loading />;
 *   if (error) return <Error />;
 *   return <List items={data} />;
 * }
 * ```
 */
export function useSupabase<T = unknown>() {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    isLoading: false,
  });

  /**
   * Ejecuta una operación asíncrona con manejo de estado
   */
  const execute = useCallback(
    async (
      operation: () => Promise<T>,
      options?: {
        showSuccessToast?: boolean;
        successMessage?: string;
        showErrorToast?: boolean;
      }
    ): Promise<T | null> => {
      try {
        setState({ data: null, error: null, isLoading: true });

        const result = await operation();

        setState({ data: result, error: null, isLoading: false });

        if (options?.showSuccessToast && options?.successMessage) {
          toast.success(options.successMessage);
        }

        return result;
      } catch (error) {
        const pgError = error as PostgrestError;
        setState({ data: null, error: pgError, isLoading: false });

        if (options?.showErrorToast !== false) {
          ErrorHandler.handleWithToast(error, 'useSupabase.execute');
        }

        return null;
      }
    },
    []
  );

  /**
   * Reinicia el estado
   */
  const reset = useCallback(() => {
    setState({ data: null, error: null, isLoading: false });
  }, []);

  return {
    ...state,
    execute,
    reset,
  };
}

/**
 * Hook para queries paginadas con Supabase
 * 
 * @example
 * ```
 * function PaginatedList() {
 *   const { data, isLoading, page, totalPages, nextPage, prevPage } = 
 *     usePaginatedSupabase<UserRow>('users', 20);
 *   
 *   return (
 *     <div>
 *       <List items={data} />
 *       <Pagination 
 *         page={page} 
 *         total={totalPages}
 *         onNext={nextPage}
 *         onPrev={prevPage}
 *       />
 *     </div>
 *   );
 * }
 * ```
 */
export function usePaginatedSupabase<T>(tableName: string, pageSize = 20) {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const totalPages = Math.ceil(totalCount / pageSize);

  const fetchPage = useCallback(
    async (pageNumber: number) => {
      try {
        setIsLoading(true);

        const from = (pageNumber - 1) * pageSize;
        const to = from + pageSize - 1;

        const { data: pageData, error, count } = await supabase
          .from(tableName)
          .select('*', { count: 'exact' })
          .range(from, to);

        if (error) {
          throw ErrorHandler.handleDatabaseError(error);
        }

        setData((pageData as T[]) || []);
        setTotalCount(count || 0);
        setPage(pageNumber);
      } catch (error) {
        ErrorHandler.handleWithToast(error, 'usePaginatedSupabase.fetchPage');
      } finally {
        setIsLoading(false);
      }
    },
    [tableName, pageSize]
  );

  const nextPage = useCallback(() => {
    if (page < totalPages) {
      fetchPage(page + 1);
    }
  }, [page, totalPages, fetchPage]);

  const prevPage = useCallback(() => {
    if (page > 1) {
      fetchPage(page - 1);
    }
  }, [page, fetchPage]);

  const goToPage = useCallback(
    (pageNumber: number) => {
      if (pageNumber >= 1 && pageNumber <= totalPages) {
        fetchPage(pageNumber);
      }
    },
    [totalPages, fetchPage]
  );

  const refresh = useCallback(() => {
    fetchPage(page);
  }, [page, fetchPage]);

  return {
    data,
    isLoading,
    page,
    pageSize,
    totalCount,
    totalPages,
    nextPage,
    prevPage,
    goToPage,
    refresh,
    fetchPage,
  };
}
