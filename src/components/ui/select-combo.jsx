import React from 'react';
import Select from 'react-select';

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

export function SelectCombo({ options, value, onChange, placeholder = "Select...", disabled = false, ...props }) {
  const selectedOption = options.find(o => o.value === value) || null;
  return (
    <Select
      options={options}
      value={selectedOption}
      onChange={(opt) => onChange(opt ? opt.value : '')}
      placeholder={placeholder}
      isDisabled={disabled}
      styles={customStyles}
      isClearable={false}
      isSearchable={true}
      {...props}
    />
  );
}
