import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function UnknownRoleView({ onLogout }: { onLogout: () => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Unknown Role</Text>
      <Text style={styles.message}>
        Your account has an unrecognized role. Please contact support or log out and try again.
      </Text>
      <TouchableOpacity style={styles.logoutButton} onPress={onLogout} activeOpacity={0.8}>
        <Text style={styles.logoutButtonText}>Log Out</Text>
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
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  message: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 32,
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 20,
  },
  logoutButton: {
    minHeight: 44,
    borderRadius: 4,
    backgroundColor: '#C9943D',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logoutButtonText: {
    color: '#000',
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
});

