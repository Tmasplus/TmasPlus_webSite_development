import { classNames } from "@/utils/classNames";

type Props = React.PropsWithChildren<{
  title?: string;
  className?: string;
}>;

export const Card: React.FC<Props> = ({ title, className, children }) => (
  <section className={classNames("bg-white rounded-2xl border border-slate-200 shadow-sm", className)}>
    {title && (
      <div className="px-4 py-3 border-b border-slate-100 text-slate-700 font-medium">
        {title}
      </div>
    )}
    <div className="p-4">{children}</div>
  </section>
);
