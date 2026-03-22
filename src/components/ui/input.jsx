import React from "react";
import clsx from "clsx";
import styles from "./input.module.css";

const Input = React.forwardRef(({ className, type = "text", ...props }, ref) => {
  return (
    <input
      type={type}
      className={clsx(styles.input, className)}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
