import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import api from '../../src/api/client';

interface Props {
  /** Called after the code is claimed and the token is stored. */
  onClaimed: () => void;
  /** Go back to the role picker. */
  onBack: () => void;
}

export default function KidClaimView({ onClaimed, onBack }: Props) {
  const [code, setCode]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const handleChange = (text: string) => {
    // Accept raw input and normalise to uppercase, stripping anything
    // that isn't alphanumeric or a dash. The backend expects HOB-XXXX.
    const cleaned = text.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    setCode(cleaned);
    setError(null);
  };

  const handleSubmit = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setError('Enter the code your parent gave you.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.claimInviteCode(trimmed);
      // Token is stored inside claimInviteCode — just notify the parent component.
      onClaimed();
    } catch (e: any) {
      setError(e?.message ?? 'Invalid or expired code. Ask your parent for a new one.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableOpacity style={s.back} onPress={onBack} activeOpacity={0.8}>
        <Text style={s.backText}>Back</Text>
      </TouchableOpacity>

      <View style={s.body}>
        <Text style={s.heading}>Enter Your Code</Text>
        <Text style={s.sub}>
          Ask your parent for the code, then type it below.
        </Text>

        <TextInput
          style={s.input}
          value={code}
          onChangeText={handleChange}
          placeholder="HOB-XXXX"
          placeholderTextColor="rgba(255,255,255,0.25)"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={16}
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />

        {error ? <Text style={s.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[s.btn, loading && s.btnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading
            ? <ActivityIndicator color="#000" />
            : <Text style={s.btnText}>Join</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  back: {
    position: 'absolute',
    top: 20,
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
  body: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  heading: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  sub: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  input: {
    backgroundColor: '#111',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  error: {
    color: '#c45c5c',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  btn: {
    backgroundColor: '#C9943D',
    borderRadius: 4,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
