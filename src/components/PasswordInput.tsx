import { forwardRef, useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  hasError?: boolean;
};

export const PasswordInput = forwardRef<HTMLInputElement, Props>(
  ({ className, hasError, ...props }, ref) => {
    const [show, setShow] = useState(false);
    return (
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          ref={ref}
          type={show ? "text" : "password"}
          className={cn(
            "h-11 w-full rounded-lg border bg-background pl-10 pr-11 text-sm outline-none transition placeholder:text-muted-foreground/70",
            "focus:ring-4 focus:ring-primary/15 focus:border-primary",
            hasError ? "border-destructive focus:border-destructive focus:ring-destructive/15" : "border-input",
            className,
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition"
          tabIndex={-1}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";
