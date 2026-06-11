import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import api from '../../src/api/client';

const RESEND_COOLDOWN_SECONDS = 30;

interface VerifyEmailViewProps {
  email: string;
  /** Called once verification is confirmed — implementor should route to the user's portal. */
  onVerified: () => Promise<void>;
}

export default function VerifyEmailView({ email, onVerified }: VerifyEmailViewProps) {
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleResend = async () => {
    setResendMessage(null);
    setCheckError(null);
    setResending(true);
    try {
      await api.post('/email/verify/resend', { email });
      setResendMessage('Verification email sent! Check your inbox.');
      startCooldown();
    } catch (error: any) {
      setResendMessage(error?.message || "Couldn't resend. Please try again in a moment.");
    } finally {
      setResending(false);
    }
  };

  const handleVerified = async () => {
    setCheckError(null);
    setChecking(true);
    try {
      await onVerified();
      // onVerified routes away on success — nothing to do here if it resolves
    } catch (err: any) {
      // onVerified rejected — email probably not verified yet
      setCheckError("Email not verified yet. Click the link in your inbox first, then try again.");
    } finally {
      setChecking(false);
    }
  };

  const resendDisabled = resending || cooldown > 0;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Check your inbox!</Text>
        <Text style={styles.subtitle}>Verification email sent to</Text>
        <Text style={styles.email}>{email}</Text>

        <Text style={styles.body}>
          Click the link in the email to verify your account, then tap the button below.
        </Text>

        {resendMessage && (
          <Text style={styles.infoText}>{resendMessage}</Text>
        )}

        {checkError && (
          <Text style={styles.errorText}>{checkError}</Text>
        )}

        <TouchableOpacity
          style={[styles.secondaryBtn, resendDisabled && styles.secondaryBtnDisabled]}
          onPress={handleResend}
          activeOpacity={0.85}
          disabled={resendDisabled}
        >
          {resending ? (
            <ActivityIndicator color="#C9943D" />
          ) : (
            <Text style={styles.secondaryText}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend verification email'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryBtn, checking && styles.primaryBtnDisabled]}
          onPress={handleVerified}
          activeOpacity={0.85}
          disabled={checking}
        >
          {checking ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.primaryText}>I've verified, continue</Text>
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
  content: {
    flex: 1,
    padding: 16,
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
    marginBottom: 4,
    textAlign: 'center',
  },
  email: {
    fontSize: 14,
    color: '#C9943D',
    marginBottom: 20,
    textAlign: 'center',
    fontWeight: '600',
  },
  body: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  infoText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  errorText: {
    fontSize: 12,
    color: '#ff6b6b',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  secondaryBtn: {
    minHeight: 44,
    borderRadius: 4,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(201,148,61,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  secondaryBtnDisabled: {
    opacity: 0.5,
  },
  secondaryText: {
    color: '#C9943D',
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  primaryBtn: {
    minHeight: 44,
    borderRadius: 4,
    backgroundColor: '#C9943D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryText: {
    color: '#000',
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
});
