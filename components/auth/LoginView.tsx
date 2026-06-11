import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import type { AuthRole } from '../../utils/auth';

const roleLabel: Record<AuthRole, string> = {
  parent: 'Parent',
  restaurant: 'Restaurant',
  driver: 'Driver',
  kid: 'Kid',
  admin: 'Admin',
};

export default function LoginView({
  role,
  onSwitchRole,
  onLogin,
  error,
}: {
  role: AuthRole;
  onSwitchRole: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  error?: string | null;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      return;
    }
    
    setLoading(true);
    try {
      await onLogin(email.trim(), password);
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

      <View style={styles.content}>
        <Text style={styles.title}>Login</Text>
      <Text style={styles.subtitle}>Signing in as {roleLabel[role]}</Text>

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor="rgba(255,255,255,0.35)"
        autoCapitalize="none"
        keyboardType="email-address"
        style={styles.input}
        editable={!loading}
      />

      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor="rgba(255,255,255,0.35)"
        secureTextEntry
        style={styles.input}
        editable={!loading}
        onSubmitEditing={handleLogin}
      />

      {error && (
        <Text style={styles.errorText}>{error}</Text>
      )}

      <TouchableOpacity
        style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
        onPress={handleLogin}
        activeOpacity={0.85}
        disabled={loading || !email.trim() || !password.trim()}
      >
        {loading ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.primaryText}>Login</Text>
        )}
      </TouchableOpacity>
      </View>
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
  content: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  backText: {
    color: '#C9943D',
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
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
    marginBottom: 10,
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
});


