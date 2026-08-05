// auth.ts

export const setAuthToken = (token: string) => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('tax_auth_token', token);
  }
};

export const getAuthToken = (): string | null => {
  if (typeof window !== 'undefined') {
    return window.localStorage.getItem('tax_auth_token');
  }
  return null;
};

export const removeAuthToken = () => {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('tax_auth_token');
  }
};

export const isAuthenticated = (): boolean => {
  return !!getAuthToken();
};
