import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Page } from '@/components/layout/Page';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useDebounced } from '@/hooks/useDebounced';
import { formatDate } from '@/utils/formatDate';
import { classNames } from '@/utils/classNames';
import { toast } from '@/utils/toast';
import { supabase } from '@/config/supabase';
import { DriversService } from '@/services/drivers.service';
import DriverReviewModal, { type EnrichedDriverProfile } from './DriverReviewModal';

// 1. SOLUCIÓN TS: Tipos estrictos para eliminar el uso de `as any`
type StatusFilter = 'todos' | 'pendiente' | 'aprobado' | 'bloqueado';
type ReferralFilter = 'todos' | 'con_referido';
type SortFilter = 'fecha_desc' | 'fecha_asc' | 'nombre_asc';

export const DriversPage: React.FC = () => {
    const [drivers, setDrivers] = useState<EnrichedDriverProfile[]>([]);
    const [loading, setLoading] = useState(true);

    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
    const [referralFilter, setReferralFilter] = useState<ReferralFilter>('todos');
    const [sortBy, setSortBy] = useState<SortFilter>('fecha_desc');

    const [page, setPage] = useState(1);
    const pageSize = 10;
    const [selectedDriver, setSelectedDriver] = useState<EnrichedDriverProfile | null>(null);

    const debouncedQuery = useDebounced(query, 500);

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
                const { data: refCodes } = await supabase.from('referral_codes').select('referral_code, driver_id').in('referral_code', uniqueCodes);
                if (refCodes && refCodes.length > 0) {
                    const driverIds = refCodes.map(rc => rc.driver_id);
                    const { data: users } = await supabase.from('users').select('id, first_name, last_name').in('id', driverIds);

                    refCodes.forEach(rc => {
                        const user = users?.find(u => u.id === rc.driver_id);
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

    // useEffect ahora tiene sus dependencias perfectas
    useEffect(() => {
        fetchDrivers();
    }, [fetchDrivers]);

    const filteredAndSortedDrivers = useMemo(() => {
        let result = [...drivers];

        if (statusFilter === 'pendiente') result = result.filter(d => !d.approved && !d.blocked);
        if (statusFilter === 'aprobado') result = result.filter(d => d.approved && !d.blocked);
        if (statusFilter === 'bloqueado') result = result.filter(d => d.blocked);
        if (referralFilter === 'con_referido') result = result.filter(d => d.referral_id && d.referral_id.trim() !== '');

        result.sort((a, b) => {
            if (sortBy === 'nombre_asc') return a.first_name.localeCompare(b.first_name);
            const dateA = new Date(a.created_at || 0).getTime();
            const dateB = new Date(b.created_at || 0).getTime();
            return sortBy === 'fecha_desc' ? dateB - dateA : dateA - dateB;
        });

        return result;
    }, [drivers, statusFilter, referralFilter, sortBy]);

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

    const columns: Column<EnrichedDriverProfile>[] = [
        { header: "Nombre", accessor: (r) => <span className="font-medium text-[#002f45]">{r.first_name} {r.last_name}</span> },
        { header: "Correo", accessor: (r) => r.email },
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
        { header: "Registro", accessor: (r) => r.created_at ? formatDate(r.created_at) : 'N/A' },
    ];

    return (
        <Page title="Gestión de Conductores">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <div className="col-span-1 md:col-span-4 lg:col-span-1">
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
                    <label className="block text-xs font-medium text-slate-500 mb-1">Ordenar Por</label>
                    <select className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-sky-400"
                        value={sortBy} onChange={(e) => setSortBy(e.target.value as SortFilter)}>
                        <option value="fecha_desc">Más Recientes Primero</option>
                        <option value="fecha_asc">Más Antiguos Primero</option>
                        <option value="nombre_asc">Alfabético (A-Z)</option>
                    </select>
                </div>
            </div>

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
                        edit={(driver) => setSelectedDriver(driver)}
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
        </Page>
    );
};

export default DriversPage;