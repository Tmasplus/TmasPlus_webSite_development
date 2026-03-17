import React, { useState } from "react";
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
  const isPassword = props.type === "password";
  const [showPassword, setShowPassword] = useState(false);
  const inputType = isPassword ? (showPassword ? "text" : "password") : props.type;

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
            (!!right || isPassword) ? "pr-10" : ""
          )}
          {...props}
          type={inputType}
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
        {isPassword ? (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-3 grid place-items-center text-slate-400 hover:text-slate-600 focus:outline-none"
            title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {showPassword ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
               </svg>
            )}
          </button>
        ) : (
          right && <div className="absolute inset-y-0 right-2 grid place-items-center">{right}</div>
        )}
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

