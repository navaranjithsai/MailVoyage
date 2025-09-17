import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, easeOut } from 'framer-motion';
import { 
  ChevronDown,
  User, 
  Bell, 
  Shield, 
  Mail, 
  Palette, 
  Globe, 
  Database, 
  Download,
  Upload,
  Trash2,
  Save,
  Eye,
  EyeOff,
  CheckCircle
} from 'lucide-react';
import Button from '@/components/ui/Button';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { useTheme } from '@/contexts/ThemeContext';
import { useEmail } from '@/contexts/EmailContext';
import { toast } from '@/lib/toast';
import { isMobileTabletWidth } from '@/lib/navigation';
import { apiFetch } from '@/lib/apiFetch';
import * as validators from '@/lib/validators';
import EmailSettings from './settings/EmailSettings';

interface SettingsSection {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
}

const SettingsPage: React.FC = () => {
  const isMobile = isMobileTabletWidth();
  const [activeSection, setActiveSection] = useState('profile');
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingSection, setPendingSection] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [profileErrors, setProfileErrors] = useState<{username?: string; email?: string}>({});
  const { theme, setTheme } = useTheme();
  const { showUnreadBadge, setShowUnreadBadge } = useEmail();
  
  const handleSectionClick = (id: string) => {
    if (expandedSection === id) {
      setExpandedSection(null);
    } else if (hasUnsavedChanges) {
      setPendingSection(id);
      setConfirmDialogOpen(true);
    } else {
      setExpandedSection(id);
    }
  };

  const confirmDiscard = () => {
    setHasUnsavedChanges(false);
    setConfirmDialogOpen(false);
    if (pendingSection) setExpandedSection(pendingSection);
    setPendingSection(null);
  };

  const cancelDiscard = () => {
    setConfirmDialogOpen(false);
    setPendingSection(null);
  };

  // Form states
  const [profile, setProfile] = useState({
    id: '',
    username: '',
    email: '',
  });

  // Load user data from localStorage on component mount
  useEffect(() => {
    const loadUserData = () => {
      try {
        const authUser = localStorage.getItem('authUser');
        if (authUser) {
          const userData = JSON.parse(authUser);
          setProfile({
            id: userData.id || '',
            username: userData.username || '',
            email: userData.email || '',
          });
        }
      } catch (error) {
        console.error('Error loading user data from localStorage:', error);
        toast.error('Failed to load user data');
      }
    };

    loadUserData();
  }, []);

  const handleProfileUpdate = async () => {
    setProfileErrors({});
    
    // Validate username
    const usernameValidation = validators.usernameValidation.required;
    const minLength = validators.usernameValidation.minLength;
    if (!profile.username) {
      setProfileErrors(prev => ({ ...prev, username: usernameValidation }));
      return;
    }
    if (profile.username.length < minLength.value) {
      setProfileErrors(prev => ({ ...prev, username: minLength.message }));
      return;
    }

    // Validate email
    const emailValidation = validators.emailValidation.required;
    const emailPattern = validators.emailValidation.pattern;
    if (!profile.email) {
      setProfileErrors(prev => ({ ...prev, email: emailValidation }));
      return;
    }
    if (!emailPattern.value.test(profile.email)) {
      setProfileErrors(prev => ({ ...prev, email: emailPattern.message }));
      return;
    }

    setConfirmDialogOpen(true);
  };

  const confirmProfileUpdate = async () => {
    setIsUpdating(true);
    setUpdateSuccess(false);
    
    try {
      const response = await apiFetch('/api/users/profileUpdate', {
        method: 'PUT',
        body: JSON.stringify({
          id: profile.id.toString(),
          username: profile.username,
          email: profile.email,
        }),
      });

      // Update localStorage with new user data from response
      const updatedUserData = {
        id: response.user.id,
        username: response.user.username,
        email: response.user.email,
      };
      localStorage.setItem('authUser', JSON.stringify(updatedUserData));
      
      setIsUpdating(false);
      setUpdateSuccess(true);
      setHasUnsavedChanges(false);
      setConfirmDialogOpen(true);
      toast.success(response.message || 'Profile updated successfully!');
      
    } catch (error: any) {
      setIsUpdating(false);
      setConfirmDialogOpen(false);
      
      if (error.errors) {
        setProfileErrors(error.errors);
      } else {
        toast.error(error.message || 'Failed to update profile');
      }
    }
  };

  const [notifications, setNotifications] = useState({
    emailNotifications: true,
    desktopNotifications: false,
    soundEnabled: true,
    marketingEmails: false,
    showUnreadBadge: showUnreadBadge,
  });

  const [security, setSecurity] = useState({
    twoFactorEnabled: false,
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const settingsSections: SettingsSection[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'email', label: 'Email Settings', icon: Mail },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'privacy', label: 'Privacy', icon: Globe },
    { id: 'data', label: 'Data Management', icon: Database },
  ];

  const handleSave = () => {
    // Update the email context state
    setShowUnreadBadge(notifications.showUnreadBadge);
    setHasUnsavedChanges(false);
    
    // This would normally send settings to the server API as well
    toast.success('Settings saved successfully!');
  };

  const handleExportData = () => {
    toast.success('Data export started. You will receive an email when ready.');
  };

  const handleDeleteAccount = () => {
    toast.error('Account deletion requires additional confirmation');
  };

  const pageVariants = {
    initial: { opacity: 0, y: 20 },
    animate: { 
      opacity: 1, 
      y: 0,
      transition: {
        duration: 0.4,
        ease: easeOut
      }
    },
  };

  const sectionVariants = {
    initial: { opacity: 0, x: 20 },
    animate: { 
      opacity: 1, 
      x: 0,
      transition: {
        duration: 0.3,
        ease: easeOut
      }
    },
  };

  // Mapping of section IDs to their respective content for cleaner lookup
  const sectionMap: Record<string, React.ReactElement> = {
    profile: (
      <motion.div variants={sectionVariants} initial="initial" animate="animate" className="space-y-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Profile Settings</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Username
            </label>
            <input
              type="text"
              value={profile.username}
              onChange={(e) => { 
                setProfile({...profile, username: e.target.value}); 
                setHasUnsavedChanges(true);
                setProfileErrors(prev => ({ ...prev, username: undefined }));
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            />
            {profileErrors.username && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{profileErrors.username}</p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={profile.email}
              onChange={(e) => { 
                setProfile({...profile, email: e.target.value}); 
                setHasUnsavedChanges(true);
                setProfileErrors(prev => ({ ...prev, email: undefined }));
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
            />
            {profileErrors.email && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{profileErrors.email}</p>
            )}
          </div>

          <div className="pt-4">
            <Button 
              onClick={handleProfileUpdate}
              className="flex items-center space-x-2"
              disabled={!hasUnsavedChanges}
            >
              <Save className="w-4 h-4" />
              <span>Update Profile</span>
            </Button>
          </div>
        </div>
      </motion.div>
    ),
    notifications: (
      <motion.div variants={sectionVariants} initial="initial" animate="animate" className="space-y-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Notification Preferences</h2>
        
        <div className="space-y-4">
          {Object.entries(notifications).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {key === 'emailNotifications' && 'Receive email notifications for new messages'}
                  {key === 'desktopNotifications' && 'Show desktop notifications'}
                  {key === 'soundEnabled' && 'Play sound for notifications'}
                  {key === 'marketingEmails' && 'Receive marketing and promotional emails'}
                  {key === 'showUnreadBadge' && 'Show red dot for unread messages'}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => { setNotifications({...notifications, [key]: e.target.checked}); setHasUnsavedChanges(true); }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>
          ))}
        </div>
      </motion.div>
    ),
    security: (
      <motion.div variants={sectionVariants} initial="initial" animate="animate" className="space-y-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Security Settings</h2>
        
        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Two-Factor Authentication</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Add an extra layer of security to your account
              </p>
            </div>
            <Button variant={security.twoFactorEnabled ? "primary" : "outline"}>
              {security.twoFactorEnabled ? "Enabled" : "Enable"}
            </Button>
          </div>

          <div className="space-y-4">
            <h3 className="font-medium text-gray-900 dark:text-white">Change Password</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Current Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={security.currentPassword}
                  onChange={(e) => { setSecurity({...security, currentPassword: e.target.value}); setHasUnsavedChanges(true); }}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-400" />
                  )}
                </button>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                New Password
              </label>
              <input
                type="password"
                value={security.newPassword}
                onChange={(e) => { setSecurity({...security, newPassword: e.target.value}); setHasUnsavedChanges(true); }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                value={security.confirmPassword}
                onChange={(e) => { setSecurity({...security, confirmPassword: e.target.value}); setHasUnsavedChanges(true); }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>
        </div>
      </motion.div>
    ),
    appearance: (
      <motion.div variants={sectionVariants} initial="initial" animate="animate" className="space-y-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Appearance</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Theme
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'light', label: 'Light', description: 'Light mode' },
                { id: 'dark', label: 'Dark', description: 'Dark mode' },
                { id: 'system', label: 'System', description: 'Follow system' },
              ].map((themeOption) => (
                <button
                  key={themeOption.id}
                  onClick={() => setTheme(themeOption.id as any)}
                  className={`
                    p-4 border-2 rounded-lg text-left transition-all
                    ${theme === themeOption.id 
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                    }
                  `}
                >
                  <p className="font-medium text-gray-900 dark:text-white">{themeOption.label}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{themeOption.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    ),
    data: (
      <motion.div variants={sectionVariants} initial="initial" animate="animate" className="space-y-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Data Management</h2>
        
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Export Data</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Download a copy of your data
                </p>
              </div>
              <Button onClick={handleExportData} className="flex items-center space-x-2">
                <Download className="w-4 h-4" />
                <span>Export</span>
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Import Data</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Import data from another email client
                </p>
              </div>
              <Button variant="outline" className="flex items-center space-x-2">
                <Upload className="w-4 h-4" />
                <span>Import</span>
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 border border-red-200 dark:border-red-600 rounded-lg bg-red-50 dark:bg-red-900/20">
              <div>
                <p className="font-medium text-red-900 dark:text-red-100">Delete Account</p>
                <p className="text-sm text-red-600 dark:text-red-400">
                  Permanently delete your account and all data
                </p>
              </div>
              <Button 
                variant="outline" 
                onClick={handleDeleteAccount}
                className="text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center space-x-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    ),
    email: (
      <EmailSettings isMobile={isMobile} />
    ),
    default: (
      <motion.div variants={sectionVariants} initial="initial" animate="animate" className="space-y-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          {settingsSections.find(s => s.id === activeSection)?.label}
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          This section is coming soon...
        </p>
      </motion.div>
    ),
  };

  if (isMobile) {
    return (
      <div className="p-4">
        {settingsSections.map(section => {
          const Icon = section.icon;
          const isOpen = expandedSection === section.id;
          return (
            <div key={section.id} className="border rounded-lg mb-4">
              <button
                className="w-full flex justify-between items-center p-4"
                onClick={() => handleSectionClick(section.id)}
              >
                <div className="flex items-center space-x-2">
                  <Icon className={`w-5 h-5 transition-colors ${isOpen ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`} />
                  <span className={`text-lg font-medium transition-colors ${isOpen ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>{section.label}</span>
                </div>
                <ChevronDown className={`w-5 h-5 text-gray-700 dark:text-gray-300 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="p-4 overflow-auto max-h-[70vh]"
                  >
                    {sectionMap[section.id] || sectionMap.default}
                    {/* Footer button: only for non-profile, non-appearance, non-email sections */}
                    {section.id !== 'profile' && section.id !== 'appearance' && section.id !== 'email' && (
                      <div className="mt-4 text-right">
                        <Button
                          onClick={() => handleSave()}
                          className="px-4 py-2"
                        >
                          Save Changes
                        </Button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
        
        {/* Unsaved changes dialog for section switching */}
        <ConfirmDialog
          isOpen={confirmDialogOpen && !isUpdating && !updateSuccess && pendingSection !== null}
          title="Unsaved Changes"
          message="You have unsaved changes. Discard and continue?"
          onConfirm={confirmDiscard}
          onCancel={cancelDiscard}
        />
        
        {/* Profile update confirmation dialog */}
        {confirmDialogOpen && !pendingSection && (
          <>
            {isUpdating ? (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-md p-6">
                  <div className="flex flex-col items-center space-y-4">
                    <LoadingSpinner message="Updating your profile..." />
                  </div>
                </div>
              </div>
            ) : updateSuccess ? (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-md p-6">
                  <div className="flex flex-col items-center space-y-4">
                    <CheckCircle className="h-12 w-12 text-green-600" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">Profile Updated Successfully!</h3>
                    <p className="text-gray-700 dark:text-gray-300 text-center">Your profile information has been updated.</p>
                    <Button 
                      onClick={() => {
                        setUpdateSuccess(false);
                        setConfirmDialogOpen(false);
                        setIsUpdating(false);
                      }}
                      className="mt-4"
                    >
                      OK
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <ConfirmDialog
                isOpen={true}
                title="Confirm Profile Update"
                message="Are you sure you want to update your profile with the new information?"
                confirmLabel="Update"
                cancelLabel="Cancel"
                onConfirm={confirmProfileUpdate}
                onCancel={() => setConfirmDialogOpen(false)}
                variant="info"
              />
            )}
          </>
        )}
      </div>
    );
  }
  
  return (
    <motion.div
      className="w-full"
      variants={pageVariants}
      initial="initial"
      animate="animate"
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg">
        <div className="flex">
          {/* Sidebar */}
          <div className="w-64 border-r border-gray-200 dark:border-gray-700">
            <div className="p-6">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                Settings
              </h1>
              <nav className="space-y-1">
                {settingsSections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <button
                      key={section.id}
                      onClick={() => setActiveSection(section.id)}
                      className={`
                        w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium text-left
                        transition-colors duration-200
                        ${activeSection === section.id
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }
                      `}
                    >
                      <Icon className="w-5 h-5" />
                      <span>{section.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 p-6">
            {sectionMap[activeSection] || sectionMap.default}

            {/* Save Button */}
            {activeSection !== 'profile' && activeSection !== 'appearance' && activeSection !== 'email' && (
              <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                <Button onClick={handleSave} className="flex items-center space-x-2">
                  <Save className="w-4 h-4" />
                  <span>Save Changes</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Desktop Profile Update Dialogs */}
      {confirmDialogOpen && !pendingSection && (
        <>
          {isUpdating ? (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-md p-6">
                <div className="flex flex-col items-center space-y-4">
                  <LoadingSpinner message="Updating your profile..." />
                </div>
              </div>
            </div>
          ) : updateSuccess ? (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-md p-6">
                <div className="flex flex-col items-center space-y-4">
                  <CheckCircle className="h-12 w-12 text-green-600" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">Profile Updated Successfully!</h3>
                  <p className="text-gray-700 dark:text-gray-300 text-center">Your profile information has been updated.</p>
                  <Button 
                    onClick={() => {
                      setUpdateSuccess(false);
                      setConfirmDialogOpen(false);
                      setIsUpdating(false);
                    }}
                    className="mt-4"
                  >
                    OK
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <ConfirmDialog
              isOpen={true}
              title="Confirm Profile Update"
              message="Are you sure you want to update your profile with the new information?"
              confirmLabel="Update"
              cancelLabel="Cancel"
              onConfirm={confirmProfileUpdate}
              onCancel={() => setConfirmDialogOpen(false)}
              variant="info"
            />
          )}
        </>
      )}
    </motion.div>
  );
};

export default SettingsPage;
