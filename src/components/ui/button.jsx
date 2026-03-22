import React from "react";
import { Slot } from "@radix-ui/react-slot";
import clsx from "clsx";
import styles from "./button.module.css";

const Button = React.forwardRef(({ className, variant = "default", size = "md", asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={clsx(
        styles.button,
        styles[variant],
        styles[size],
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Button.displayName = "Button";

export { Button };
