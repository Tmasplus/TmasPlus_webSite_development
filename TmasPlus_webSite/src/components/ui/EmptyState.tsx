type Props = {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
};

export const EmptyState: React.FC<Props> = ({ title, subtitle, action }) => (
  <div className="flex flex-col items-center justify-center text-center p-12">
    <div className="w-14 h-14 rounded-full bg-slate-100 grid place-items-center mb-3">👀</div>
    <h3 className="text-slate-800 font-medium">{title}</h3>
    {subtitle && <p className="text-slate-500 text-sm mt-1">{subtitle}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
