import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

interface TermsViewProps {
  onBack: () => void;
}

const SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: 'Acceptance of terms',
    body: 'PLACEHOLDER — pending legal copy. By using the Hobgoblin Hunt app you agree to these terms.',
  },
  {
    heading: 'Using the app',
    body: 'PLACEHOLDER — pending legal copy. Play fairly, follow the mission instructions, and stay safe in the real world while hunting.',
  },
  {
    heading: 'Accounts',
    body: 'PLACEHOLDER — pending legal copy. You are responsible for activity on your account. Kid accounts are managed with a parent.',
  },
  {
    heading: 'Restaurants and partners',
    body: 'PLACEHOLDER — pending legal copy. Participating restaurants set their own menus and offers. Availability may change.',
  },
  {
    heading: 'Contact',
    body: 'Questions about these terms? Email support@ahomerun.net.',
  },
];

export default function TermsView({ onBack }: TermsViewProps) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.8}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.title}>Terms of Service</Text>
      <Text style={styles.updated}>Last updated: pending</Text>

      {SECTIONS.map((s, i) => (
        <View key={i} style={styles.section}>
          <Text style={styles.heading}>{s.heading}</Text>
          <Text style={styles.body}>{s.body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  header: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  backText: {
    fontSize: 14,
    color: '#C9943D',
  },
  title: {
    fontSize: 22,
    color: '#FFFFFF',
    fontWeight: '600',
    marginBottom: 4,
  },
  updated: {
    fontSize: 12,
    color: '#71717a',
    marginBottom: 20,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  section: {
    marginBottom: 20,
  },
  heading: {
    fontSize: 15,
    color: '#F6E3AE',
    fontWeight: '600',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: '#a1a1aa',
    lineHeight: 20,
  },
});
