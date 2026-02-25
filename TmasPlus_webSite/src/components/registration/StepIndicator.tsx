import React from 'react';

interface Step {
    number: number;
    label: string;
}

interface StepIndicatorProps {
    steps: Step[];
    currentStep: number;
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({ steps, currentStep }) => {
    return (
        <div className="flex items-center justify-between w-full mb-8">
            {steps.map((step, index) => {
                const isCompleted = step.number < currentStep;
                const isCurrent = step.number === currentStep;

                return (
                    <React.Fragment key={step.number}>
                        <div className="flex flex-col items-center gap-1.5 flex-1">
                            <div
                                className={`
                  w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300
                  ${isCompleted ? 'bg-sky-500 text-white shadow-md shadow-sky-200' : ''}
                  ${isCurrent ? 'bg-[#002f45] text-white shadow-md shadow-slate-300 ring-4 ring-[#002f45]/20' : ''}
                  ${!isCompleted && !isCurrent ? 'bg-slate-200 text-slate-400' : ''}
                `}
                            >
                                {isCompleted ? (
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                ) : (
                                    step.number
                                )}
                            </div>
                            <span
                                className={`text-xs font-medium text-center leading-tight transition-colors duration-200 ${isCurrent ? 'text-[#002f45]' : isCompleted ? 'text-sky-500' : 'text-slate-400'
                                    }`}
                            >
                                {step.label}
                            </span>
                        </div>

                        {index < steps.length - 1 && (
                            <div className="relative flex-1 h-0.5 -mt-5 mx-1">
                                <div className="absolute inset-0 bg-slate-200 rounded" />
                                <div
                                    className="absolute inset-0 bg-sky-500 rounded transition-all duration-500 origin-left"
                                    style={{ transform: `scaleX(${isCompleted ? 1 : 0})` }}
                                />
                            </div>
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

export default StepIndicator;
