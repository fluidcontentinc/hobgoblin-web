import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Image, Dimensions, Platform } from 'react-native';
import type { Transmission } from '../state';

// Try to import expo-av, fallback to web-compatible solutions
let Video: any = null;
let Audio: any = null;
try {
  const expoAv = require('expo-av');
  Video = expoAv.Video;
  Audio = expoAv.Audio;
} catch (e) {
  // expo-av not available, will use web-compatible solutions
  console.log('expo-av not available, using web-compatible media');
}

interface TransmissionOverlayProps {
  transmission: Transmission | null;
  visible: boolean;
  onDismiss: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function TransmissionOverlay({ transmission, visible, onDismiss }: TransmissionOverlayProps) {
  const [videoStatus, setVideoStatus] = useState<any>({});
  const videoRef = useRef<any>(null);
  const [audioStatus, setAudioStatus] = useState<any>({});
  const audioRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Hooks must always run in the same order — keep this ABOVE the early return.
  useEffect(() => {
    return () => {
      if (videoRef.current && Video) {
        videoRef.current.pauseAsync?.();
      }
      if (audioRef.current && Audio) {
        audioRef.current.unloadAsync?.();
      }
    };
  }, []);

  if (!transmission || !visible) return null;

  const { type, payload } = transmission;
  const mediaUrl = payload.url || payload.mediaUrl || payload.src;
  const mediaType = payload.type || payload.mediaType || type;

  const handleDismiss = async () => {
    // Stop any playing media
    if (videoRef.current && Video) {
      try {
        await videoRef.current.pauseAsync();
      } catch (e) {
        console.error('Error pausing video:', e);
      }
    }
    if (audioRef.current && Audio) {
      try {
        await audioRef.current.unloadAsync();
        audioRef.current = null;
      } catch (e) {
        console.error('Error unloading audio:', e);
      }
    }
    setIsPlaying(false);
    onDismiss();
  };

  const renderMedia = () => {
    if (!mediaUrl) {
      return (
        <View style={styles.mediaPlaceholder}>
          <Text style={styles.placeholderText}>No media available</Text>
        </View>
      );
    }

    // Video
    if (mediaType === 'video' || mediaUrl.match(/\.(mp4|mov|webm|avi)$/i)) {
      if (Video && Platform.OS !== 'web') {
        // Use expo-av Video for native
        return (
          <Video
            ref={videoRef}
            source={{ uri: mediaUrl }}
            style={styles.video}
            useNativeControls
            resizeMode="contain"
            onPlaybackStatusUpdate={(status: any) => {
              setVideoStatus(status);
              if (status.didJustFinish) {
                handleDismiss();
              }
            }}
          />
        );
      } else {
        // Web-compatible: show video link/placeholder
        return (
          <View style={styles.videoContainer}>
            <View style={styles.mediaPlaceholder}>
              <Text style={styles.audioIcon}>VIDEO</Text>
              <Text style={styles.audioText}>Video Transmission</Text>
              <TouchableOpacity
                style={styles.playButton}
                onPress={() => {
                  if (Platform.OS === 'web') {
                    window.open(mediaUrl, '_blank');
                  }
                }}
              >
                <Text style={styles.playButtonText}>Play Video</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      }
    }

    // Audio
    if (mediaType === 'audio' || mediaUrl.match(/\.(mp3|wav|ogg|m4a)$/i)) {
      return (
        <View style={styles.audioContainer}>
          <View style={styles.audioPlaceholder}>
            <Text style={styles.audioIcon}>AUDIO</Text>
            <Text style={styles.audioText}>Audio Transmission</Text>
            {Platform.OS === 'web' ? (
              <TouchableOpacity
                style={styles.playButton}
                onPress={() => {
                  if (typeof window !== 'undefined' && window.Audio) {
                    const audio = new window.Audio(mediaUrl);
                    audio.play();
                    audio.onended = handleDismiss;
                  } else {
                    // Fallback: open in new tab
                    window.open(mediaUrl, '_blank');
                  }
                }}
              >
                <Text style={styles.playButtonText}>Play Audio</Text>
              </TouchableOpacity>
            ) : Audio ? (
              <TouchableOpacity
                style={styles.playButton}
                onPress={async () => {
                  try {
                    const { sound } = await Audio.Sound.createAsync({ uri: mediaUrl });
                    audioRef.current = sound;
                    await sound.playAsync();
                    sound.setOnPlaybackStatusUpdate((status: any) => {
                      if (status.didJustFinish) {
                        handleDismiss();
                      }
                    });
                  } catch (e) {
                    console.error('Error playing audio:', e);
                  }
                }}
              >
                <Text style={styles.playButtonText}>Play Audio</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.placeholderText}>Audio playback not available</Text>
            )}
          </View>
        </View>
      );
    }

    // Image (default)
    return (
      <Image
        source={{ uri: mediaUrl }}
        style={styles.image}
        resizeMode="contain"
      />
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {payload.title || 'Incoming Transmission'}
            </Text>
            <TouchableOpacity onPress={handleDismiss} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>
          </View>

          {/* Message/Description */}
          {payload.message && (
            <Text style={styles.message}>{payload.message}</Text>
          )}

          {/* Media Content */}
          <View style={styles.mediaContainer}>
            {renderMedia()}
          </View>

          {/* Dismiss Button */}
          <TouchableOpacity
            style={styles.dismissButton}
            onPress={handleDismiss}
          >
            <Text style={styles.dismissButtonText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: SCREEN_WIDTH * 0.9,
    maxWidth: 600,
    maxHeight: SCREEN_HEIGHT * 0.85,
    backgroundColor: '#18181b',
    borderRadius: 4,
    padding: 20,
    borderWidth: 2,
    borderColor: '#C9943D',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#C9943D',
    flex: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3f3f46',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#fff',
    lineHeight: 28,
  },
  message: {
    fontSize: 14,
    color: '#a1a1aa',
    marginBottom: 16,
    lineHeight: 20,
    textAlign: 'center',
  },
  mediaContainer: {
    width: '100%',
    minHeight: 200,
    maxHeight: SCREEN_HEIGHT * 0.5,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginBottom: 16,
  },
  video: {
    width: '100%',
    height: '100%',
    minHeight: 200,
  },
  videoContainer: {
    width: '100%',
    height: '100%',
    minHeight: 200,
  },
  image: {
    width: '100%',
    height: '100%',
    minHeight: 200,
  },
  audioContainer: {
    width: '100%',
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioPlaceholder: {
    alignItems: 'center',
  },
  audioIcon: {
    fontSize: 64,
    marginBottom: 12,
  },
  audioText: {
    fontSize: 16,
    color: '#C9943D',
    fontWeight: '600',
  },
  mediaPlaceholder: {
    width: '100%',
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#3f3f46',
  },
  placeholderText: {
    color: '#71717a',
    fontSize: 14,
  },
  playButton: {
    marginTop: 16,
    backgroundColor: '#C9943D',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 4,
  },
  playButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },
  dismissButton: {
    backgroundColor: '#C9943D',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 4,
    alignItems: 'center',
  },
  dismissButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
});

