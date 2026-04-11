'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface AddressSuggestion {
  display_name: string;
  lat: string;
  lon: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string) => void;
  onSelect?: (address: string, lat: number, lng: number) => void;
  placeholder?: string;
  className?: string;
}

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Start typing an address...',
  className = '',
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=us`,
        { headers: { 'User-Agent': '3BrothersMarketing/1.0' } },
      );
      if (!res.ok) return;
      const data: AddressSuggestion[] = await res.json();
      setSuggestions(data);
      setShowDropdown(data.length > 0);
      setActiveIndex(-1);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 350);
  };

  const handleSelect = (suggestion: AddressSuggestion) => {
    onChange(suggestion.display_name);
    setShowDropdown(false);
    setSuggestions([]);
    onSelect?.(
      suggestion.display_name,
      parseFloat(suggestion.lat),
      parseFloat(suggestion.lon),
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
          placeholder={placeholder}
          className={className}
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          aria-controls="address-suggestions"
          aria-activedescendant={activeIndex >= 0 ? `address-option-${activeIndex}` : undefined}
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-amber-500" />
          </div>
        )}
      </div>

      {showDropdown && suggestions.length > 0 && (
        <ul
          id="address-suggestions"
          role="listbox"
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto"
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.lat}-${s.lon}`}
              id={`address-option-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onClick={() => handleSelect(s)}
              className={`px-3 py-2.5 text-sm cursor-pointer border-b border-gray-50 last:border-b-0 ${
                i === activeIndex
                  ? 'bg-amber-50 text-amber-900'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
                <span className="break-words">{s.display_name}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
