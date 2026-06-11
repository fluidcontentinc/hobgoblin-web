import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import type { AuthRole } from '../../utils/auth';
import { Repos } from '../../src/usecases/repos';
import { isNetworkErrorType } from '../../src/api/errors';
import type { ApiError } from '../../src/api/errors';

interface RegisterViewProps {
  role: AuthRole;
  onSwitchToLogin: () => void;
  onSwitchRole: () => void;
  onRegistered: (email: string) => void;
  error?: string | null;
}

const roleSubtitle: Record<AuthRole, string> = {
  parent:     'Create your parent account',
  restaurant: 'Create your restaurant account',
  driver:     'Create your driver account',
  kid:        'Create your account',
  admin:      'Create your admin account',
};

export default function RegisterView({
  role,
  onSwitchToLogin,
  onSwitchRole,
  onRegistered,
  error: externalError,
}: RegisterViewProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [loading, setLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const isRestaurant = role === 'restaurant';
  const displayError = inlineError || externalError;

  /**
   * Senior-friendly polish: auto-capitalize words in the restaurant name
   * on the way out so "mickeys" → "Mickeys", "joe's diner" → "Joe's Diner".
   * Preserves the user's raw input in the field; only normalizes on submit.
   */
  const titleCase = (s: string): string =>
    s.replace(/\b\w/g, (c) => c.toUpperCase());

  const handleRegister = async () => {
    setInlineError(null);

    if (!name.trim()) {
      setInlineError('Your name is required.');
      return;
    }
    if (!email.trim()) {
      setInlineError('Email is required.');
      return;
    }
    if (!password) {
      setInlineError('Password is required.');
      return;
    }
    if (password.length < 8) {
      setInlineError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setInlineError('Passwords do not match.');
      return;
    }
    if (isRestaurant && !restaurantName.trim()) {
      setInlineError('Restaurant name is required.');
      return;
    }

    setLoading(true);
    try {
      const payload: any = {
        name: name.trim(),
        email: email.trim().toLowerCase(),  // lowercase emails — engine treats them case-insensitively
        password,
        password_confirmation: confirmPassword,
        role,
      };
      if (isRestaurant) {
        // Title-case the restaurant name so it displays nicely everywhere downstream.
        payload.restaurant_name = titleCase(restaurantName.trim());
        // Cuisine moved to the merchant dashboard's Edit Store screen (Spec #1).
      }

      await Repos.auth.register(payload);
      onRegistered(email.trim());
    } catch (error: any) {
      if (error.type) {
        const apiError = error as ApiError;
        setInlineError(
          isNetworkErrorType(apiError)
            ? "Can't reach server. Please check your connection and try again."
            : apiError.message
        );
      } else {
        setInlineError(error?.message || 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={onSwitchRole}
        activeOpacity={0.8}
        style={styles.backButton}
      >
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Sign Up</Text>
        <Text style={styles.subtitle}>{roleSubtitle[role]}</Text>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor="rgba(255,255,255,0.55)"
          autoCapitalize="words"
          style={styles.input}
          editable={!loading}
        />

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="rgba(255,255,255,0.55)"
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
          editable={!loading}
        />

        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="rgba(255,255,255,0.55)"
          secureTextEntry
          style={styles.input}
          editable={!loading}
        />

        <TextInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirm password"
          placeholderTextColor="rgba(255,255,255,0.55)"
          secureTextEntry
          style={styles.input}
          editable={!loading}
        />

        {isRestaurant && (
          <>
            <TextInput
              value={restaurantName}
              onChangeText={setRestaurantName}
              placeholder="Restaurant name"
              placeholderTextColor="rgba(255,255,255,0.55)"
              autoCapitalize="words"
              style={styles.input}
              editable={!loading}
            />
            <Text style={styles.helperText}>
              You can set cuisine and a logo from your dashboard after sign up.
            </Text>
          </>
        )}

        {displayError && (
          <Text style={styles.errorText}>{displayError}</Text>
        )}

        <TouchableOpacity
          style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
          onPress={handleRegister}
          activeOpacity={0.85}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.primaryText}>Create Account</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onSwitchToLogin}
          activeOpacity={0.8}
          style={styles.loginLink}
        >
          <Text style={styles.loginLinkText}>Already have an account? Log in</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  backText: {
    color: '#C9943D',
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 16,
    paddingTop: 64,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    minHeight: 44,
    borderRadius: 4,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    color: '#fff',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  primaryBtn: {
    minHeight: 44,
    borderRadius: 4,
    backgroundColor: '#C9943D',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryText: {
    color: '#000',
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 12,
    marginBottom: 12,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  loginLink: {
    marginTop: 20,
    alignItems: 'center',
    paddingVertical: 8,
  },
  loginLinkText: {
    color: '#C9943D',
    fontSize: 14,
    letterSpacing: 1,
  },
  helperText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginTop: -6,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
});
