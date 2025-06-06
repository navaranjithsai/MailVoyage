import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Search, Filter } from 'lucide-react';
import SearchBar, { SearchFilters } from '@/components/email/SearchBar';
import EmailList from '@/components/email/EmailList';
import Button from '@/components/ui/Button';

const SearchPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Parse URL parameters on mount
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const query = searchParams.get('q') || '';
    const from = searchParams.get('from') || undefined;
    const subject = searchParams.get('subject') || undefined;
    const hasAttachments = searchParams.get('attachments') ? searchParams.get('attachments') === 'true' : undefined;
    const isUnread = searchParams.get('unread') ? searchParams.get('unread') === 'true' : undefined;
    const isStarred = searchParams.get('starred') ? searchParams.get('starred') === 'true' : undefined;
    const priority = searchParams.get('priority') as 'high' | 'normal' | 'low' | undefined;

    setSearchQuery(query);
    setSearchFilters({
      from,
      subject,
      hasAttachments,
      isUnread,
      isStarred,
      priority
    });

    // Show filters if any are applied
    const hasActiveFilters = from || subject || hasAttachments !== undefined || 
                           isUnread !== undefined || isStarred !== undefined || priority;
    setShowFilters(!!hasActiveFilters);
  }, [location.search]);

  // Update URL when search changes
  const updateURL = (query: string, filters: SearchFilters) => {
    const searchParams = new URLSearchParams();
    
    if (query.trim()) {
      searchParams.set('q', query);
    }
    
    if (filters.from) searchParams.set('from', filters.from);
    if (filters.subject) searchParams.set('subject', filters.subject);
    if (filters.hasAttachments !== undefined) searchParams.set('attachments', filters.hasAttachments.toString());
    if (filters.isUnread !== undefined) searchParams.set('unread', filters.isUnread.toString());
    if (filters.isStarred !== undefined) searchParams.set('starred', filters.isStarred.toString());
    if (filters.priority) searchParams.set('priority', filters.priority);

    const newURL = searchParams.toString() ? `/search?${searchParams.toString()}` : '/search';
    navigate(newURL, { replace: true });
  };
  const handleSearch = (query: string, filters?: SearchFilters) => {
    setIsSearching(true);
    setSearchQuery(query);
    setSearchFilters(filters || {});
    updateURL(query, filters || {});
    
    // Simulate search delay
    setTimeout(() => {
      setIsSearching(false);
    }, 300);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchFilters({});
    setShowFilters(false);
    navigate('/search', { replace: true });
  };

  const handleGoBack = () => {
    navigate(-1);
  };

  const hasActiveSearch = searchQuery.trim() || Object.keys(searchFilters).some(key => 
    searchFilters[key as keyof SearchFilters] !== undefined
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-6"
        >
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant="outline"
              size="small"
              onClick={handleGoBack}
              className="flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              Back
            </Button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Search Emails
            </h1>
          </div>          {/* Search Bar */}
          <SearchBar
            initialQuery={searchQuery}
            initialFilters={searchFilters}
            onSearch={handleSearch}
            onClear={handleClearSearch}
            onToggleFilters={() => setShowFilters(!showFilters)}
            showAdvancedFilters={true}
            externalShowFilters={showFilters}
            controlled={true}
            placeholder="Search emails by subject, sender, content..."
            className="mb-4"
          />

          {/* Search Stats */}
          {hasActiveSearch && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400"
            >
              <div className="flex items-center gap-4">
                {searchQuery && (
                  <span className="flex items-center gap-1">
                    <Search size={14} />
                    Searching for: "{searchQuery}"
                  </span>
                )}
                {Object.keys(searchFilters).length > 0 && (
                  <span className="flex items-center gap-1">
                    <Filter size={14} />
                    {Object.keys(searchFilters).length} filter{Object.keys(searchFilters).length === 1 ? '' : 's'} applied
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="small"
                onClick={handleClearSearch}
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Clear all
              </Button>
            </motion.div>
          )}
        </motion.div>

        {/* Search Results */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6"
        >
          {hasActiveSearch ? (
            <EmailList
              searchQuery={searchQuery}
              searchFilters={searchFilters}
              showFilters={showFilters}
              isSearching={isSearching}
              showPagination={true}
              limit={10}
              title="Search Results"
            />
          ) : (
            <div className="text-center py-16">
              <Search className="mx-auto h-16 w-16 text-gray-400 dark:text-gray-600 mb-6" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Search your emails
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
                Use the search bar above to find emails by subject, sender, content, or apply filters to narrow down your results.
              </p>
              
              {/* Quick search suggestions */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Quick searches:
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    { label: 'Unread emails', filters: { isUnread: true } },
                    { label: 'Starred emails', filters: { isStarred: true } },
                    { label: 'With attachments', filters: { hasAttachments: true } },
                    { label: 'High priority', filters: { priority: 'high' as const } }
                  ].map((suggestion, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      size="small"
                      onClick={() => handleSearch('', suggestion.filters)}
                      className="text-sm"
                    >
                      {suggestion.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default SearchPage;