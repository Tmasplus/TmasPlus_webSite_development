type Props = React.PropsWithChildren<{
  title: string;
  actions?: React.ReactNode;
}>;

export const Page: React.FC<Props> = ({ title, actions, children }) => (
  <div className="p-4 md:p-6">
    <div className="flex items-center justify-between">
      <h1 className="text-xl md:text-2xl font-semibold text-slate-800">{title}</h1>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
    <div className="mt-4">{children}</div>
  </div>
);
