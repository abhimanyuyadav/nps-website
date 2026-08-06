import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("inline-flex items-center justify-center gap-2 rounded-xl font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:pointer-events-none disabled:opacity-50", {
  variants: { variant: { primary: "bg-blue-600 text-white shadow-[0_8px_18px_rgba(4,73,192,.25)] hover:bg-blue-700", light: "bg-white text-blue-700 shadow-sm hover:bg-blue-50", ghost: "text-blue-800 hover:bg-blue-50" }, size: { default: "px-5 py-3 text-sm", sm: "px-3 py-2 text-xs" } },
  defaultVariants: { variant: "primary", size: "default" },
});

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />);
Button.displayName = "Button";
