import React from "react";
import clsx from "clsx";
import styles from "./input.module.css";

const Select = React.forwardRef(({ className, children, ...props }, ref) => {
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <select
        className={clsx(styles.input, className)}
        ref={ref}
        style={{ 
          appearance: 'none', 
          backgroundColor: '#fff',
          paddingRight: '2.5rem'
        }}
        {...props}
      >
        {children}
      </select>
      <div style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--muted-foreground)' }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </div>
    </div>
  );
});
Select.displayName = "Select";

export { Select };
