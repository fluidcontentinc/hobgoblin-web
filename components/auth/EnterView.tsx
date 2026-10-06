import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { AuthRole } from '../../utils/auth';

/**
 * Roles that can self-register on marketplace-engine.
 * Engine `RegisterRequest` accepts: customer | owner | parent | restaurant | driver.
 * Drivers can sign up but see no orders until an admin approves them.
 * Kids are provisioned by parents (invite code) and cannot self-register.
 */
type SignupCapableRole = Extract<AuthRole, 'parent' | 'restaurant' | 'driver'>;

const choiceCopy: Record<SignupCapableRole, { title: string; subtitle: string }> = {
  parent:     { title: 'Parent',     subtitle: 'Log in or create an account' },
  restaurant: { title: 'Restaurant', subtitle: 'Log in or create an account' },
  driver:     { title: 'Driver',     subtitle: 'Deliver orders from local restaurants' },
};

export default function EnterView({
  onPickRole,
  onSignUp,
}: {
  onPickRole: (role: AuthRole) => void;
  onSignUp: (role: AuthRole) => void;
}) {
  const [choiceRole, setChoiceRole] = useState<SignupCapableRole | null>(null);

  if (choiceRole) {
    const { title, subtitle } = choiceCopy[choiceRole];
    return (
      <View style={styles.container}>
        <TouchableOpacity
          onPress={() => setChoiceRole(null)}
          activeOpacity={0.8}
          style={styles.backButton}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => {
            const role = choiceRole;
            setChoiceRole(null);
            onPickRole(role);
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Log In</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => {
            const role = choiceRole;
            setChoiceRole(null);
            onSignUp(role);
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Sign Up</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter</Text>
      <Text style={styles.subtitle}>Choose your role to continue</Text>

      <TouchableOpacity style={styles.button} onPress={() => setChoiceRole('parent')} activeOpacity={0.8}>
        <Text style={styles.buttonText}>Parent</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={() => setChoiceRole('restaurant')} activeOpacity={0.8}>
        <Text style={styles.buttonText}>Restaurant</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={() => setChoiceRole('driver')} activeOpacity={0.8}>
        <Text style={styles.buttonText}>Driver</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={() => onPickRole('kid')} activeOpacity={0.8}>
        <Text style={styles.buttonText}>Kid</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.adminButton} onPress={() => onPickRole('admin')} activeOpacity={0.8}>
        <Text style={styles.adminButtonText}>Admin</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 16,
    justifyContent: 'center',
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
    marginBottom: 16,
    textAlign: 'center',
  },
  button: {
    minHeight: 44,
    borderRadius: 4,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  buttonText: {
    color: '#C9943D',
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  adminButton: {
    minHeight: 36,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  adminButtonText: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
