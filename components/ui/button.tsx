import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand/50 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // The "Primary" Button: Dark Glass with a subtle brand-tinted border
        brand: `
          relative 
          bg-slate-950/40 
          text-slate-100 
          backdrop-blur-xl
          border border-[#0000004d]
          shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_rgba(0,0,0,0.4)]
          hover:bg-slate-900/60 
          hover:border-brand/50 
          hover:shadow-[0_0_20px_rgba(124,58,237,0.15)]
        `,
        
        // The "Secondary" Button: Transparent/Slate until hover
        brandOutline: `
          bg-transparent 
          text-slate-400 
          border border-white/10 
          hover:border-brand/40 
          hover:text-slate-100 
          hover:bg-brand/5
        `,

        // Monochrome button for less important actions
        outline: `
          border border-white/10 
          bg-white/[0.03] 
          text-slate-300 
          hover:bg-white/[0.08] 
          hover:text-white 
          hover:border-white/20
        `,

        ghost: "text-slate-400 hover:text-white hover:bg-white/5",
        
        destructive: "bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20",
        
        link: "text-brand/80 underline-offset-4 hover:underline hover:text-brand",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-12 rounded-2xl px-10 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "brand",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };