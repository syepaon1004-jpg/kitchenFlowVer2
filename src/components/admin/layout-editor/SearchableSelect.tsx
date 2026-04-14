import { useState, useMemo } from 'react';
import styles from './SearchableSelect.module.css';

interface SelectOption {
  id: string;
  label: string;
}

interface SearchableSelectProps {
  options: ReadonlyArray<SelectOption>;
  value: string;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  style?: React.CSSProperties;
  onChange: (value: string) => void;
}

const SEARCH_THRESHOLD = 5;

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  placeholder = '-- 선택 --',
  searchPlaceholder = '검색...',
  className,
  style,
  onChange,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const showSearch = options.length > SEARCH_THRESHOLD;

  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options;

    const term = searchTerm.toLowerCase();
    const matched = options.filter((o) => o.label.toLowerCase().includes(term));

    // 현재 선택값이 필터에서 빠지면 강제 포함 (blank 방지)
    if (value && !matched.some((o) => o.id === value)) {
      const current = options.find((o) => o.id === value);
      if (current) return [current, ...matched];
    }

    return matched;
  }, [options, searchTerm, value]);

  return (
    <div className={styles.root}>
      {showSearch && (
        <input
          type="text"
          className={styles.searchInput}
          placeholder={searchPlaceholder}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      )}
      <select
        className={className ?? styles.select}
        style={style}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {filteredOptions.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default SearchableSelect;
