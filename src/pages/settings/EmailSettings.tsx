import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, RefreshCw, Eye, EyeOff, Edit, Trash2, Info, X } from 'lucide-react';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { apiFetch } from '../../lib/apiFetch';
import { toast } from '../../lib/toast';

interface EmailAccount {
  id: string;
  email: string;
  accountCode: string;
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

interface EditAccountForm extends AddAccountForm {
  id: string;
  accountCode: string;
}

interface EmailSettingsProps {
  isMobile: boolean;
}

const EmailSettings: React.FC<EmailSettingsProps> = ({ isMobile }) => {
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<EmailAccount | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<{[key: string]: string}>({});

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
      if (storedAccounts) {
        setEmailAccounts(JSON.parse(storedAccounts));
      }
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

  const fetchEmailAccounts = async () => {
    setIsRefreshing(true);
    setFormErrors({});
    
    try {
      console.log('🔄 Fetching email accounts from API...');
      const response = await apiFetch('/api/email-accounts', {
        method: 'GET',
      });
      
      console.log('✅ Email accounts fetched successfully:', response);
      setEmailAccounts(response);
      saveEmailAccountsToStorage(response);
      
    } catch (error: any) {
      console.error('❌ Failed to fetch email accounts:', error);
      toast.error('Failed to fetch! Try again!');
    } finally {
      setIsRefreshing(false);
    }
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
      const requestData = {
        email: editForm.email,
        password: editForm.password,
        edit: true,
        incomingType: editForm.incomingType,
        incomingHost: editForm.incomingHost,
        incomingPort: parseInt(editForm.incomingPort),
        incomingUsername: editForm.incomingUsername || editForm.email,
        incomingSecurity: editForm.incomingSecurity,
        outgoingHost: editForm.outgoingHost,
        outgoingPort: parseInt(editForm.outgoingPort),
        outgoingUsername: editForm.outgoingUsername || editForm.email,
        outgoingPassword: editForm.outgoingPassword || editForm.password,
        outgoingSecurity: editForm.outgoingSecurity,
      };

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
    setSelectedAccount(account);
    setIsLoading(true);
    setShowEditModal(true);
    
    try {
      // Fetch complete account details
      console.log('🔍 Fetching account details for editing:', account.id);
      const response = await apiFetch(`/api/email-accounts/${account.id}`, {
        method: 'GET',
      });
      
      setEditForm({
        id: account.id,
        accountCode: account.accountCode,
        email: response.email || 'Loading...',
        password: response.password || 'Loading...',
        showPassword: false,
        showManualSetup: true,
        incomingType: response.incomingType || 'IMAP',
        incomingHost: response.incomingHost || 'Loading...',
        incomingPort: response.incomingPort?.toString() || 'Loading...',
        incomingUsername: response.incomingUsername || 'Loading...',
        incomingSecurity: response.incomingSecurity || 'SSL',
        outgoingHost: response.outgoingHost || 'Loading...',
        outgoingPort: response.outgoingPort?.toString() || 'Loading...',
        outgoingUsername: response.outgoingUsername || 'Loading...',
        outgoingPassword: response.outgoingPassword || 'Loading...',
        outgoingSecurity: response.outgoingSecurity || 'SSL',
      });
      
    } catch (error: any) {
      console.error('❌ Failed to fetch account details:', error);
      toast.error('Failed to load account details');
    } finally {
      setIsLoading(false);
    }
  };

  const openDeleteDialog = (account: EmailAccount) => {
    setSelectedAccount(account);
    setShowDeleteDialog(true);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="space-y-6"
    >
      {/* Header */}
      <div className={`flex ${isMobile ? 'flex-col space-y-3' : 'items-center justify-between'}`}>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Email Settings</h2>
        
        <div className={`flex items-center space-x-3 ${isMobile ? '' : ''}`}>
          <Button
            onClick={() => setShowAddModal(true)}
            className="flex items-center space-x-2"
            variant="primary"
          >
            <Plus className="w-4 h-4" />
            <span>Add Account</span>
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
          emailAccounts.map((account) => (
            <div 
              key={account.id}
              className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
            >
              <div className="flex-1">
                <div className="font-medium text-gray-900 dark:text-white">
                  {account.email}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Account ID: {account.accountCode || account.id.substring(0, 6)}
                </div>
              </div>
              
              <div className="text-sm text-gray-600 dark:text-gray-300">
                Primary Email
              </div>
              
              <div className="flex items-center space-x-2 ml-4">
                <Button
                  onClick={() => openEditModal(account)}
                  variant="ghost"
                  className="p-2"
                >
                  <Edit className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </Button>
                
                <Button
                  onClick={() => openDeleteDialog(account)}
                  variant="ghost"
                  className="p-2"
                >
                  <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

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
                            placeholder="imap.gmail.com"
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
                            placeholder="993"
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
                            <option value="SSL">SSL</option>
                            <option value="STARTTLS">TLS</option>
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
                            <option value="SSL">SSL</option>
                            <option value="STARTTLS">TLS</option>
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
                          <option value="SSL">SSL</option>
                          <option value="STARTTLS">TLS</option>
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
                          <option value="SSL">SSL</option>
                          <option value="STARTTLS">TLS</option>
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
    </motion.div>
  );
};

export default EmailSettings;
