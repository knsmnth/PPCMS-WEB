import React, { useRef } from 'react';
import Select from 'react-select';
import { useVirtualizer } from '@tanstack/react-virtual';

export const customStyles = {
  control: (provided, state) => ({
    ...provided,
    height: '2.75rem',
    minHeight: '2.75rem',
    borderRadius: 'var(--radius-sm)',
    border: state.isFocused ? '1px solid var(--primary)' : '1px solid var(--border)',
    boxShadow: state.isFocused ? '0 0 0 1px var(--primary)' : 'none',
    backgroundColor: '#fff',
    '&:hover': {
      border: '1px solid var(--primary)',
    },
    fontSize: '0.875rem'
  }),
  option: (provided, state) => ({
    ...provided,
    backgroundColor: state.isSelected 
      ? 'var(--primary)' 
      : state.isFocused 
        ? 'var(--muted)' 
        : 'transparent',
    color: state.isSelected ? '#fff' : 'var(--foreground)',
    fontSize: '0.875rem',
    cursor: 'pointer',
  }),
  menu: (provided) => ({
    ...provided,
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-md)',
    zIndex: 50,
    overflow: 'hidden'
  }),
  singleValue: (provided) => ({
    ...provided,
    color: 'var(--foreground)'
  })
};

const VirtualMenuList = ({ options, children, maxHeight, getValue }) => {
  const parentRef = useRef(null);
  
  const childArray = React.Children.toArray(children);
  
  const rowVirtualizer = useVirtualizer({
    count: childArray.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35, // default option height in px
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  return (
    <div 
      ref={parentRef} 
      style={{ maxHeight, overflowY: 'auto' }}
    >
      <div 
        style={{
          height: `${totalSize}px`,
          width: '100%',
          position: 'relative'
        }}
      >
        {virtualItems.map((virtualRow) => {
          const child = childArray[virtualRow.index];
          return (
            <div
              key={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`
              }}
            >
              {child}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export function SelectCombo({ options, value, onChange, placeholder = "Select...", disabled = false, ...props }) {
  const selectedOption = options.find(o => o.value === value) || null;
  return (
    <Select
      options={options}
      value={selectedOption}
      onChange={(opt) => onChange(opt ? opt.value : '')}
      placeholder={placeholder}
      isDisabled={disabled}
      styles={{
        ...customStyles,
        menuPortal: base => ({ ...base, zIndex: 9999 })
      }}
      isClearable={false}
      isSearchable={true}
      components={{ MenuList: VirtualMenuList }}
      menuPortalTarget={document.body}
      menuPosition="fixed"
      {...props}
    />
  );
}
