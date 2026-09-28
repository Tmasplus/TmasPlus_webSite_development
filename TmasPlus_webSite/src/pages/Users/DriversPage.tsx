import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Page } from '@/components/layout/Page';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useDebounced } from '@/hooks/useDebounced';
import { formatDate } from '@/utils/formatDate';
import { classNames } from '@/utils/classNames';
import { toast } from '@/utils/toast';
import { exportToCsv } from '@/utils/exportCsv';
import { useCarTypeCatalog } from '@/hooks/useCarTypeCatalog';
import { categoryNameForValue } from '@/utils/carTypeCatalog';
import { supabase } from '@/config/supabase';
import { DriversService } from '@/services/drivers.service';
import { UsersSecondaryService } from '@/services/usersSecondary.service';
import { DriverDocumentsService } from '@/services/driverDocuments.service';
import DriverReviewModal, { type EnrichedDriverProfile } from './DriverReviewModal';

// 1. SOLUCIÓN TS: Tipos estrictos para eliminar el uso de `as any`
type StatusFilter = 'todos' | 'pendiente' | 'aprobado' | 'bloqueado';
type ReferralFilter = 'todos' | 'con_referido';
type SortFilter = 'fecha_desc' | 'fecha_asc' | 'nombre_asc';
type AppAccessFilter = 'todos' | 'con_acceso' | 'sin_acceso';
type AppAccessIndex = {
    ids: Set<string>;
    emailById: Record<string, string>;
    idByEmail: Record<string, string>;
};

const EMPTY_ACCESS_INDEX: AppAccessIndex = { ids: new Set(), emailById: {}, idByEmail: {} };

export const DriversPage: React.FC = () => {
    const { categories: carTypes } = useCarTypeCatalog();
    const [drivers, setDrivers] = useState<EnrichedDriverProfile[]>([]);
    const [loading, setLoading] = useState(true);

    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
    const [referralFilter, setReferralFilter] = useState<ReferralFilter>('todos');
    const [appAccessFilter, setAppAccessFilter] = useState<AppAccessFilter>('todos');
    const [sortBy, setSortBy] = useState<SortFilter>('fecha_desc');

    const [page, setPage] = useState(1);
    const pageSize = 10;
    const [selectedDriver, setSelectedDriver] = useState<EnrichedDriverProfile | null>(null);

    const [appAccess, setAppAccess] = useState<AppAccessIndex>(EMPTY_ACCESS_INDEX);
    // Respaldo desde la BD secundaria (App) cuando la primaria no tiene el dato.
    const [cedulaFallback, setCedulaFallback] = useState<Record<string, string>>({});
    const [categoryFallback, setCategoryFallback] = useState<Record<string, string>>({});
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [importingIds, setImportingIds] = useState<Set<string>>(new Set());
    const [bulkImporting, setBulkImporting] = useState(false);
    const [bulkResyncing, setBulkResyncing] = useState(false);
    const [postImportNotice, setPostImportNotice] = useState<{ count: number; names: string[]; authMissing: string[] } | null>(null);

    const debouncedQuery = useDebounced(query, 500);

    const fetchAppAccess = useCallback(async () => {
        try {
            const index = await UsersSecondaryService.listAccessIndex();
            setAppAccess(index);
        } catch (error: any) {
            console.warn('No se pudo cargar el estado de acceso a la App:', error?.message);
            setAppAccess(EMPTY_ACCESS_INDEX);
        }
    }, []);

    // 2. SOLUCIÓN WARNINGS: Memoización con useCallback
    const fetchDrivers = useCallback(async () => {
        setLoading(true);
        try {
            const result = await DriversService.getDriverProfiles({ searchQuery: debouncedQuery }, { page: 1, limit: 1000 });

            // 3. SOLUCIÓN TS: Type Guard estricto para eliminar nulos del arreglo
            const uniqueCodes = [...new Set(
                result.data.map(d => d.referral_id).filter((id): id is string => typeof id === 'string' && id.trim() !== '')
            )];

            let codeToNameMap: Record<string, string> = {};

            if (uniqueCodes.length > 0) {
                const { data: refCodes } = await supabase.from('web_referral_codes').select('referral_code, driver_id').in('referral_code', uniqueCodes);
                if (refCodes && refCodes.length > 0) {
                    const driverIds = refCodes.map((rc: { driver_id: string, referral_code: string }) => rc.driver_id);
                    const { data: users } = await supabase.from('web_users').select('id, first_name, last_name').in('id', driverIds);

                    refCodes.forEach((rc: { driver_id: string, referral_code: string }) => {
                        const user = users?.find((u: { id: string, first_name: string, last_name: string }) => u.id === rc.driver_id);
                        if (user) codeToNameMap[rc.referral_code] = `${user.first_name} ${user.last_name}`;
                    });
                }
            }

            const enriched = result.data.map(d => ({
                ...d,
                referrerName: d.referral_id && codeToNameMap[d.referral_id] ? codeToNameMap[d.referral_id] : 'Sin referencia'
            }));

            setDrivers(enriched);
            setPage(1);
        } catch (error) {
            toast.error('Error al cargar la lista de conductores');
        } finally {
            setLoading(false);
        }
    }, [debouncedQuery]);

    useEffect(() => {
        fetchAppAccess();
    }, [fetchAppAccess]);

    useEffect(() => {
        fetchDrivers();
    }, [fetchDrivers]);

    // Respaldo cruzado: la pestaña Conductores lee la BD primaria, pero la cédula
    // o la categoría del vehículo pueden existir solo en la App (secundaria).
    // Para los conductores a los que les falte el dato en primaria, lo buscamos
    // en la secundaria y lo mostramos igual.
    useEffect(() => {
        if (drivers.length === 0) {
            setCedulaFallback({});
            setCategoryFallback({});
            return;
        }
        let cancelled = false;
        (async () => {
            const missingCedulaIds = drivers
                .filter(d => !(d as any).license_number && !(d as any).document_number)
                .map(d => d.id);
            const missingCatIds = drivers
                .filter(d => !(d.serviceType || d.vehicle?.service_type))
                .map(d => d.id);

            const [cedulas, cats] = await Promise.all([
                missingCedulaIds.length
                    ? UsersSecondaryService.documentsByIds(missingCedulaIds).catch(() => ({}))
                    : Promise.resolve({} as Record<string, { document_number: string | null }>),
                missingCatIds.length
                    ? UsersSecondaryService.categoriesByDriver(missingCatIds).catch(() => ({}))
                    : Promise.resolve({} as Record<string, string>),
            ]);
            if (cancelled) return;

            const cedulaMap: Record<string, string> = {};
            for (const [id, doc] of Object.entries(cedulas)) {
                if (doc?.document_number) cedulaMap[id] = doc.document_number;
            }
            setCedulaFallback(cedulaMap);
            setCategoryFallback(cats as Record<string, string>);
        })();
        return () => { cancelled = true; };
    }, [drivers]);

    // Acceso efectivo a la App: por id y, como respaldo, por email. Así se
    // reconocen como importados los conductores que existen en la App con un
    // id distinto al del proyecto primario (filas heredadas); al re-sincronizar,
    // la Edge Function los reconcilia por email y alinea el id.
    const appAccessIds = useMemo(() => {
        const set = new Set(appAccess.ids);
        for (const d of drivers) {
            const email = d.email?.trim().toLowerCase();
            if (email && appAccess.idByEmail[email]) set.add(d.id);
        }
        return set;
    }, [drivers, appAccess]);

    const emailFor = (d: EnrichedDriverProfile): string =>
        // Si el conductor no tiene email en la primaria, usamos el de la App.
        d.email || appAccess.emailById[d.id] || '';

    const cedulaFor = (d: EnrichedDriverProfile): string =>
        // En la App (primaria) la cédula del conductor está en license_number.
        (d as any).license_number || (d as any).document_number || cedulaFallback[d.id] || '';

    const categoryFor = (d: EnrichedDriverProfile): string | undefined =>
        d.serviceType || d.vehicle?.service_type || categoryFallback[d.id];

    const filteredAndSortedDrivers = useMemo(() => {
        let result = [...drivers];

        if (statusFilter === 'pendiente') result = result.filter(d => !d.approved && !d.blocked);
        if (statusFilter === 'aprobado') result = result.filter(d => d.approved && !d.blocked);
        if (statusFilter === 'bloqueado') result = result.filter(d => d.blocked);
        if (referralFilter === 'con_referido') result = result.filter(d => d.referral_id && d.referral_id.trim() !== '');
        if (appAccessFilter === 'con_acceso') result = result.filter(d => appAccessIds.has(d.id));
        if (appAccessFilter === 'sin_acceso') result = result.filter(d => !appAccessIds.has(d.id));

        result.sort((a, b) => {
            if (sortBy === 'nombre_asc') return a.first_name.localeCompare(b.first_name);
            const dateA = new Date(a.created_at || 0).getTime();
            const dateB = new Date(b.created_at || 0).getTime();
            return sortBy === 'fecha_desc' ? dateB - dateA : dateA - dateB;
        });

        return result;
    }, [drivers, statusFilter, referralFilter, appAccessFilter, appAccessIds, sortBy]);

    const handleApprove = async (id: string) => {
        await DriversService.approveDriver(id, 'admin-dashboard');
        toast.success('Conductor aprobado exitosamente. Se ha generado su código.');
        fetchDrivers();
    };

    const handleReject = async (id: string) => {
        await DriversService.rejectDriver(id, 'Documentos inválidos', 'admin-dashboard');
        toast.success('Conductor rechazado.');
        fetchDrivers();
    };

    const importOne = async (driver: EnrichedDriverProfile): Promise<{ok:boolean;authCreated:boolean}> => {
        try {
            const res = await UsersSecondaryService.importDriverWithAuth({id:driver.id,email:emailFor(driver),
              first_name:driver.first_name,last_name:driver.last_name});
            await fetchDrivers();
            if(res.authWarning) toast.info(res.authWarning);
            return {ok:true,authCreated:res.authCreated};
        } catch(error:any) {
            toast.error(error.message || 'No se pudo crear acceso en core');
            return {ok:false,authCreated:false};
        }
    };

    const handleImportOne = async (driver: EnrichedDriverProfile) => {
        if (!window.confirm('¿Enviar una invitación de acceso al correo de este conductor en core?')) return;
        setImportingIds(prev => new Set(prev).add(driver.id));
        const res = await importOne(driver);
        setImportingIds(prev => {
            const next = new Set(prev);
            next.delete(driver.id);
            return next;
        });
        if (res.ok) {
            const name = `${driver.first_name} ${driver.last_name}`;
            toast.success(`${name} con acceso en core.`);
            setPostImportNotice({
                count: 1,
                names: [name],
                authMissing: res.authCreated ? [] : [name],
            });
        }
    };

    // Reconcilia los contadores de referidos en ambas bases (primaria + App).
    // Es global: recalcula todos los códigos a partir de users.referral_id, así
    // que basta llamarla una vez al final de la re-sincronización.
    const reconcileReferrals = async () => {
        try {
            const res = await UsersSecondaryService.reconcileReferrals();
            if (res.totalUpdated > 0) {
                toast.success(`Referidos sincronizados: ${res.totalUpdated} contador(es) corregido(s).`);
                fetchDrivers();
            }
        } catch (error: any) {
            toast.error(`No se pudieron sincronizar los referidos: ${error?.message || 'error desconocido'}`);
        }
    };

    const handleBulkImport = async () => {
        const targets = drivers.filter(d => selectedIds.has(d.id) && !appAccessIds.has(d.id));
        if (targets.length === 0) {
            toast.error('No hay conductores válidos para importar en la selección.');
            return;
        }
        if (!window.confirm(`¿Enviar invitaciones por correo a ${targets.length} conductor(es) de core?`)) return;

        setBulkImporting(true);
        let success = 0;
        let failed = 0;
        const importedNames: string[] = [];
        const authMissing: string[] = [];
        for (const d of targets) {
            const res = await importOne(d);
            if (res.ok) {
                success++;
                const name = `${d.first_name} ${d.last_name}`;
                importedNames.push(name);
                if (!res.authCreated) authMissing.push(name);
            } else {
                failed++;
            }
            // Pequeño respiro para no encadenar requests si quedan más
            if (targets.length > 1) await new Promise(r => setTimeout(r, 350));
        }
        setBulkImporting(false);
        setSelectedIds(new Set());
        if (success > 0) {
            toast.success(`${success} conductor(es) importado(s) exitosamente.`);
            setPostImportNotice({ count: success, names: importedNames, authMissing });
        }
        if (failed > 0) toast.error(`${failed} importación(es) fallaron.`);
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleSelectAllVisible = (visibleRows: EnrichedDriverProfile[]) => {
        setSelectedIds(prev => {
            const allSelected = visibleRows.length > 0 && visibleRows.every(r => prev.has(r.id));
            const next = new Set(prev);
            if (allSelected) visibleRows.forEach(r => next.delete(r.id));
            else visibleRows.forEach(r => next.add(r.id));
            return next;
        });
    };

    const handleDelete = async (driver: EnrichedDriverProfile) => {
        if (window.confirm(`¿Deshabilitar a ${driver.first_name} ${driver.last_name}? Se conservará su historial.`)) {
            try {
                setLoading(true);
                await UsersSecondaryService.toggleBlock(driver.id, true);

                toast.success('Conductor deshabilitado; historial conservado.');
                fetchDrivers();
            } catch (error: any) {
                toast.error('Error al eliminar: ' + error.message);
                setLoading(false);
            }
        }
    };

    const columns: Column<EnrichedDriverProfile>[] = [
        { header: "Nombre", accessor: (r) => <span className="font-medium text-[#002f45]">{r.first_name} {r.last_name}</span> },
        {
            header: "Cédula",
            accessor: (r) => {
                const ced = cedulaFor(r);
                return ced
                    ? <span className="font-mono text-xs text-slate-700">{ced}</span>
                    : <span className="text-slate-400 text-xs italic">—</span>;
            }
        },
        {
            header: "Categoría",
            accessor: (r) => {
                const cat = categoryFor(r);
                return cat
                    ? <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border bg-indigo-50 text-indigo-700 border-indigo-200">{categoryNameForValue(carTypes, cat)}</span>
                    : <span className="text-slate-400 text-xs italic">Sin vehículo</span>;
            }
        },
        {
            header: "Correo",
            accessor: (r) => emailFor(r)
                || <span className="text-slate-400 text-xs italic">Sin email</span>
        },
        { header: "Teléfono", accessor: (r) => r.mobile },
        {
            header: "Referido Por",
            accessor: (r) => r.referrerName === 'Sin referencia' || !r.referral_id
                ? <span className="text-slate-400 text-xs italic">Sin referencia</span>
                : <div className="flex flex-col"><span className="text-xs font-bold text-sky-700">{r.referrerName}</span><span className="text-[10px] text-slate-400">({r.referral_id})</span></div>
        },
        {
            header: "Estado",
            accessor: (r) => {
                let statusText = 'Pendiente';
                let style = 'bg-amber-50 text-amber-700 border-amber-200';
                if (r.blocked) { statusText = 'Bloqueado'; style = 'bg-red-50 text-red-700 border-red-200'; }
                else if (r.approved) { statusText = 'Aprobado'; style = 'bg-green-50 text-green-700 border-green-200'; }
                return <span className={classNames("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border", style)}>{statusText}</span>;
            }
        },
        {
            header: "Acceso App",
            accessor: (r) => {
                const hasAccess = appAccessIds.has(r.id);
                return hasAccess
                    ? <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border bg-emerald-50 text-emerald-700 border-emerald-200">✓ Con acceso</span>
                    : <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border bg-slate-50 text-slate-600 border-slate-200">Sin acceso</span>;
            }
        },
        { header: "Registro", accessor: (r) => r.created_at ? formatDate(r.created_at) : 'N/A' },
    ];

    const importedCount = useMemo(
        () => filteredAndSortedDrivers.filter(d => appAccessIds.has(d.id) && emailFor(d)).length,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [filteredAndSortedDrivers, appAccessIds, appAccess]
    );

    const pendingImportCount = useMemo(
        () => Array.from(selectedIds).filter(id => !appAccessIds.has(id)).length,
        [selectedIds, appAccessIds]
    );

    const handleExportCsv = () => {
        if (filteredAndSortedDrivers.length === 0) {
            toast.error('No hay conductores para exportar.');
            return;
        }
        const statusLabel = (d: EnrichedDriverProfile) =>
            d.blocked ? 'Bloqueado' : d.approved ? 'Aprobado' : 'Pendiente';
        const dateStamp = new Date().toISOString().slice(0, 10);
        exportToCsv(`conductores_${dateStamp}`, filteredAndSortedDrivers, [
            { header: 'ID', value: (d) => d.id },
            { header: 'Nombre', value: (d) => d.first_name },
            { header: 'Apellido', value: (d) => d.last_name },
            { header: 'Cédula', value: (d) => cedulaFor(d) },
            { header: 'Categoría', value: (d) => categoryNameForValue(carTypes, categoryFor(d)) },
            { header: 'Correo', value: (d) => emailFor(d) },
            { header: 'Teléfono', value: (d) => d.mobile },
            { header: 'Estado', value: statusLabel },
            { header: 'Acceso App', value: (d) => (appAccessIds.has(d.id) ? 'Sí' : 'No') },
            { header: 'Referido Por', value: (d) => d.referrerName || '' },
            { header: 'Código Referido', value: (d) => d.referral_id || '' },
            { header: 'Registro', value: (d) => (d.created_at ? formatDate(d.created_at) : '') },
        ]);
    };

    return (
        <Page
            title="Conductores Web"
            actions={
                <div className="flex items-center gap-2">

                    <Button variant="secondary" onClick={handleExportCsv}>
                        Exportar CSV
                    </Button>
                </div>
            }
        >
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <div className="col-span-1 md:col-span-5 lg:col-span-1">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Buscar</label>
                    <Input placeholder="Nombre, email o teléfono..." value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Estado</label>
                    <select className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-sky-400"
                        value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
                        <option value="todos">Todos</option>
                        <option value="pendiente">Pendientes de Revisión</option>
                        <option value="aprobado">Aprobados</option>
                        <option value="bloqueado">Bloqueados</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Origen</label>
                    <select className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-sky-400"
                        value={referralFilter} onChange={(e) => setReferralFilter(e.target.value as ReferralFilter)}>
                        <option value="todos">Cualquier Origen</option>
                        <option value="con_referido">Vinieron Referidos</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Acceso a la App</label>
                    <select className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-sky-400"
                        value={appAccessFilter} onChange={(e) => setAppAccessFilter(e.target.value as AppAccessFilter)}>
                        <option value="todos">Cualquiera</option>
                        <option value="con_acceso">Con acceso</option>
                        <option value="sin_acceso">Sin acceso</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Ordenar Por</label>
                    <select className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-sky-400"
                        value={sortBy} onChange={(e) => setSortBy(e.target.value as SortFilter)}>
                        <option value="fecha_desc">Más Recientes Primero</option>
                        <option value="fecha_asc">Más Antiguos Primero</option>
                        <option value="nombre_asc">Alfabético (A-Z)</option>
                    </select>
                </div>
            </div>

            {pendingImportCount > 0 && (
                <div className="mb-4 flex items-center justify-between gap-3 p-3 rounded-xl bg-sky-50 border border-sky-200">
                    <div className="text-sm text-sky-800">
                        <span className="font-semibold">{pendingImportCount}</span> conductor(es) seleccionado(s) sin acceso a la App.
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" onClick={() => setSelectedIds(new Set())} disabled={bulkImporting}>
                            Limpiar selección
                        </Button>
                        <Button onClick={handleBulkImport} disabled={bulkImporting}>
                            {bulkImporting ? 'Invitando...' : `Invitar ${pendingImportCount} a core`}
                        </Button>
                    </div>
                </div>
            )}

            <Card title={`Conductores (${filteredAndSortedDrivers.length})`}>
                {loading ? (
                    <div className="py-10 text-center text-slate-500">Cargando base de datos...</div>
                ) : filteredAndSortedDrivers.length === 0 ? (
                    <EmptyState title="Sin resultados" subtitle="No hay conductores que coincidan con estos filtros." />
                ) : (
                    <DataTable
                        rows={filteredAndSortedDrivers}
                        columns={columns}
                        page={page}
                        pageSize={pageSize}
                        onPageChange={setPage}
                        edit={(driver) => setSelectedDriver({ ...driver, license_number: (driver as any).license_number || cedulaFor(driver) || null } as EnrichedDriverProfile)}
                        onDelete={handleDelete}
                        selectable
                        selectedIds={selectedIds}
                        onToggleSelect={toggleSelect}
                        onToggleSelectAll={toggleSelectAllVisible}
                        isRowSelectable={(r) => !appAccessIds.has(r.id)}
                        rowActions={(r) => appAccessIds.has(r.id) ? null : (
                                <Button
                                    onClick={() => handleImportOne(r)}
                                    disabled={importingIds.has(r.id) || !emailFor(r)}
                                    className="!px-3 !py-1.5 !text-xs"
                                >
                                    {importingIds.has(r.id) ? 'Importando...' : 'Invitar a core'}
                                </Button>
                            )
                        }
                    />
                )}
            </Card>

            <DriverReviewModal
                open={!!selectedDriver}
                driver={selectedDriver}
                onClose={() => setSelectedDriver(null)}
                onApprove={handleApprove}
                onReject={handleReject}
                onRefresh={fetchDrivers}
            />

            {postImportNotice && (
              <div role="status" className="mt-4 rounded-xl bg-sky-50 p-4">
                <p>Acceso verificado en core para {postImportNotice.count} conductor(es).
                Las cuentas nuevas reciben una invitación por correo para establecer su contraseña.</p>
                <Button onClick={() => setPostImportNotice(null)}>Entendido</Button>
              </div>
            )}
        </Page>
    );
};

export default DriversPage;
