import React, { useState } from 'react';
import { View, Text, Image, ImageBackground, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { StatusBar } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

interface HomeViewProps {
  showView: (view: 'home' | 'browse' | 'orders' | 'account' | 'inbox', initialTab?: 'hunt' | 'menu') => void;
  inboxUnread?: number;
}

export default function HomeView({ showView, inboxUnread = 0 }: HomeViewProps) {
  const [imageError, setImageError] = useState(false);
  const insets = useSafeAreaInsets();        // ⬅️ add this

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#000',
        marginTop: -insets.top,              // ⬅️ pull up into status-bar area
      }}
    >
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <ImageBackground
        source={require('../assets/hob-hero.jpg')}
        style={styles.backgroundImage}
        resizeMode="cover"
        onError={() => {
          console.log('Background image failed to load, using fallback');
          setImageError(true);
        }}
      >
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          {/* Top-left inbox icon with unread badge */}
          <TouchableOpacity
            style={styles.inboxButton}
            onPress={() => showView('inbox')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Inbox"
          >
            <Image
              source={require('../assets/envelope.png')}
              style={styles.inboxIcon}
              resizeMode="contain"
            />
            {inboxUnread > 0 && (
              <View style={styles.inboxBadge}>
                <Text style={styles.inboxBadgeText}>{inboxUnread > 99 ? '99+' : inboxUnread}</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.presenterText}>HOME RUN OP/RF PRESENTS</Text>
              <Text style={styles.title}>HOB{'\n'}GOBBLER</Text>
              <Text style={styles.subtitle}>
                Can you complete the <Text style={styles.boldText}>Scavenger Hunt</Text>?
              </Text>
            </View>
            
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={styles.button}
                onPress={() => showView('browse')}
                activeOpacity={0.8}
              >
                <Text style={styles.buttonText}>Join the Hunt!</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.button}
                onPress={() => showView('browse', 'menu')}
                activeOpacity={0.8}
              >
                <Text style={styles.buttonText}>Mid Fall - Menu</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    ...Platform.select({
      web: {
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      },
    }),
  },
  fallbackBackground: {
    backgroundColor: '#0a0a0a',
  },
  // center the title block on the image
  content: {
    flex: 1,
    justifyContent: 'space-between', // or 'flex-start'
    paddingTop: 60,
    paddingBottom: 50,
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
  },
  presenterText: {
    fontSize: 12,
    color: 'rgba(54, 54, 54, 0.35)',
    marginBottom: 32,
    letterSpacing: 4,
    textTransform: 'uppercase',
    fontWeight: '400',
  },
  title: {
    fontSize: 48,                 // a bit smaller so it sits nicer
    fontWeight: '400',
    color: 'rgba(0, 0, 0, 0.96)',
    marginBottom: 18,
    letterSpacing: 3,
    lineHeight: 52,
    textAlign: 'center',
    fontFamily: 'serif',
  },
  subtitle: {
    fontSize: 18,
    color: 'rgba(58, 58, 58, 0.96)',
    fontWeight: '400',
    fontFamily: 'serif',
    textAlign: 'center',
  },
  dateText: {
    fontWeight: '500',
  },
  boldText: {
    fontWeight: '700',
  },
  // fixed over the image just above the tab bar
  buttonContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 90,      // sits above the bottom nav (matches mockup)
    flexDirection: 'row',
    gap: 16,
  },
  inboxButton: {
    position: 'absolute',
    top: 12,
    left: 16,
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  inboxIcon: {
    width: 64,
    height: 64,
  },
  inboxBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#E23B2E',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#000',
  },
  inboxBadgeText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '700',
  },
  button: {
    flex: 1,
    minHeight: 52,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: '#C9943D',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 13,
    color: '#F6E3AE',
    fontWeight: '400',
    letterSpacing: 1,
  },
});

