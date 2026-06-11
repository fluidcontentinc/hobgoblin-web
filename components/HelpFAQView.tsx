import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

export type FAQRole = 'kid' | 'parent' | 'restaurant' | 'driver' | 'general';

interface HelpFAQViewProps {
  onBack: () => void;
  /** Tailors the content to the signed-in account. Defaults to a general set. */
  role?: FAQRole;
}

interface FAQContent {
  title: string;
  /** Short "what this account can do" summary lines. */
  canDo: string[];
  qa: Array<{ q: string; a: string }>;
}

const CONTENT: Record<FAQRole, FAQContent> = {
  general: {
    title: 'Help & FAQ',
    canDo: [],
    qa: [
      {
        q: 'What is the Hobgoblin Hunt?',
        a: 'A real-world adventure game. Pick up missions, visit the spots on your map, and complete each step to earn points and unlock the story.',
      },
      {
        q: 'I need more help.',
        a: 'Email us at support@ahomerun.net and we will get back to you.',
      },
    ],
  },

  kid: {
    title: 'Kid Help & FAQ',
    canDo: [
      'Claim missions and follow the Hunt map.',
      'Complete steps by submitting photo proof.',
      'Earn points as your proof is approved.',
      'Read transmissions from your inbox.',
      'Order food from the Menu tab.',
    ],
    qa: [
      {
        q: 'How do I start a mission?',
        a: 'Open Browse, choose Missions, tap a mission to read its steps, then tap Claim Mission. After claiming, head to the Hunt map to begin.',
      },
      {
        q: 'How do I complete a step?',
        a: 'Tap a step on the Hunt map and follow its instructions. Most steps ask for a photo as proof.',
      },
      {
        q: 'Why is my step still pending?',
        a: 'Steps that need a photo are reviewed by a parent before they count. Ask your parent to approve it in their app.',
      },
      {
        q: 'How do points work?',
        a: 'Each step is worth points. You earn them as your proof is approved. Your total shows on your account.',
      },
    ],
  },

  parent: {
    title: 'Parent Help & FAQ',
    canDo: [
      'Add and link kids using invite codes.',
      'Review and approve or reject your kids\u2019 step proof.',
      'Track each kid\u2019s progress and points.',
      'Manage your account.',
    ],
    qa: [
      {
        q: 'How do I add a kid?',
        a: 'Go to the Kids tab, tap Add Kid, and enter their name. You\u2019ll get an invite code to enter on the kid\u2019s device.',
      },
      {
        q: 'What is an invite code?',
        a: 'A short code (like HOB-XXXX) the kid enters in their app to link to your account. You can regenerate or revoke it anytime.',
      },
      {
        q: 'How do I approve a mission step?',
        a: 'Open the Reviews tab to see pending photo proof. Tap Approve to award the points, or Reject to ask them to try again.',
      },
      {
        q: 'Where do I see my kid\u2019s progress?',
        a: 'Open a kid from the Kids tab to see their current adventure and points.',
      },
    ],
  },

  restaurant: {
    title: 'Restaurant Help & FAQ',
    canDo: [
      'Edit your store profile (name, cuisine, description, logo).',
      'Set your open hours.',
      'Manage your menu.',
      'Receive orders and move them New \u2192 Preparing \u2192 Ready.',
      'Preview your storefront as customers see it.',
    ],
    qa: [
      {
        q: 'How do I edit my menu?',
        a: 'Go to the Menu page in your portal to add, edit, or remove items and prices.',
      },
      {
        q: 'How do I update an order?',
        a: 'On the Orders page, open an order and advance its status as you prepare it: New, Preparing, then Ready for pickup.',
      },
      {
        q: 'How do I change my description?',
        a: 'In Settings, edit the Description field (you can also tap Use template for a starting point), then save.',
      },
      {
        q: 'How do I set my hours?',
        a: 'Open the Hours page in your portal and set your open and close times.',
      },
    ],
  },

  driver: {
    title: 'Driver Help & FAQ',
    canDo: [
      'Go online or offline.',
      'See delivery offers when orders are marked Ready.',
      'Accept or decline offers.',
      'Navigate to pickup and dropoff.',
      'Track earnings and set your payout.',
    ],
    qa: [
      {
        q: 'How do I get offers?',
        a: 'Go online from Settings or Home. Offers appear when a merchant marks an order Ready.',
      },
      {
        q: 'Why am I not seeing offers?',
        a: 'Make sure you\u2019re online and that there are orders ready for pickup nearby.',
      },
      {
        q: 'Where do I see my earnings?',
        a: 'Open the Earnings tab to see your delivery history and totals.',
      },
    ],
  },
};

export default function HelpFAQView({ onBack, role = 'general' }: HelpFAQViewProps) {
  const content = CONTENT[role] ?? CONTENT.general;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.8}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.title}>{content.title}</Text>

      {content.canDo.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.question}>What you can do</Text>
          {content.canDo.map((line, i) => (
            <Text key={i} style={styles.bullet}>• {line}</Text>
          ))}
        </View>
      )}

      {content.qa.map((item, i) => (
        <View key={i} style={styles.card}>
          <Text style={styles.question}>{item.q}</Text>
          <Text style={styles.answer}>{item.a}</Text>
        </View>
      ))}

      <View style={styles.card}>
        <Text style={styles.question}>Still need help?</Text>
        <Text style={styles.answer}>Email support@ahomerun.net and we&apos;ll get back to you.</Text>
      </View>
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
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#0a0a0a',
    borderRadius: 4,
    padding: 16,
    marginBottom: 12,
  },
  question: {
    fontSize: 15,
    color: '#F6E3AE',
    fontWeight: '600',
    marginBottom: 8,
  },
  answer: {
    fontSize: 14,
    color: '#a1a1aa',
    lineHeight: 20,
  },
  bullet: {
    fontSize: 14,
    color: '#a1a1aa',
    lineHeight: 22,
  },
});
