import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Filter, Clock, User, Paperclip } from 'lucide-react';
import Button from '@/components/ui/Button';

export interface SearchFilters {
  from?: string;
  to?: string;
  subject?: string;
  hasAttachments?: boolean;
  isUnread?: boolean;
  isStarred?: boolean;
  dateRange?: {
    start?: string;
    end?: string;
  };
  folder?: string;
  priority?: 'high' | 'normal' | 'low';
}

interface SearchBarProps {
  onSearch: (query: string, filters?: SearchFilters) => void;
  onFilter?: (filters: SearchFilters) => void;
  placeholder?: string;
  className?: string;
  showAdvancedFilters?: boolean;
  initialFilters?: SearchFilters;
  initialQuery?: string;
  onClear?: () => void;
  onToggleFilters?: () => void;
  controlled?: boolean; // New prop to enable controlled mode
  externalShowFilters?: boolean; // External control of filter visibility
}

interface SearchSuggestion {
  type: 'query' | 'filter' | 'recent';
  value: string;
  label: string;
  icon?: React.ReactNode;
}

const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  onFilter,
  placeholder = "Search emails...",
  className = "",
  showAdvancedFilters = true,
  initialFilters = {},
  initialQuery = '',
  onClear,
  onToggleFilters,
  controlled = false,
  externalShowFilters = false
}) => {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [isFocused, setIsFocused] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(initialFilters);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);

  // Update internal state when external props change (for controlled mode)
  useEffect(() => {
    if (controlled) {
      setSearchQuery(initialQuery);
    }
  }, [initialQuery, controlled]);

  useEffect(() => {
    if (controlled) {
      setFilters(initialFilters);
    }
  }, [initialFilters, controlled]);

  useEffect(() => {
    if (controlled) {
      setShowFilters(externalShowFilters);
    }
  }, [externalShowFilters, controlled]);

  // Smart search suggestions based on input
  const getSearchSuggestions = (query: string): SearchSuggestion[] => {
    if (!query.trim()) return [];
    
    const suggestions: SearchSuggestion[] = [];
    
    // Recent searches (mock data - in real app this would come from storage)
    const recentSearches = ['GitHub notifications', 'team meeting', 'invoice'];
    recentSearches
      .filter(search => search.toLowerCase().includes(query.toLowerCase()))
      .forEach(search => {
        suggestions.push({
          type: 'recent',
          value: search,
          label: search,
          icon: <Clock size={14} />
        });
      });
    
    // Smart filter suggestions
    if (query.includes('@')) {
      suggestions.push({
        type: 'filter',
        value: `from:${query}`,
        label: `From: ${query}`,
        icon: <User size={14} />
      });
    }
    
    if (query.toLowerCase().includes('attachment')) {
      suggestions.push({
        type: 'filter',
        value: 'has:attachment',
        label: 'Has attachments',
        icon: <Paperclip size={14} />
      });
    }
    
    return suggestions.slice(0, 5);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch();
  };

  const performSearch = () => {
    setShowSuggestions(false);
    onSearch(searchQuery, Object.keys(filters).length > 0 ? filters : undefined);
  };
  const handleClear = () => {
    if (controlled && onClear) {
      onClear();
    } else {
      setSearchQuery('');
      setFilters({});
      onSearch('', {});
    }
  };

  const handleFilterToggle = () => {
    if (controlled && onToggleFilters) {
      onToggleFilters();
    } else {
      setShowFilters(!showFilters);
    }
  };

  const handleFilterChange = (key: keyof SearchFilters, value: any) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFilter?.(newFilters);
  };

  const applySuggestion = (suggestion: SearchSuggestion) => {
    if (suggestion.type === 'filter') {
      // Parse filter suggestions like "from:email@example.com" or "has:attachment"
      if (suggestion.value.startsWith('from:')) {
        const email = suggestion.value.replace('from:', '');
        handleFilterChange('from', email);
      } else if (suggestion.value === 'has:attachment') {
        handleFilterChange('hasAttachments', true);
      }
    } else {
      setSearchQuery(suggestion.value);
    }
    setShowSuggestions(false);
    setTimeout(performSearch, 0);
  };

  const getActiveFilterCount = () => {
    return Object.values(filters).filter(value => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') return value.trim() !== '';
      if (typeof value === 'object' && value !== null) {
        return Object.values(value).some(v => v !== undefined && v !== '');
      }
      return false;
    }).length;
  };

  // Close filters when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) {
        setShowFilters(false);
      }
    };

    if (showFilters) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showFilters]);

  const suggestions = getSearchSuggestions(searchQuery);
  const activeFilterCount = getActiveFilterCount();

  return (
    <div className={`relative ${className}`} ref={filtersRef}>
      <form onSubmit={handleSearch}>
        <div className={`
          relative flex items-center border rounded-lg transition-all duration-200
          ${isFocused 
            ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-500/20 dark:ring-blue-400/20' 
            : 'border-gray-300 dark:border-gray-600'
          }
          bg-white dark:bg-gray-800
        `}>
          <div className="absolute left-3 flex items-center pointer-events-none">
            <Search size={18} className="text-gray-400 dark:text-gray-500" />
          </div>
          
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSuggestions(e.target.value.length > 0);
            }}
            onFocus={() => {
              setIsFocused(true);
              setShowSuggestions(searchQuery.length > 0);
            }}
            onBlur={() => {
              setIsFocused(false);
              // Delay hiding suggestions to allow clicks
              setTimeout(() => setShowSuggestions(false), 150);
            }}
            placeholder={placeholder}
            className="
              w-full pl-10 pr-20 py-2.5 text-sm
              bg-transparent
              text-gray-900 dark:text-gray-100
              placeholder-gray-500 dark:placeholder-gray-400
              focus:outline-none
            "
          />
          
          <div className="absolute right-2 flex items-center space-x-1">
            {searchQuery && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleClear}
                className="h-6 w-6 p-0 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X size={14} className="text-gray-400 dark:text-gray-500" />
              </Button>
            )}
            
            {showAdvancedFilters && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleFilterToggle}
                className={`h-6 w-6 p-0 hover:bg-gray-100 dark:hover:bg-gray-700 relative ${
                  activeFilterCount > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                <Filter size={14} />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            )}
          </div>
        </div>
      </form>
      
      {/* Search Suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
          <div className="py-2">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                type="button"
                onClick={() => applySuggestion(suggestion)}
                className="w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-sm"
              >
                {suggestion.icon}
                <span className="text-gray-900 dark:text-gray-100">{suggestion.label}</span>
                <span className="ml-auto text-xs text-gray-500 dark:text-gray-400 capitalize">
                  {suggestion.type}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Advanced Filters Panel */}
      {showFilters && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-40 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                From
              </label>
              <input
                type="text"
                value={filters.from || ''}
                onChange={(e) => handleFilterChange('from', e.target.value)}
                placeholder="sender@example.com"
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-transparent text-gray-900 dark:text-gray-100"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Subject
              </label>
              <input
                type="text"
                value={filters.subject || ''}
                onChange={(e) => handleFilterChange('subject', e.target.value)}
                placeholder="Meeting notes"
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-transparent text-gray-900 dark:text-gray-100"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Date From
              </label>
              <input
                type="date"
                value={filters.dateRange?.start || ''}
                onChange={(e) => handleFilterChange('dateRange', { ...filters.dateRange, start: e.target.value })}
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-transparent text-gray-900 dark:text-gray-100"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Date To
              </label>
              <input
                type="date"
                value={filters.dateRange?.end || ''}
                onChange={(e) => handleFilterChange('dateRange', { ...filters.dateRange, end: e.target.value })}
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-transparent text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
          
          <div className="flex flex-wrap gap-3 mt-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filters.hasAttachments || false}
                onChange={(e) => handleFilterChange('hasAttachments', e.target.checked)}
                className="rounded"
              />
              <Paperclip size={14} />
              <span className="text-gray-700 dark:text-gray-300">Has attachments</span>
            </label>
            
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filters.isUnread || false}
                onChange={(e) => handleFilterChange('isUnread', e.target.checked)}
                className="rounded"
              />
              <span className="text-gray-700 dark:text-gray-300">Unread only</span>
            </label>
            
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filters.isStarred || false}
                onChange={(e) => handleFilterChange('isStarred', e.target.checked)}
                className="rounded"
              />
              <span className="text-gray-700 dark:text-gray-300">Starred only</span>
            </label>
          </div>
          
          <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-200 dark:border-gray-600">
            <Button
              type="button"
              variant="ghost"
              size="small"
              onClick={() => {
                setFilters({});
                onFilter?.({});
              }}
              className="text-gray-600 dark:text-gray-400"
            >
              Clear filters
            </Button>
            
            <Button
              type="button"
              size="small"
              onClick={() => {
                setShowFilters(false);
                performSearch();
              }}
            >
              Apply filters
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchBar;
