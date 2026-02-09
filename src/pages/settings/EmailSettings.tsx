import React, { useState, useEffect } from 'react';
import { motion, easeOut } from 'framer-motion';
import { Plus, RefreshCw, Eye, EyeOff, Edit, Trash2, Info, X, Play, Star, Server } from 'lucide-react';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { apiFetch } from '../../lib/apiFetch';
import { toast } from '../../lib/toast';

interface EmailAccount {
  id: string;
  email: string;
  accountCode: string;
  isPrimary: boolean;
  incomingType: 'IMAP' | 'POP3';
  incomingHost: string;
  incomingPort: number;
  incomingUsername?: string;
  incomingSecurity: 'SSL' | 'STARTTLS' | 'NONE';
  outgoingHost: string;
  outgoingPort: number;
  outgoingUsername?: string;
  outgoingSecurity: 'SSL' | 'STARTTLS' | 'NONE';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AddAccountForm {
  email: string;
  password: string;
  showPassword: boolean;
  showManualSetup: boolean;
  incomingType: 'IMAP' | 'POP3';
  incomingHost: string;
  incomingPort: string;
  incomingUsername: string;
  incomingSecurity: 'SSL' | 'STARTTLS' | 'NONE';
  outgoingHost: string;
  outgoingPort: string;
  outgoingUsername: string;
  outgoingPassword: string;
  outgoingSecurity: 'SSL' | 'STARTTLS' | 'NONE';
}

interface EditAccountForm {
  id: string;
  accountCode: string;
  email: string;
  password: string;
  showPassword: boolean;
  showManualSetup: boolean;
  incomingType: 'IMAP' | 'POP3';
  incomingHost: string;
  incomingPort: string;
  incomingUsername: string;
  incomingSecurity: 'SSL' | 'STARTTLS' | 'NONE';
  outgoingHost: string;
  outgoingPort: string;
  outgoingUsername: string;
  outgoingPassword: string;
  outgoingSecurity: 'SSL' | 'STARTTLS' | 'NONE';
}

interface TestStatus {
  [accountId: string]: 'untested' | 'testing' | 'success' | 'error' | 'timeout';
}

interface TestResult {
  accountId: string;
  accountCode: string;
  email: string;
  status: 'success' | 'error' | 'timeout';
  message: string;
  details?: any;
}

interface EmailSettingsProps {
  isMobile: boolean;
}

const EmailSettings: React.FC<EmailSettingsProps> = ({ isMobile }) => {
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [smtpAccounts, setSmtpAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddSmtpModal, setShowAddSmtpModal] = useState(false);
  const [showEditSmtpModal, setShowEditSmtpModal] = useState(false);
  const [editingSmtp, setEditingSmtp] = useState<any | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<EmailAccount | null>(null);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [showTestAllDialog, setShowTestAllDialog] = useState(false);
  const [testingAccount, setTestingAccount] = useState<EmailAccount | null>(null);
  const [testStatus, setTestStatus] = useState<TestStatus>({});
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [isTestingAll, setIsTestingAll] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  // Previous test details (stored in sessionStorage) for dialogs
  const [previousTestContent, setPreviousTestContent] = useState<string>('');
  const [previousAllTestContent, setPreviousAllTestContent] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<{[key: string]: string}>({});
  const [smtpForm, setSmtpForm] = useState<{ email: string; host: string; port: string; security: 'SSL'|'TLS'|'STARTTLS'|'PLAIN'|'NONE'; username: string; password: string; showPassword: boolean }>({
    email: '', host: '', port: '', security: 'SSL', username: '', password: '', showPassword: false
  });
  const [smtpEditForm, setSmtpEditForm] = useState<{ email: string; host: string; port: string; security: 'SSL'|'TLS'|'STARTTLS'|'PLAIN'|'NONE'; username: string; password: string }>({
    email: '', host: '', port: '', security: 'SSL', username: '', password: ''
  });

  const [addForm, setAddForm] = useState<AddAccountForm>({
    email: '',
    password: '',
    showPassword: false,
    showManualSetup: false,
    incomingType: 'IMAP',
    incomingHost: '',
    incomingPort: '',
    incomingUsername: '',
    incomingSecurity: 'SSL',
    outgoingHost: '',
    outgoingPort: '',
    outgoingUsername: '',
    outgoingPassword: '',
    outgoingSecurity: 'SSL',
  });

  const [editForm, setEditForm] = useState<EditAccountForm>({
    id: '',
    accountCode: '',
    email: '',
    password: '',
    showPassword: false,
    showManualSetup: true,
    incomingType: 'IMAP',
    incomingHost: '',
    incomingPort: '',
    incomingUsername: '',
    incomingSecurity: 'SSL',
    outgoingHost: '',
    outgoingPort: '',
    outgoingUsername: '',
    outgoingPassword: '',
    outgoingSecurity: 'SSL',
  });

  // Load email accounts from localStorage on component mount
  useEffect(() => {
    loadEmailAccountsFromStorage();
  }, []);

  const loadEmailAccountsFromStorage = () => {
    try {
      const storedAccounts = localStorage.getItem('emailAccounts');
      const storedSmtp = localStorage.getItem('smtpAccounts');
      if (storedAccounts) setEmailAccounts(JSON.parse(storedAccounts));
      if (storedSmtp) setSmtpAccounts(JSON.parse(storedSmtp));
    } catch (error) {
      console.error('Error loading email accounts from localStorage:', error);
    }
  };

  const saveEmailAccountsToStorage = (accounts: EmailAccount[]) => {
    try {
      localStorage.setItem('emailAccounts', JSON.stringify(accounts));
    } catch (error) {
      console.error('Error saving email accounts to localStorage:', error);
    }
  };

  const saveSmtpAccountsToStorage = (accounts: any[]) => {
    try {
      localStorage.setItem('smtpAccounts', JSON.stringify(accounts));
    } catch (error) {
      console.error('Error saving smtp accounts to localStorage:', error);
    }
  };

  const fetchEmailAccounts = async () => {
    setIsRefreshing(true);
    setFormErrors({});
    
    try {
      console.log('🔄 Fetching email accounts from API...');
      const response = await apiFetch('/api/email-accounts', {
        method: 'GET',
      });
      console.log('✅ Accounts fetched successfully:', response);
      const emails = Array.isArray(response) ? response : (response.emailAccounts || []);
      const smtp = Array.isArray(response) ? [] : (response.smtpAccounts || []);
      setEmailAccounts(emails);
      setSmtpAccounts(smtp);
      saveEmailAccountsToStorage(emails);
      saveSmtpAccountsToStorage(smtp);
      
    } catch (error: any) {
      console.error('❌ Failed to fetch email accounts:', error);
      toast.error('Failed to fetch! Try again!');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Session storage helpers for last failed tests
  const failKeyFor = (account: Pick<EmailAccount, 'id' | 'accountCode' | 'email'>) =>
    `emailTest:last:${account.accountCode || account.id}`;

  const saveLastFailure = (
    account: Pick<EmailAccount, 'id' | 'accountCode' | 'email'>,
    payload: { status: 'error' | 'timeout'; message: string; details?: any }
  ) => {
    try {
      const entry = {
        email: account.email,
        at: new Date().toISOString(),
        ...payload,
      };
      sessionStorage.setItem(failKeyFor(account), JSON.stringify(entry));
    } catch (e) {
      console.error('Failed to persist last failure', e);
    }
  };

  const clearLastFailure = (account: Pick<EmailAccount, 'id' | 'accountCode' | 'email'>) => {
    try {
      sessionStorage.removeItem(failKeyFor(account));
    } catch (e) {
      // noop
    }
  };

  const readLastFailure = (account: Pick<EmailAccount, 'id' | 'accountCode' | 'email'>): string => {
    try {
      const raw = sessionStorage.getItem(failKeyFor(account));
      if (!raw) return '';
      const data = JSON.parse(raw) as { email: string; at: string; status: string; message: string };
      const when = new Date(data.at);
      const whenStr = `${when.toLocaleDateString()} ${when.toLocaleTimeString()}`;
      return `Email: ${data.email}\nWhen: ${whenStr}\nStatus: ${data.status}\nMessage: ${data.message}`;
    } catch (e) {
      return '';
    }
  };

  const readAllFailuresSummary = (accounts: EmailAccount[]): string => {
    const lines: string[] = [];
    for (const acc of accounts) {
      const msg = readLastFailure(acc);
      if (msg) {
        lines.push(`• ${acc.email}\n${msg.split('\n').slice(1).join('\n')}`);
      }
    }
    return lines.join('\n\n');
  };

  const resetAddForm = () => {
    setAddForm({
      email: '',
      password: '',
      showPassword: false,
      showManualSetup: false,
      incomingType: 'IMAP',
      incomingHost: '',
      incomingPort: '',
      incomingUsername: '',
      incomingSecurity: 'SSL',
      outgoingHost: '',
      outgoingPort: '',
      outgoingUsername: '',
      outgoingPassword: '',
      outgoingSecurity: 'SSL',
    });
    setFormErrors({});
  };

  const handleAddAccount = async () => {
    setIsSubmitting(true);
    setFormErrors({});
    
    try {
      const requestData: any = {
        email: addForm.email,
        password: addForm.password,
        autoconfig: !addForm.showManualSetup,
      };

      if (addForm.showManualSetup) {
        requestData.incomingType = addForm.incomingType;
        requestData.incomingHost = addForm.incomingHost;
        requestData.incomingPort = parseInt(addForm.incomingPort);
        requestData.incomingUsername = addForm.incomingUsername || addForm.email;
        requestData.incomingSecurity = addForm.incomingSecurity;
        requestData.outgoingHost = addForm.outgoingHost;
        requestData.outgoingPort = parseInt(addForm.outgoingPort);
        requestData.outgoingUsername = addForm.outgoingUsername || addForm.email;
        requestData.outgoingPassword = addForm.outgoingPassword || addForm.password;
        requestData.outgoingSecurity = addForm.outgoingSecurity;
      }

      console.log('📤 Adding email account:', requestData);
      const response = await apiFetch('/api/email-accounts', {
        method: 'POST',
        body: JSON.stringify(requestData),
      });

      console.log('✅ Email account added successfully:', response);
      toast.success('Email address is added');
      setShowAddModal(false);
      resetAddForm();
      await fetchEmailAccounts(); // Refresh the list
      
    } catch (error: any) {
      console.error('❌ Failed to add email account:', error);
      
      if (error.errors) {
        setFormErrors(error.errors);
      } else {
        setFormErrors({ general: error.message || 'Failed to add email account' });
      }
      
      // Show manual setup suggestion if autoconfig failed
      if (!addForm.showManualSetup && error.message) {
        setFormErrors(prev => ({ ...prev, note: 'Try Manual setup' }));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditAccount = async () => {
    setIsSubmitting(true);
    setFormErrors({});
    
    try {
      const requestData: any = {
        email: editForm.email,
        edit: true,
        incomingType: editForm.incomingType,
        incomingHost: editForm.incomingHost,
        incomingPort: parseInt(editForm.incomingPort),
        incomingUsername: editForm.incomingUsername || editForm.email,
        incomingSecurity: editForm.incomingSecurity,
        outgoingHost: editForm.outgoingHost,
        outgoingPort: parseInt(editForm.outgoingPort),
        outgoingUsername: editForm.outgoingUsername || editForm.email,
        outgoingSecurity: editForm.outgoingSecurity,
      };

      // Only include password fields if user provided them
      if (editForm.password && editForm.password.trim() !== '') {
        requestData.password = editForm.password.trim();
      }
      if (editForm.outgoingPassword && editForm.outgoingPassword.trim() !== '') {
        requestData.outgoingPassword = editForm.outgoingPassword.trim();
      }

      console.log('📤 Updating email account:', requestData);
      const response = await apiFetch(`/api/email-accounts/${editForm.id}`, {
        method: 'PUT',
        body: JSON.stringify(requestData),
      });

      console.log('✅ Email account updated successfully:', response);
      toast.success('Email account updated successfully');
      setShowEditModal(false);
      await fetchEmailAccounts(); // Refresh the list
      
    } catch (error: any) {
      console.error('❌ Failed to update email account:', error);
      
      if (error.errors) {
        setFormErrors(error.errors);
      } else {
        setFormErrors({ general: error.message || 'Failed to update email account' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!selectedAccount) return;
    
    setIsSubmitting(true);
    
    try {
      console.log('🗑️ Deleting email account:', selectedAccount.id);
      await apiFetch(`/api/email-accounts/${selectedAccount.id}`, {
        method: 'DELETE',
      });

      console.log('✅ Email account deleted successfully');
      toast.success('Email account deleted successfully');
      setShowDeleteDialog(false);
      setSelectedAccount(null);
      await fetchEmailAccounts(); // Refresh the list
      
    } catch (error: any) {
      console.error('❌ Failed to delete email account:', error);
      toast.error(error.message || 'Failed to delete email account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = async (account: EmailAccount) => {
    // Populate form from local state; avoid API fetch
    setSelectedAccount(account);
    setIsLoading(false);
    setShowEditModal(true);

    setEditForm({
      id: account.id,
      accountCode: account.accountCode,
      email: account.email,
      password: '', // leave blank; user can enter to update
      showPassword: false,
      showManualSetup: true,
      incomingType: account.incomingType || 'IMAP',
      incomingHost: account.incomingHost || '',
      incomingPort: account.incomingPort?.toString() || '',
      incomingUsername: account.incomingUsername || account.email,
      incomingSecurity: account.incomingSecurity || 'SSL',
      outgoingHost: account.outgoingHost || '',
      outgoingPort: account.outgoingPort?.toString() || '',
      outgoingUsername: account.outgoingUsername || account.email,
      outgoingPassword: '', // leave blank to keep current
      outgoingSecurity: account.outgoingSecurity || 'SSL',
    });
  };

  const openDeleteDialog = (account: EmailAccount) => {
    setSelectedAccount(account);
    setShowDeleteDialog(true);
  };

  // Load test status from localStorage
  const loadTestStatus = () => {
    try {
      const stored = localStorage.getItem('emailTestStatus');
      if (stored) {
        setTestStatus(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading test status:', error);
    }
  };

  // Save test status to localStorage
  const saveTestStatus = (status: TestStatus) => {
    try {
      localStorage.setItem('emailTestStatus', JSON.stringify(status));
      setTestStatus(status);
    } catch (error) {
      console.error('Error saving test status:', error);
    }
  };

  // Handle single account test
  const handleTestAccount = async () => {
    if (!testingAccount) return;

    setIsTesting(true);
    setTestMessage(`Testing connection for ${testingAccount.email}...`);

    const newStatus = { ...testStatus, [testingAccount.id]: 'testing' as const };
    saveTestStatus(newStatus);

    try {
      console.log('🧪 Testing email account:', testingAccount.accountCode);
      const response = await apiFetch(`/api/email-accounts/${testingAccount.id}/test`, {
        method: 'POST',
      });

      console.log('✅ Test result:', response);

      const resultStatus: 'success' | 'error' = response.success ? 'success' : 'error';
      const updatedStatus = { ...testStatus, [testingAccount.id]: resultStatus };
      saveTestStatus(updatedStatus);

      setTestMessage(response.success
        ? `✅ Test successful for ${testingAccount.email}`
        : `❌ Test failed for ${testingAccount.email}: ${response.message}`
      );

      // Persist previous failure or clear on success
      if (response.success) {
        clearLastFailure(testingAccount);
        setPreviousTestContent('');
      } else {
        saveLastFailure(testingAccount, {
          status: 'error',
          message: response.message || 'Unknown error',
          details: response.details,
        });
        setPreviousTestContent(readLastFailure(testingAccount));
      }

    } catch (error: any) {
      console.error('❌ Test failed:', error);
      const updatedStatus = { ...testStatus, [testingAccount.id]: 'error' as const };
      saveTestStatus(updatedStatus);
      setTestMessage(`❌ Test failed for ${testingAccount.email}: ${error.message || 'Unknown error'}`);
      saveLastFailure(testingAccount, {
        status: 'error',
        message: error.message || 'Unknown error',
      });
      setPreviousTestContent(readLastFailure(testingAccount));
    } finally {
      setTimeout(() => {
        setIsTesting(false);
        setShowTestDialog(false);
        setTestingAccount(null);
        setTestMessage('');
      }, 2000);
    }
  };

  // Handle test all accounts
  const handleTestAllAccounts = async () => {
    setIsTestingAll(true);
    setTestMessage('Initializing test for all accounts...');

    const accountCodes = emailAccounts.map(account => account.accountCode);
    console.log('🧪 Testing all email accounts:', accountCodes);

    try {
      const response = await apiFetch('/api/email-accounts/test-all', {
        method: 'POST',
        body: JSON.stringify({ accountCodes }),
      });

      console.log('✅ Test all result:', response);

      // Update status for each account
      const updatedStatus: TestStatus = { ...testStatus };
      response.results.forEach((result: TestResult) => {
        const status: 'untested' | 'testing' | 'success' | 'error' | 'timeout' = 
          result.status === 'success' ? 'success' : 
          result.status === 'error' ? 'error' : 
          result.status === 'timeout' ? 'timeout' : 'error';
        updatedStatus[result.accountId] = status;
        // Persist last failure or clear on success
        const acc = emailAccounts.find(a => a.id === result.accountId || a.accountCode === result.accountCode);
        if (acc) {
          if (status === 'success') {
            clearLastFailure(acc);
          } else {
            saveLastFailure(acc, {
              status: status === 'timeout' ? 'timeout' : 'error',
              message: result.message || (status === 'timeout' ? 'Timed out' : 'Unknown error'),
              details: result.details,
            });
          }
        }
      });
      saveTestStatus(updatedStatus);

      setTestResults(response.results);
      setTestMessage('All tests completed!');

      // Store test results in localStorage for debugging
      try {
        localStorage.setItem('lastTestResults', JSON.stringify(response.results));
      } catch (error) {
        console.error('Failed to store test results:', error);
      }

      // Log test results for debugging
      console.log('🧪 Test results:', response.results);
  console.log('📊 Total accounts tested:', testResults.length);
  // Refresh summary for next open
  setPreviousAllTestContent(readAllFailuresSummary(emailAccounts));

    } catch (error: any) {
      console.error('❌ Test all failed:', error);
      setTestMessage(`❌ Test failed: ${error.message || 'Unknown error'}`);
    } finally {
      setTimeout(() => {
        setIsTestingAll(false);
        setShowTestAllDialog(false);
        setTestMessage('');
      }, 3000);
    }
  };

  // Handle setting primary email
  const handleSetPrimary = async (account: EmailAccount) => {
    if (account.isPrimary) return; // Already primary

    try {
      console.log('👑 Setting primary email:', account.email);
      const response = await apiFetch(`/api/email-accounts/${account.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isPrimary: true }),
      });

      console.log('✅ Primary email updated:', response);
      toast.success(`${account.email} is now your primary email`);
      await fetchEmailAccounts(); // Refresh the list

    } catch (error: any) {
      console.error('❌ Failed to set primary email:', error);
      toast.error(error.message || 'Failed to set primary email');
    }
  };

  // Get test status display
  const getTestStatusDisplay = (accountId: string) => {
    const status = testStatus[accountId] || 'untested';

    switch (status) {
      case 'success':
        return { text: 'Tested', color: 'bg-green-100 text-green-800 border-green-300' };
      case 'error':
        return { text: 'Error', color: 'bg-red-100 text-red-800 border-red-300' };
      case 'testing':
        return { text: 'Testing...', color: 'bg-blue-100 text-blue-800 border-blue-300' };
      default:
        return { text: 'Test', color: 'bg-gray-100 text-gray-800 border-gray-300' };
    }
  };

  // Load test status on component mount
  useEffect(() => {
    loadTestStatus();
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: easeOut }}
      className="space-y-6"
    >
      {/* Header */}
      <div className={`flex ${isMobile ? 'flex-col space-y-3' : 'items-center justify-between'}`}>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Email Settings</h2>
        
        <div className={`flex items-center space-x-3 ${isMobile ? '' : ''}`}>
          <Button
            onClick={() => {
              setPreviousAllTestContent(readAllFailuresSummary(emailAccounts));
              setShowTestAllDialog(true);
            }}
            variant="outline"
            className="flex items-center space-x-2"
            disabled={emailAccounts.length === 0}
          >
            <Play className="w-4 h-4" />
            <span>Test All</span>
          </Button>
          
          <Button
            onClick={() => setShowAddModal(true)}
            className="flex items-center space-x-2"
            variant="primary"
          >
            <Plus className="w-4 h-4" />
            <span>Add Account</span>
          </Button>
          <Button
            onClick={() => setShowAddSmtpModal(true)}
            className="flex items-center space-x-2"
            variant="outline"
          >
            <Server className="w-4 h-4" />
            <span>Add SMTP Only</span>
          </Button>
          
          <Button
            onClick={fetchEmailAccounts}
            variant="outline"
            disabled={isRefreshing}
            className="flex items-center space-x-2"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Email Accounts Table */}
      <div className="space-y-3">
        {emailAccounts.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No email accounts added yet. Click "Add Account" to get started.
          </div>
        ) : (
          emailAccounts.map((account) => {
            const testStatus = getTestStatusDisplay(account.id);
            return (
              <div 
                key={account.id}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {account.email}
                    </div>
                    {account.isPrimary && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        <Star className="w-3 h-3 mr-1" />
                        Primary
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Account ID: {account.accountCode || account.id.substring(0, 6)}
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  {/* Test Status */}
                  <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${testStatus.color}`}>
                    {testStatus.text}
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex items-center space-x-1">
                    <Button
                      onClick={() => {
                        setTestingAccount(account);
                        // Load any previous failure text for this account
                        setPreviousTestContent(readLastFailure(account));
                        setShowTestDialog(true);
                      }}
                      variant="ghost"
                      className="p-2"
                      title="Test Connection"
                    >
                      <Play className="w-4 h-4 text-green-600 dark:text-green-400" />
                    </Button>
                    
                    {!account.isPrimary && (
                      <Button
                        onClick={() => handleSetPrimary(account)}
                        variant="ghost"
                        className="p-2"
                        title="Set as Primary"
                      >
                        <Star className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                      </Button>
                    )}
                    
                    <Button
                      onClick={() => openEditModal(account)}
                      variant="ghost"
                      className="p-2"
                      title="Edit Account"
                    >
                      <Edit className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </Button>
                    
                    <Button
                      onClick={() => openDeleteDialog(account)}
                      variant="ghost"
                      className="p-2"
                      title="Delete Account"
                    >
                      <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* SMTP Only Accounts */}
      <div className="space-y-3">
        {smtpAccounts.length > 0 && (
          <>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">SMTP Only</h3>
            {smtpAccounts.map((acc: any) => (
              <div key={acc.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <div className="font-medium text-gray-900 dark:text-white">{acc.email}</div>
                    {acc.accountCode && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-mono bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-300">
                        {acc.accountCode}
                      </span>
                    )}
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                      SMTP Only
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">{acc.host}:{acc.port} • {acc.security}</div>
                </div>
                <div className="flex items-center space-x-1">
                  <Button
                    onClick={async () => {
                      try {
                        const r = await apiFetch(`/api/smtp-accounts/${acc.id}/test`, { method: 'POST' });
                        if (r.success) toast.success('SMTP connection OK'); else toast.error(r.message || 'SMTP test failed');
                      } catch (e: any) {
                        toast.error(e.message || 'SMTP test failed');
                      }
                    }}
                    variant="ghost"
                    className="p-2"
                    title="Test SMTP"
                  >
                    <Play className="w-4 h-4 text-green-600 dark:text-green-400" />
                  </Button>
                  <Button
                    onClick={() => {
                      setEditingSmtp(acc);
                      setSmtpEditForm({
                        email: acc.email || '',
                        host: acc.host || '',
                        port: String(acc.port || ''),
                        security: acc.security || 'SSL',
                        username: acc.username || acc.email || '',
                        password: '',
                      });
                      setShowEditSmtpModal(true);
                    }}
                    variant="ghost"
                    className="p-2"
                    title="Edit"
                  >
                    <Edit className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </Button>
                  <Button
                    onClick={async () => {
                      // Simple delete for now
                      try {
                        await apiFetch(`/api/smtp-accounts/${acc.id}`, { method: 'DELETE' });
                        toast.success('SMTP account deleted');
                        await fetchEmailAccounts();
                      } catch (e: any) {
                        toast.error(e.message || 'Delete failed');
                      }
                    }}
                    variant="ghost"
                    className="p-2"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                  </Button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Add SMTP Only Modal (minimal) */}
      {/* You can enhance this later with full edit support */}

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Add Email Account</h3>
                <Button
                  onClick={() => {
                    setShowAddModal(false);
                    resetAddForm();
                  }}
                  variant="ghost"
                  className="p-2"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-4">
                {/* Email Address */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={addForm.email}
                    onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    placeholder="your.email@example.com"
                  />
                  {formErrors.email && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{formErrors.email}</p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={addForm.showPassword ? "text" : "password"}
                      value={addForm.password}
                      onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setAddForm({ ...addForm, showPassword: !addForm.showPassword })}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      {addForm.showPassword ? (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      ) : (
                        <Eye className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                  {formErrors.password && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{formErrors.password}</p>
                  )}
                </div>

                {/* General Errors */}
                {formErrors.general && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-600 dark:text-red-400">{formErrors.general}</p>
                  </div>
                )}

                {/* Manual Setup Note */}
                {formErrors.note && (
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <p className="text-sm text-yellow-600 dark:text-yellow-400">Note: {formErrors.note}</p>
                  </div>
                )}

                {/* Manual Setup Toggle */}
                {!addForm.showManualSetup && (
                  <Button
                    onClick={() => setAddForm({ ...addForm, showManualSetup: true })}
                    variant="outline"
                    className="w-full"
                  >
                    Manual Setup
                  </Button>
                )}

                {/* Manual Setup Fields */}
                {addForm.showManualSetup && (
                  <>
                    <hr className="border-gray-200 dark:border-gray-600" />
                    
                    {/* Incoming Server */}
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-white mb-3">Incoming Server</h4>
                      
                      <div className="space-y-3">
                        {/* Server Type Radio */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Server Type
                          </label>
                          <div className="flex space-x-4">
                            <label className="flex items-center">
                              <input
                                type="radio"
                                value="POP3"
                                checked={addForm.incomingType === 'POP3'}
                                onChange={(e) => setAddForm({ ...addForm, incomingType: e.target.value as 'POP3' })}
                                className="mr-2"
                              />
                              POP3
                            </label>
                            <label className="flex items-center">
                              <input
                                type="radio"
                                value="IMAP"
                                checked={addForm.incomingType === 'IMAP'}
                                onChange={(e) => setAddForm({ ...addForm, incomingType: e.target.value as 'IMAP' })}
                                className="mr-2"
                              />
                              IMAP
                            </label>
                          </div>
                        </div>

                        {/* Host Name */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Host Name
                          </label>
                          <input
                            type="text"
                            value={addForm.incomingHost}
                            onChange={(e) => setAddForm({ ...addForm, incomingHost: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                            placeholder={addForm.incomingType === 'POP3' ? 'pop.example.com' : 'imap.example.com'}
                          />
                        </div>

                        {/* Port */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Port
                          </label>
                          <input
                            type="number"
                            value={addForm.incomingPort}
                            onChange={(e) => setAddForm({ ...addForm, incomingPort: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                            placeholder={
                              addForm.incomingType === 'POP3'
                                ? (addForm.incomingSecurity === 'SSL' ? '995' : '110')
                                : (addForm.incomingSecurity === 'NONE' ? '143' : addForm.incomingSecurity === 'STARTTLS' ? '143' : '993')
                            }
                          />
                        </div>

                        {/* Username */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Username
                            <span title="Mostly Your Email Address" className="inline-block ml-1">
                              <Info className="w-4 h-4 text-gray-400" />
                            </span>
                          </label>
                          <input
                            type="text"
                            value={addForm.incomingUsername}
                            onChange={(e) => setAddForm({ ...addForm, incomingUsername: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                            placeholder={addForm.email || "your.email@example.com"}
                          />
                        </div>

                        {/* Security Type */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Security Type
                          </label>
                          <select
                            value={addForm.incomingSecurity}
                            onChange={(e) => setAddForm({ ...addForm, incomingSecurity: e.target.value as any })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                          >
                            <option value="NONE">None</option>
                            <option value="SSL">SSL / TLS</option>
                            <option value="STARTTLS">STARTTLS</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <hr className="border-gray-200 dark:border-gray-600" />

                    {/* Outgoing Server */}
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-white mb-3">Outgoing Server</h4>
                      
                      <div className="space-y-3">
                        {/* SMTP Server */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            SMTP Server
                          </label>
                          <input
                            type="text"
                            value={addForm.outgoingHost}
                            onChange={(e) => setAddForm({ ...addForm, outgoingHost: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                            placeholder="smtp.gmail.com"
                          />
                        </div>

                        {/* Security Type */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Security Type
                          </label>
                          <select
                            value={addForm.outgoingSecurity}
                            onChange={(e) => setAddForm({ ...addForm, outgoingSecurity: e.target.value as any })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                          >
                            <option value="SSL">SSL / TLS</option>
                            <option value="STARTTLS">STARTTLS</option>
                            <option value="NONE">None</option>
                          </select>
                        </div>

                        {/* Port */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Port
                          </label>
                          <input
                            type="number"
                            value={addForm.outgoingPort}
                            onChange={(e) => setAddForm({ ...addForm, outgoingPort: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                            placeholder="587"
                          />
                        </div>

                        {/* Username */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Username
                          </label>
                          <input
                            type="text"
                            value={addForm.outgoingUsername}
                            onChange={(e) => setAddForm({ ...addForm, outgoingUsername: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                            placeholder={addForm.email || "your.email@example.com"}
                          />
                        </div>

                        {/* Password */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Password
                          </label>
                          <input
                            type="password"
                            value={addForm.outgoingPassword}
                            onChange={(e) => setAddForm({ ...addForm, outgoingPassword: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                            placeholder="Leave empty to use account password"
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Action Buttons */}
                <div className="flex space-x-3 pt-4">
                  <Button
                    onClick={() => {
                      setShowAddModal(false);
                      resetAddForm();
                    }}
                    variant="outline"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  
                  <Button
                    onClick={handleAddAccount}
                    disabled={isSubmitting || !addForm.email || !addForm.password}
                    className="flex-1"
                  >
                    {isSubmitting ? <LoadingSpinner message="" /> : 'Sign In'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add SMTP Only Modal */}
      {showAddSmtpModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Add SMTP Only</h3>
                <Button onClick={() => setShowAddSmtpModal(false)} variant="ghost" className="p-2">
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input type="email" value={smtpForm.email} onChange={(e)=>setSmtpForm({...smtpForm,email:e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SMTP Server</label>
                  <input type="text" value={smtpForm.host} onChange={(e)=>setSmtpForm({...smtpForm,host:e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Port</label>
                    <input type="number" value={smtpForm.port} onChange={(e)=>setSmtpForm({...smtpForm,port:e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Security</label>
                    <select value={smtpForm.security} onChange={(e)=>setSmtpForm({...smtpForm,security:e.target.value as any})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white">
                      <option value="SSL">SSL</option>
                      <option value="TLS">TLS</option>
                      <option value="STARTTLS">STARTTLS</option>
                      <option value="PLAIN">PLAIN</option>
                      <option value="NONE">NONE</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
                  <input type="text" value={smtpForm.username} onChange={(e)=>setSmtpForm({...smtpForm,username:e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white" placeholder={smtpForm.email || 'your.email@example.com'} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                  <div className="relative">
                    <input
                      type={smtpForm.showPassword ? 'text' : 'password'}
                      value={smtpForm.password}
                      onChange={(e)=>setSmtpForm({...smtpForm,password:e.target.value})}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setSmtpForm({ ...smtpForm, showPassword: !smtpForm.showPassword })}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      {smtpForm.showPassword ? (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      ) : (
                        <Eye className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex space-x-3 pt-2">
                  <Button variant="outline" className="flex-1" onClick={()=>setShowAddSmtpModal(false)}>Cancel</Button>
                  <Button
                    className="flex-1"
                    disabled={isSubmitting || !smtpForm.email || !smtpForm.host || !smtpForm.port || !smtpForm.password}
                    onClick={async ()=>{
                      setIsSubmitting(true);
                      try {
                        const payload = {
                          email: smtpForm.email,
                          host: smtpForm.host,
                          port: parseInt(smtpForm.port, 10),
                          username: smtpForm.username || smtpForm.email,
                          password: smtpForm.password,
                          security: smtpForm.security,
                        };
                        await apiFetch('/api/smtp-accounts', { method: 'POST', body: JSON.stringify(payload) });
                        toast.success('SMTP account added');
                        setShowAddSmtpModal(false);
                        setSmtpForm({ email: '', host: '', port: '', security: 'SSL', username: '', password: '', showPassword: false });
                        await fetchEmailAccounts();
                      } catch (e: any) {
                        toast.error(e.message || 'Failed to add SMTP');
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}
                  >
                    {isSubmitting ? <LoadingSpinner message="" /> : 'Add SMTP'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit SMTP Only Modal */}
      {showEditSmtpModal && editingSmtp && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Edit SMTP Account</h3>
                <Button onClick={() => setShowEditSmtpModal(false)} variant="ghost" className="p-2">
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="space-y-4">
                {editingSmtp.accountCode && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Account Code</label>
                    <input 
                      type="text" 
                      value={editingSmtp.accountCode} 
                      readOnly 
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 font-mono cursor-not-allowed" 
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input type="email" value={smtpEditForm.email} onChange={(e)=>setSmtpEditForm({...smtpEditForm,email:e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SMTP Server</label>
                  <input type="text" value={smtpEditForm.host} onChange={(e)=>setSmtpEditForm({...smtpEditForm,host:e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Port</label>
                    <input type="number" value={smtpEditForm.port} onChange={(e)=>setSmtpEditForm({...smtpEditForm,port:e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Security</label>
                    <select value={smtpEditForm.security} onChange={(e)=>setSmtpEditForm({...smtpEditForm,security:e.target.value as any})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white">
                      <option value="SSL">SSL</option>
                      <option value="TLS">TLS</option>
                      <option value="STARTTLS">STARTTLS</option>
                      <option value="PLAIN">PLAIN</option>
                      <option value="NONE">NONE</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
                  <input type="text" value={smtpEditForm.username} onChange={(e)=>setSmtpEditForm({...smtpEditForm,username:e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password</label>
                  <input type="password" value={smtpEditForm.password} onChange={(e)=>setSmtpEditForm({...smtpEditForm,password:e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white" placeholder="Leave blank to keep current" />
                </div>
                <div className="flex space-x-3 pt-2">
                  <Button variant="outline" className="flex-1" onClick={()=>setShowEditSmtpModal(false)}>Cancel</Button>
                  <Button
                    className="flex-1"
                    disabled={isSubmitting || !smtpEditForm.email || !smtpEditForm.host || !smtpEditForm.port}
                    onClick={async ()=>{
                      setIsSubmitting(true);
                      try {
                        const payload: any = {
                          email: smtpEditForm.email,
                          host: smtpEditForm.host,
                          port: parseInt(smtpEditForm.port, 10),
                          username: smtpEditForm.username,
                          security: smtpEditForm.security,
                        };
                        if (smtpEditForm.password && smtpEditForm.password.trim() !== '') {
                          payload.password = smtpEditForm.password.trim();
                        }
                        await apiFetch(`/api/smtp-accounts/${editingSmtp.id}`, { method: 'PUT', body: JSON.stringify(payload) });
                        toast.success('SMTP account updated');
                        setShowEditSmtpModal(false);
                        setEditingSmtp(null);
                        await fetchEmailAccounts();
                      } catch (e: any) {
                        toast.error(e.message || 'Failed to update SMTP');
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}
                  >
                    {isSubmitting ? <LoadingSpinner message="" /> : 'Save'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Account Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Edit Email Account</h3>
                <Button
                  onClick={() => setShowEditModal(false)}
                  variant="ghost"
                  className="p-2"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {isLoading ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner message="Loading account details..." />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Email Address */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    />
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        type={editForm.showPassword ? "text" : "password"}
                        value={editForm.password}
                        onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                        className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                        placeholder="Enter new password to update (leave blank to keep current)"
                      />
                      <button
                        type="button"
                        onClick={() => setEditForm({ ...editForm, showPassword: !editForm.showPassword })}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      >
                        {editForm.showPassword ? (
                          <EyeOff className="h-4 w-4 text-gray-400" />
                        ) : (
                          <Eye className="h-4 w-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                  </div>

                  <hr className="border-gray-200 dark:border-gray-600" />
                  
                  {/* Incoming Server */}
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white mb-3">Incoming Server</h4>
                    
                    <div className="space-y-3">
                      {/* Server Type Radio */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Server Type
                        </label>
                        <div className="flex space-x-4">
                          <label className="flex items-center">
                            <input
                              type="radio"
                              value="POP3"
                              checked={editForm.incomingType === 'POP3'}
                              onChange={(e) => setEditForm({ ...editForm, incomingType: e.target.value as 'POP3' })}
                              className="mr-2"
                            />
                            POP3
                          </label>
                          <label className="flex items-center">
                            <input
                              type="radio"
                              value="IMAP"
                              checked={editForm.incomingType === 'IMAP'}
                              onChange={(e) => setEditForm({ ...editForm, incomingType: e.target.value as 'IMAP' })}
                              className="mr-2"
                            />
                            IMAP
                          </label>
                        </div>
                      </div>

                      {/* Host Name */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Host Name
                        </label>
                        <input
                          type="text"
                          value={editForm.incomingHost}
                          onChange={(e) => setEditForm({ ...editForm, incomingHost: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                        />
                      </div>

                      {/* Port */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Port
                        </label>
                        <input
                          type="text"
                          value={editForm.incomingPort}
                          onChange={(e) => setEditForm({ ...editForm, incomingPort: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                        />
                      </div>

                      {/* Username */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Username
                        </label>
                        <input
                          type="text"
                          value={editForm.incomingUsername}
                          onChange={(e) => setEditForm({ ...editForm, incomingUsername: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                        />
                      </div>

                      {/* Security Type */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Security Type
                        </label>
                        <select
                          value={editForm.incomingSecurity}
                          onChange={(e) => setEditForm({ ...editForm, incomingSecurity: e.target.value as any })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                        >
                          <option value="NONE">None</option>
                          <option value="SSL">SSL / TLS</option>
                          <option value="STARTTLS">STARTTLS</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <hr className="border-gray-200 dark:border-gray-600" />

                  {/* Outgoing Server */}
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white mb-3">Outgoing Server</h4>
                    
                    <div className="space-y-3">
                      {/* SMTP Server */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          SMTP Server
                        </label>
                        <input
                          type="text"
                          value={editForm.outgoingHost}
                          onChange={(e) => setEditForm({ ...editForm, outgoingHost: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                        />
                      </div>

                      {/* Security Type */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Security Type
                        </label>
                        <select
                          value={editForm.outgoingSecurity}
                          onChange={(e) => setEditForm({ ...editForm, outgoingSecurity: e.target.value as any })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                        >
                          <option value="SSL">SSL / TLS</option>
                          <option value="STARTTLS">STARTTLS</option>
                          <option value="NONE">None</option>
                        </select>
                      </div>

                      {/* Port */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Port
                        </label>
                        <input
                          type="text"
                          value={editForm.outgoingPort}
                          onChange={(e) => setEditForm({ ...editForm, outgoingPort: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                        />
                      </div>

                      {/* Username */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Username
                        </label>
                        <input
                          type="text"
                          value={editForm.outgoingUsername}
                          onChange={(e) => setEditForm({ ...editForm, outgoingUsername: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                        />
                      </div>

                      {/* Password */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Password
                        </label>
                        <input
                          type="password"
                          value={editForm.outgoingPassword}
                          onChange={(e) => setEditForm({ ...editForm, outgoingPassword: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                          placeholder="Leave blank to keep current"
                        />
                      </div>
                    </div>
                  </div>

                  {/* General Errors */}
                  {formErrors.general && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                      <p className="text-sm text-red-600 dark:text-red-400">{formErrors.general}</p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex space-x-3 pt-4">
                    <Button
                      onClick={() => setShowEditModal(false)}
                      variant="outline"
                      className="flex-1"
                    >
                      Close
                    </Button>
                    
                    <Button
                      onClick={handleEditAccount}
                      disabled={isSubmitting}
                      className="flex-1"
                    >
                      {isSubmitting ? <LoadingSpinner message="" /> : 'Save'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Email Account"
        message={`Are you sure you want to delete the email account "${selectedAccount?.email}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDeleteAccount}
        onCancel={() => {
          setShowDeleteDialog(false);
          setSelectedAccount(null);
        }}
        variant="danger"
      />

      {/* Test Single Account Dialog */}
      <ConfirmDialog
        isOpen={showTestDialog}
        title="Test Email Connection"
        message={`Test the connection for ${testingAccount?.email}? This will verify IMAP/POP3 and SMTP settings.`}
        previousTitle="Previous Test"
        previousContent={previousTestContent}
        confirmLabel="Test Connection"
        cancelLabel="Cancel"
        onConfirm={handleTestAccount}
        onCancel={() => {
          setShowTestDialog(false);
          setTestingAccount(null);
          setPreviousTestContent('');
        }}
        variant="info"
      />

      {/* Test All Accounts Dialog */}
      <ConfirmDialog
        isOpen={showTestAllDialog}
        title="Test All Email Connections"
        message={`Test connections for all ${emailAccounts.length} email accounts? This may take a few moments.`}
        previousTitle="Previous Failed Tests"
        previousContent={previousAllTestContent}
        confirmLabel="Test All"
        cancelLabel="Cancel"
        onConfirm={handleTestAllAccounts}
        onCancel={() => {
          setShowTestAllDialog(false);
          setPreviousAllTestContent('');
        }}
        variant="info"
      />

      {/* Test Progress Overlay */}
      {(isTesting || isTestingAll) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-sm w-full mx-4">
            <div className="flex items-center space-x-3">
              <LoadingSpinner message="" />
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">
                  {isTestingAll ? 'Testing All Accounts...' : 'Testing Connection...'}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {testMessage}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default EmailSettings;
