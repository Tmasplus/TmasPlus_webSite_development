import { classNames } from "@/utils/classNames";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export const Button: React.FC<Props> = ({ variant = "primary", type = "button", className, children, ...rest }) => (
  <button
    type={type}
    className={classNames(
      "inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 shadow-lg",
      variant === "primary" && "bg-gradient-to-b from-sky-500 to-sky-600 text-white hover:from-sky-600 hover:to-sky-700 focus:ring-sky-400",
      variant === "secondary" && "bg-gradient-to-b from-white to-gray-100 text-slate-700 border border-slate-300 hover:bg-slate-50 focus:ring-sky-400",
      variant === "ghost" && "bg-transparent text-slate-700 hover:bg-slate-100 focus:ring-sky-400",
      className
    )}
    {...rest}
  >
    {children}
</button>

);
