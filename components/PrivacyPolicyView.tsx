import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

interface PrivacyPolicyViewProps {
  onBack: () => void;
}

const LAST_UPDATED = 'June 5, 2026';

const SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: 'Overview',
    body: 'Hobgoblin Hunt is a family game that sends kids and parents on real-world food adventures. This policy explains what information we collect, how we use it, and the choices you have. We built the Hunt for families, so we keep data collection limited to what the game needs to work and we give parents control over their kids’ accounts.',
  },
  {
    heading: 'Information we collect',
    body: 'When a parent creates an account, we collect a name, email address, and password. When a parent invites a child, we create a kid account linked to that parent with a display name and the child’s mission progress. As you play, we collect gameplay data such as which adventures you join, steps you complete, points earned, orders you place, and messages or transmissions you receive. We also collect basic device and app information (such as device type, app version, and crash logs) to keep the app running reliably.',
  },
  {
    heading: 'Camera and photos',
    body: 'Some missions ask a player to submit a photo as proof that they reached a location or completed a step. When you tap “Take Photo,” the app opens your device camera so you can capture that photo, and when you tap “Choose Photo,” it opens your photo library so you can pick an existing image. The app only accesses your camera or photo library after you tap one of those buttons — it never records or captures in the background. Photos you submit are uploaded to our servers, attached to the mission step, and shown to the linked parent (and, where needed, our admins) to review and approve the submission. We use the photo only for reviewing mission proof and running the game. You can decline the camera and photo permissions in your device settings; if you do, photo-proof missions cannot be completed.',
  },
  {
    heading: 'How we use information',
    body: 'We use the information we collect to run the game and your account, create and link parent and kid profiles, deliver and review mission proof, place and track food orders, send game and account notifications, keep accounts secure, prevent abuse, and improve the app. We do not use children’s information for behavioral advertising, and we do not sell personal information.',
  },
  {
    heading: "Children's privacy",
    body: 'Hobgoblin Hunt is designed to be used by children under the supervision of a parent or guardian. Every kid account is created and linked through a parent account. The parent reviews and approves their child’s activity, including photo-proof submissions, and can view progress at any time. We collect only the information needed for a child to play the game. A parent can review their child’s information, ask us to delete it, and stop further collection by contacting us at the email below or by removing the kid account. We do not sell or share children’s personal information for advertising.',
  },
  {
    heading: 'How we share information',
    body: 'We share information only as needed to operate the Hunt: with service providers who host our servers, process payments, store uploaded photos, and send notifications on our behalf, and with the parent linked to a child’s account. We may also share information when required by law or to protect the safety of our users. We do not sell your personal information.',
  },
  {
    heading: 'Data retention',
    body: 'We keep your information for as long as your account is active or as needed to provide the game. When an account is deleted, we delete or de-identify the associated personal information and submitted photos within a reasonable period, except where we need to keep certain records to comply with the law, resolve disputes, or enforce our agreements.',
  },
  {
    heading: 'Security',
    body: 'We use reasonable technical and organizational safeguards — such as encrypted connections and access controls — to protect your information. No method of transmission or storage is completely secure, so we cannot guarantee absolute security, but we work to protect your data and to respond promptly to any issues.',
  },
  {
    heading: 'Your choices and rights',
    body: 'You can review and update your account information in the app, manage camera and photo permissions in your device settings, and ask us to access or delete your information. Parents can manage, review, and delete their children’s accounts and data. To make a request, contact us at the email below.',
  },
  {
    heading: 'Changes to this policy',
    body: 'We may update this policy as the game evolves. When we make material changes, we will update the date above and, where appropriate, notify you in the app. Continued use of the Hunt after an update means you accept the revised policy.',
  },
  {
    heading: 'Contact',
    body: 'Questions about privacy, or want to review or delete your or your child’s information? Email support@ahomerun.net.',
  },
];

export default function PrivacyPolicyView({ onBack }: PrivacyPolicyViewProps) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.8}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.title}>Privacy Policy</Text>
      <Text style={styles.updated}>Last updated: {LAST_UPDATED}</Text>

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
