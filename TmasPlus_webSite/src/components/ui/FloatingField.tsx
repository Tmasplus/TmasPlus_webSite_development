import React from "react";
import { classNames } from "@/utils/classNames";

type BaseProps = {
  id: string;
  label: string;
  helpText?: string;
  error?: string;
  className?: string;
  right?: React.ReactNode; // ícono o addon derecho
};

export const FloatingInput: React.FC<
  BaseProps & React.InputHTMLAttributes<HTMLInputElement>
> = ({ id, label, helpText, error, className, right, required, ...props }) => {
  return (
    <div className={classNames("w-full", className)}>
      <div className="relative">
        <input
          id={id}
          placeholder=" "
          className={classNames(
            "peer block w-full rounded-xl border bg-white px-3 py-3 text-sm outline-none transition",
            "border-slate-300 focus:ring-2 focus:ring-primary focus:border-primary",
            required && !props.value && "border-red-400",
            error && "border-red-300 focus:ring-red-300 focus:border-red-300",
            right && "pr-10"
          )}
          {...props}
        />
        <label
          htmlFor={id}
          className={classNames(
            "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 bg-white px-1 text-slate-500 transition-all",
            required ? "text-slate-700 font-medium" : "text-slate-500",
            "peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-sm",
            "peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:text-xs",
            "!top-0 peer-not-placeholder-shown:text-xs peer-not-placeholder-shown:-translate-y-1/2"
          )}
        >
          {label}
          {required && !props.value && <span className="ml-1 text-red-500">*</span>}
        </label>
        {right && <div className="absolute inset-y-0 right-2 grid place-items-center">{right}</div>}
      </div>
      {helpText && !error && <p className="mt-1 text-xs text-slate-500">{helpText}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};

export const FloatingSelect: React.FC<
  BaseProps & React.SelectHTMLAttributes<HTMLSelectElement>
> = ({ id, label, helpText, error, className, required, children, ...props }) => {
  return (
    <div className={classNames("w-full", className)}>
      <div className="relative">
        <select
          id={id}
          className={classNames(
            "peer block w-full rounded-xl border bg-white px-3 py-3 text-sm outline-none transition",
            "border-slate-300 focus:ring-2 focus:ring-primary focus:border-primary",
            error && "border-red-300 focus:ring-red-300 focus:border-red-300",
            required && !props.value && "border-red-400",
          )}
          defaultValue=""
          {...props}
        >
          <option value="" disabled hidden />
          {children}
        </select>
        <label
          htmlFor={id}
          className={classNames(
            "pointer-events-none absolute left-3 top-0 -translate-y-1/2 bg-white px-1 text-xs text-slate-500",
            required ? "text-slate-700 font-medium" : "text-slate-500",
            "peer-focus:text-primary"
          )}
        >
          {label}
          {required && !props.value && <span className="ml-1 text-red-500">*</span>}
        </label>
      </div>
      {helpText && !error && <p className="mt-1 text-xs text-slate-500">{helpText}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};

export const Checkbox: React.FC<
  { label: string } & React.InputHTMLAttributes<HTMLInputElement>
> = ({ label, required, checked, className, ...props }) => {
  const isInvalid = required && !checked;

  return (
    <label
      className={classNames(
        "flex items-start gap-2 select-none rounded-lg p-2 transition",
        isInvalid && "bg-amber-50"
      )}
    >
      <input
        type="checkbox"
        className={classNames(
          "mt-1 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary",
          isInvalid && "border-amber-400 focus:ring-amber-400"
        )}
        required={required}
        checked={checked}
        {...props}
      />

      <div className="flex flex-col">
        <span className="text-sm text-slate-700">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </span>

        {isInvalid && (
          <span className="text-xs text-amber-600">
            Este campo es obligatorio
          </span>
        )}
      </div>
    </label>
  );
};

