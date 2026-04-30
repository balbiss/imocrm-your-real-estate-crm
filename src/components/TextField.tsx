import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  icon?: ReactNode;
  hasError?: boolean;
};

export const TextField = forwardRef<HTMLInputElement, Props>(
  ({ className, icon, hasError, ...props }, ref) => {
    return (
      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </span>
        ) : null}
        <input
          ref={ref}
          className={cn(
            "h-11 w-full rounded-lg border bg-background text-sm outline-none transition placeholder:text-muted-foreground/70",
            "focus:ring-4 focus:ring-primary/15 focus:border-primary",
            icon ? "pl-10 pr-3" : "px-3",
            hasError ? "border-destructive focus:border-destructive focus:ring-destructive/15" : "border-input",
            className,
          )}
          {...props}
        />
      </div>
    );
  }
);
TextField.displayName = "TextField";
