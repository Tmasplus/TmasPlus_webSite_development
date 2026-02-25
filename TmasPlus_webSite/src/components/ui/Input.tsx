import { classNames } from "@/utils/classNames";

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className,
  ...rest
}) => (
  <input
    className={classNames(
      "rounded-xl border border-slate-300 px-3 py-2 text-sm w-full outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 placeholder:text-slate-400",
      className
    )}
    {...rest}
  />
);
