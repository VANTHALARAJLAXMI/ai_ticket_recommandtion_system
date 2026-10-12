import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react';
import {
  fetchProfile,
  setUserRole,
  signIn,
  signOut,
  signUp,
  updatePassword,
  updateProfileName,
} from '../services/authService.js';
import { loginRoleError } from '../lib/validators.js';
import { isSupabaseConfigured, supabase } from '../services/supabaseClient.js';

const AuthContext = createContext(null);
let loginGate = Promise.resolve();

function beginLoginHold() {
  let release = () => {};
  loginGate = new Promise((resolve) => {
    release = resolve;
  });
  return release;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      if (!data.session?.user) {
        setLoading(false);
        return;
      }
      fetchProfile(data.session.user.id).then((result) => {
        if (!active) return;
        setProfile(result.profile);
        setProfileError(result.error || '');
        setLoading(false);
      });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setTimeout(() => {
        loginGate.then(() => {
          if (!active) return;
          supabase.auth.getSession().then(({ data }) => {
            if (!active) return;
            const current = data.session ?? null;
            if (!current?.user || current.user.id !== nextSession?.user?.id) {
              if (!current?.user) {
                setSession(null);
                setProfile(null);
                setProfileError('');
              }
              setLoading(false);
              return;
            }
            setSession(current);
            fetchProfile(current.user.id).then((result) => {
              if (!active) return;
              setProfile(result.profile);
              setProfileError(result.error || '');
              setLoading(false);
            });
          });
        });
      }, 0);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      user: session?.user ?? null,
      profile,
      profileError,
      role: profile?.role ?? null,
      async login(email, password, expectedRole) {
        const release = beginLoginHold();
        try {
          const result = await signIn(email, password);
          if (result.error || !result.user) return result;
          const profileResult = await fetchProfile(result.user.id);
          if (profileResult.error || !profileResult.profile) {
            await signOut();
            setSession(null);
            setProfile(null);
            return { error: profileResult.error || 'Your profile could not be loaded.' };
          }
          const roleError = loginRoleError(expectedRole, profileResult.profile.role);
          if (roleError) {
            await signOut();
            setSession(null);
            setProfile(null);
            return { error: roleError };
          }
          setSession(result.session ?? null);
          setProfile(profileResult.profile);
          return { ...result, profile: profileResult.profile, error: '' };
        } finally {
          release();
        }
      },
      async register(input) {
        const result = await signUp(input);
        if (result.error || !result.user || result.needsConfirmation) return result;
        const profileResult = await fetchProfile(result.user.id);
        if (profileResult.profile) setProfile(profileResult.profile);
        return { ...result, profile: profileResult.profile, error: profileResult.error || '' };
      },
      async logout() {
        const result = await signOut();
        if (!result.error) {
          setSession(null);
          setProfile(null);
        }
        return result;
      },
      async saveProfile(fullName) {
        if (!session?.user) return { error: 'Your session has expired. Sign in again.' };
        const result = await updateProfileName(session.user.id, fullName);
        if (result.profile) setProfile(result.profile);
        return result;
      },
      async savePassword(password) {
        return updatePassword(password);
      },
      async changeRole(userId, role) {
        return setUserRole(userId, role);
      },
      async reloadProfile() {
        if (!session?.user) return;
        const result = await fetchProfile(session.user.id);
        setProfile(result.profile);
        setProfileError(result.error || '');
      },
    }),
    [loading, session, profile, profileError],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
