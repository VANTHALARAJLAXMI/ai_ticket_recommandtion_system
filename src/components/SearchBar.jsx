import { Search } from 'lucide-react';

export default function SearchBar({ id, value, onChange, placeholder, label = 'Search' }) {
  return (
    <div className="search-bar">
      <Search size={18} aria-hidden="true" />
      <label className="sr-only" htmlFor={id}>{label}</label>
      <input id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}
