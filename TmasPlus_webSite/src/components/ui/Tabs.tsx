import { classNames } from "@/utils/classNames";

type Tab = { value: string; label: string };

type Props = {
  tabs: Tab[];
  value: string;
  onChange: (value: string) => void;
};

export const Tabs: React.FC<Props> = ({ tabs, value, onChange }) => (
  <div className="flex items-center gap-2">
    {tabs.map((t) => (
      <button
        key={t.value}
        type="button"
        onClick={() => onChange(t.value)}
        className={classNames(
          "px-3 py-1.5 text-sm rounded-xl border",
          value === t.value
            ? "bg-sky-600 border-sky-600 text-white"
            : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
        )}
      >
        {t.label}
      </button>
    ))}
  </div>
);
