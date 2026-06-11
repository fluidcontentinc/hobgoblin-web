/**
 * AdminTopBar — global chrome that sits above each page.
 *
 * Left: breadcrumb crumb-trail (`Admin / Adventures / Summer Hunt 2026`).
 * Right: user pill showing the signed-in admin's email + a Sign Out action.
 *
 * The breadcrumb is purely visual today — only the deepest crumb is
 * interactive when relevant (e.g. clicking "Adventures" while inside an
 * adventure detail returns to the list). The user pill triggers the
 * shell-level sign-out flow that AdminPortal owns.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, layout, radii, spacing, type } from './tokens';

export interface BreadcrumbItem {
  label: string;
  /** Optional click handler. If omitted, the crumb is rendered inert. */
  onPress?: () => void;
}

export default function AdminTopBar({
  trail,
  email,
  onSignOut,
}: {
  trail: BreadcrumbItem[];
  email: string | null;
  onSignOut: () => void;
}) {
  const initial = (email?.trim().charAt(0) || 'A').toUpperCase();

  return (
    <View style={styles.bar}>
      {/* Breadcrumb */}
      <View style={styles.crumbs}>
        <Text style={styles.crumbRoot}>Admin</Text>
        {trail.map((item, idx) => (
          <React.Fragment key={`${item.label}-${idx}`}>
            <Text style={styles.crumbSep}>/</Text>
            {item.onPress ? (
              <TouchableOpacity onPress={item.onPress} activeOpacity={0.7}>
                <Text style={styles.crumbLink}>{item.label}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.crumbCurrent} numberOfLines={1}>{item.label}</Text>
            )}
          </React.Fragment>
        ))}
      </View>

      <View style={{ flex: 1 }} />

      {/* User pill */}
      <View style={styles.userPill}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.userEmail} numberOfLines={1}>
          {email ?? 'admin'}
        </Text>
        <View style={styles.pillSep} />
        <TouchableOpacity onPress={onSignOut} activeOpacity={0.7}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: layout.topBarHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing['4xl'],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    backgroundColor: colors.surface.sunken,
  },

  // Breadcrumbs
  crumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  crumbRoot: {
    color: colors.text.dim,
    fontSize: type.size.md,
    fontWeight: type.weight.semi,
    letterSpacing: type.tracking.label,
  },
  crumbSep: {
    color: colors.text.ghost,
    fontSize: type.size.md,
  },
  crumbLink: {
    color: colors.accent.gold,
    fontSize: type.size.md,
    fontWeight: type.weight.semi,
  },
  crumbCurrent: {
    color: colors.text.primary,
    fontSize: type.size.md,
    fontWeight: type.weight.semi,
    maxWidth: 360,
  },

  // User pill
  userPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface.raised,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radii.pill,
    paddingLeft: 4,
    paddingRight: spacing.md,
    paddingVertical: 4,
    gap: spacing.sm,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12, // true circle — exempt from the flat-corner canon
    backgroundColor: colors.accent.goldWashActive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.accent.gold,
    fontSize: type.size.sm,
    fontWeight: type.weight.heavy,
  },
  userEmail: {
    color: colors.text.secondary,
    fontSize: type.size.md,
    maxWidth: 200,
  },
  pillSep: {
    width: 1,
    height: 16,
    backgroundColor: colors.border.subtle,
  },
  signOutText: {
    color: colors.text.dim,
    fontSize: type.size.md,
    fontWeight: type.weight.semi,
  },
});
