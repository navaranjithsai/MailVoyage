export interface StoredAuthUser {
  id?: string | number;
  username?: string;
  email?: string;
}

export const getStoredAuthUser = (): StoredAuthUser | null => {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('authUser');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredAuthUser;
  } catch {
    return null;
  }
};

export const getStoredUserId = (): string | null => {
  const user = getStoredAuthUser();
  if (!user || user.id === undefined || user.id === null) return null;
  return String(user.id);
};
