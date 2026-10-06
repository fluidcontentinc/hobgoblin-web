import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import api from '../../src/api/client';
import { colors, radii, spacing, type as ty } from './ui/tokens';

type DriverRow = {
  id: number;
  name: string;
  email: string;
  created_at: string;
  driver_approved_at: string | null;
  suspended_at?: string | null;
};

/**
 * Drivers sign up from the app but cannot see or accept deliveries until approved here.
 * Approve only after the off-app checks (identity, background, vehicle/insurance) are done.
 */
export default function DriversTab() {
  const [drivers, setDrivers] = useState<DriverRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.get('/admin/users?role=driver&per_page=100');
      setDrivers(Array.isArray(data) ? data : (data?.data ?? []));
    } catch (e: any) {
      setError(e?.message || "Couldn't load drivers");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setApproved = async (driver: DriverRow, approved: boolean) => {
    setSavingId(driver.id);
    setError(null);
    try {
      const updated = await api.patch(`/admin/users/${driver.id}`, { driver_approved: approved });
      setDrivers((list) =>
        (list ?? []).map((d) => (d.id === driver.id ? { ...d, driver_approved_at: updated?.driver_approved_at ?? null } : d)),
      );
    } catch (e: any) {
      setError(e?.message || "Couldn't update this driver");
    } finally {
      setSavingId(null);
    }
  };

  if (!drivers && !error) {
    return (
      <View style={st.center}>
        <ActivityIndicator color={colors.accent.gold} />
      </View>
    );
  }

  const pending = (drivers ?? []).filter((d) => !d.driver_approved_at);
  const approved = (drivers ?? []).filter((d) => !!d.driver_approved_at);

  const renderRow = (d: DriverRow) => (
    <View key={d.id} style={st.row}>
      <View style={{ flex: 1 }}>
        <Text style={st.name}>{d.name}</Text>
        <Text style={st.meta}>
          {d.email} · signed up {new Date(d.created_at).toLocaleDateString()}
        </Text>
      </View>
      {d.driver_approved_at ? (
        <TouchableOpacity style={st.btnSecondary} onPress={() => setApproved(d, false)} disabled={savingId === d.id} activeOpacity={0.8}>
          {savingId === d.id ? <ActivityIndicator color={colors.accent.gold} /> : <Text style={st.btnSecondaryText}>Revoke</Text>}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={st.btnPrimary} onPress={() => setApproved(d, true)} disabled={savingId === d.id} activeOpacity={0.8}>
          {savingId === d.id ? <ActivityIndicator color="#000" /> : <Text style={st.btnPrimaryText}>Approve</Text>}
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={st.page}>
      <Text style={st.title}>Drivers</Text>
      <Text style={st.lead}>
        Drivers can only see orders and customer addresses after you approve them. Complete identity and background
        checks before approving.
      </Text>
      {error && <Text style={st.error}>{error}</Text>}

      <Text style={st.section}>Waiting for approval ({pending.length})</Text>
      {pending.length === 0 ? <Text style={st.empty}>No pending drivers.</Text> : pending.map(renderRow)}

      <Text style={st.section}>Approved ({approved.length})</Text>
      {approved.length === 0 ? <Text style={st.empty}>No approved drivers yet.</Text> : approved.map(renderRow)}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  page: { padding: spacing['2xl'], gap: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text.primary, fontSize: 20, fontWeight: '600' },
  lead: { color: colors.text.secondary, fontSize: ty.size.xs, marginBottom: spacing.md, maxWidth: 640, lineHeight: 18 },
  section: {
    color: colors.text.softer,
    fontSize: ty.size.eyebrow,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: spacing.xl,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radii.md,
    backgroundColor: colors.surface.sunken,
  },
  name: { color: colors.text.primary, fontSize: 14, fontWeight: '600' },
  meta: { color: colors.text.softer, fontSize: ty.size.xs, marginTop: 2 },
  empty: { color: colors.text.softer, fontSize: ty.size.xs },
  error: { color: '#ff6b6b', fontSize: ty.size.xs },
  btnPrimary: {
    minHeight: 36,
    minWidth: 96,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.accent.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: { color: '#000', fontSize: ty.size.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  btnSecondary: {
    minHeight: 36,
    minWidth: 96,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: { color: colors.accent.gold, fontSize: ty.size.xs, letterSpacing: 1, textTransform: 'uppercase' },
});
