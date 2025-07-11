import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { toast } from '@/lib/toast';
import { generateEnhancedMockEmails, generateRandomMockEmail } from '@/lib/mockData';

// Email interface matching the existing structure
export interface Email {
  id: string;
  sender: string;
  senderName?: string;
  senderEmail: string;
  recipient?: string;
  subject: string;
  preview: string;
  content?: string;
  time: string;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  attachments?: Array<{
    id: string;
    name: string;
    size: string;
    type: string;
  }>;
  isImportant: boolean;
  timestamp: Date;
  priority?: 'high' | 'normal' | 'low';
  folder?: string;
}

// Navigation item interface for sidebar/flowbar
export interface NavigationItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  badge?: number;
}

interface EmailContextType {
  emails: Email[];
  unreadCount: number;
  markAsRead: (emailId: string) => void;
  markAsUnread: (emailId: string) => void;
  toggleEmailRead: (emailId: string) => void;
  deleteEmail: (emailId: string) => void;
  starEmail: (emailId: string) => void;
  unstarEmail: (emailId: string) => void;
  toggleEmailStarred: (emailId: string) => void;
  addEmail: (email: Omit<Email, 'id' | 'timestamp'>) => void;
  refreshEmails: () => Promise<void>;
  showUnreadBadge: boolean;
  setShowUnreadBadge: (show: boolean) => void;
  // Development tools - remove in production
  pingNewEmail: () => void;
  // TODO: Add API integration methods
  // fetchEmails: () => Promise<void>;
  // syncWithServer: () => Promise<void>;
}

const EmailContext = createContext<EmailContextType | undefined>(undefined);

// Mock email data - Replace with API calls in production
const initialEmails: Email[] = generateEnhancedMockEmails();

export const EmailProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [emails, setEmails] = useState<Email[]>(initialEmails);
  const [showUnreadBadge, setShowUnreadBadge] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedPref = localStorage.getItem('showUnreadBadge');
      return savedPref === null ? true : savedPref === 'true';
    }
    return true;
  });

  // Calculate unread count
  const unreadCount = emails.filter(email => !email.isRead).length;

  // Listen for changes to notification badge setting
  useEffect(() => {
    const handleStorageChange = () => {
      const savedPref = localStorage.getItem('showUnreadBadge');
      setShowUnreadBadge(savedPref === null ? true : savedPref === 'true');
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const markAsRead = (emailId: string) => {
    setEmails(prev => prev.map(email => 
      email.id === emailId ? { ...email, isRead: true } : email
    ));
    // TODO: Add API call to mark email as read
    // await apiFetch(`/api/emails/${emailId}/read`, { method: 'PATCH' });
  };

  const markAsUnread = (emailId: string) => {
    setEmails(prev => prev.map(email => 
      email.id === emailId ? { ...email, isRead: false } : email
    ));
    // TODO: Add API call to mark email as unread
    // await apiFetch(`/api/emails/${emailId}/unread`, { method: 'PATCH' });
  };

  const toggleEmailRead = (emailId: string) => {
    setEmails(prev => prev.map(email => 
      email.id === emailId ? { ...email, isRead: !email.isRead } : email
    ));
  };

  const deleteEmail = (emailId: string) => {
    setEmails(prev => prev.filter(email => email.id !== emailId));
    toast.success('Email deleted successfully');
    // TODO: Add API call to delete email
    // await apiFetch(`/api/emails/${emailId}`, { method: 'DELETE' });
  };

  const starEmail = (emailId: string) => {
    setEmails(prev => prev.map(email => 
      email.id === emailId ? { ...email, isStarred: true } : email
    ));
    // TODO: Add API call to star email
    // await apiFetch(`/api/emails/${emailId}/star`, { method: 'PATCH' });
  };

  const unstarEmail = (emailId: string) => {
    setEmails(prev => prev.map(email => 
      email.id === emailId ? { ...email, isStarred: false } : email
    ));
  };

  const toggleEmailStarred = (emailId: string) => {
    setEmails(prev => prev.map(email => 
      email.id === emailId ? { ...email, isStarred: !email.isStarred } : email
    ));
  };

  const addEmail = (emailData: Omit<Email, 'id' | 'timestamp'>) => {
    const newEmail: Email = {
      ...emailData,
      id: Date.now().toString(),
      timestamp: new Date(),
    };
    setEmails(prev => [newEmail, ...prev]);
    
    // Show toast notification for new email
    toast.info(`New email from ${newEmail.sender}: ${newEmail.subject}`, {
      position: 'top-right',
      autoClose: 5000,
    });
  };

  const refreshEmails = async () => {
    // TODO: Replace with actual API call
    // Example: await fetchEmailsFromAPI();
    
    // Mock implementation - remove in production
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Real implementation would be:
    // try {
    //   const response = await apiFetch('/api/emails');
    //   setEmails(response.emails);
    // } catch (error) {
    //   toast.error('Failed to refresh emails');
    // }
  };

  // Development tool: Generate a new email
  const pingNewEmail = () => {
    const newEmailData = generateRandomMockEmail();
    addEmail(newEmailData);
  };

  const contextValue: EmailContextType = {
    emails,
    unreadCount,
    markAsRead,
    markAsUnread,
    toggleEmailRead,
    deleteEmail,
    starEmail,
    unstarEmail,
    toggleEmailStarred,
    addEmail,
    refreshEmails,
    showUnreadBadge,
    setShowUnreadBadge,
    pingNewEmail,
  };

  return (
    <EmailContext.Provider value={contextValue}>
      {children}
    </EmailContext.Provider>
  );
};

export const useEmail = (): EmailContextType => {
  const context = useContext(EmailContext);
  if (context === undefined) {
    throw new Error('useEmail must be used within an EmailProvider');
  }
  return context;
};
