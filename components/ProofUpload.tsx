import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { AdventureActions } from '../src/usecases/adventure';
import type { ProofSubmission } from '../src/repositories/AdventureRepository';
import type { Transmission } from '../state';
import TransmissionOverlay from './TransmissionOverlay';

interface ProofUploadProps {
  stepId: number;
  onSuccess: (submission: ProofSubmission) => void;
  onError?: (error: Error) => void;
  disabled?: boolean;
}

type UploadState = 'idle' | 'picking' | 'uploading' | 'submitting' | 'success' | 'pending' | 'error';

export default function ProofUpload({ stepId, onSuccess, onError, disabled = false }: ProofUploadProps) {
  const [state, setState] = useState<UploadState>('idle');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [assetId, setAssetId] = useState<number | null>(null);
  const [submission, setSubmission] = useState<ProofSubmission | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transmission, setTransmission] = useState<Transmission | null>(null);
  const [showTransmission, setShowTransmission] = useState(false);

  const handlePickImage = async () => {
    if (disabled || state === 'uploading' || state === 'submitting') return;

    try {
      setState('picking');
      setErrorMessage(null);

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera roll permissions to upload proof.');
        setState('idle');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
        await handleUploadAndSubmit(result.assets[0].uri);
      } else {
        setState('idle');
      }
    } catch (error) {
      console.error('Error picking image:', error);
      setState('error');
      setErrorMessage('Failed to pick image. Please try again.');
      onError?.(error as Error);
    }
  };

  const handleTakePhoto = async () => {
    if (disabled || state === 'uploading' || state === 'submitting') return;

    try {
      setState('picking');
      setErrorMessage(null);

      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera permissions to take a photo.');
        setState('idle');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
        await handleUploadAndSubmit(result.assets[0].uri);
      } else {
        setState('idle');
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      setState('error');
      setErrorMessage('Failed to take photo. Please try again.');
      onError?.(error as Error);
    }
  };

  const handleUploadAndSubmit = async (uri: string) => {
    try {
      // Step 1: Upload proof
      setState('uploading');
      setErrorMessage(null);

      // Convert URI to Blob for upload
      const response = await fetch(uri);
      const blob = await response.blob();

      const uploadResult = await AdventureActions.uploadProof(blob);
      setAssetId(uploadResult.asset_id);

      // Step 2: Submit proof
      setState('submitting');
      const submissionResult = await AdventureActions.submitProof(stepId, uploadResult.asset_id);
      setSubmission(submissionResult);

      // Step 3: Handle response based on status
      if (submissionResult.status === 'pending') {
        setState('pending');
        Alert.alert('Proof Submitted', 'Your proof has been submitted and is pending approval.');
      } else if (submissionResult.status === 'approved') {
        setState('success');
        Alert.alert('Success', 'Your proof has been approved!');
      } else {
        // For other statuses, treat as pending
        setState('pending');
        Alert.alert('Proof Submitted', 'Your proof has been submitted and is pending review.');
      }

      // Step 4: Show transmission if present
      if (submissionResult.transmission) {
        setTransmission(submissionResult.transmission);
        setShowTransmission(true);
      }

      onSuccess(submissionResult);
    } catch (error) {
      console.error('Error uploading/submitting proof:', error);
      setState('error');
      setErrorMessage('Failed to upload or submit proof. Please try again.');
      onError?.(error as Error);
    }
  };

  const handleReset = () => {
    setState('idle');
    setSelectedImage(null);
    setAssetId(null);
    setSubmission(null);
    setErrorMessage(null);
    setTransmission(null);
    setShowTransmission(false);
  };

  const handleTransmissionDismiss = () => {
    setShowTransmission(false);
    if (transmission) {
      // Mark transmission as acknowledged
      setTransmission({ ...transmission, acknowledged: true });
    }
  };

  const isProcessing = state === 'picking' || state === 'uploading' || state === 'submitting';
  const isComplete = state === 'success' || state === 'pending';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Submit Proof</Text>

      {/* Image Preview */}
      {selectedImage ? (
        <View style={styles.imagePreview}>
          <Image source={{ uri: selectedImage }} style={styles.previewImage} />
          {(state === 'uploading' || state === 'submitting') && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator size="large" color="#C9943D" />
              <Text style={styles.processingText}>
                {state === 'uploading' ? 'Uploading...' : 'Submitting...'}
              </Text>
            </View>
          )}
          {state === 'pending' && (
            <View style={styles.statusOverlay}>
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingText}>Pending Approval</Text>
              </View>
            </View>
          )}
          {state === 'success' && (
            <View style={styles.statusOverlay}>
              <View style={styles.successBadge}>
                <Text style={styles.successText}>Approved</Text>
              </View>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.placeholderText}>
            {state === 'error' ? 'Upload failed' : 'No image selected'}
          </Text>
          {errorMessage && (
            <Text style={styles.errorText}>{errorMessage}</Text>
          )}
        </View>
      )}

      {/* Action Buttons */}
      {!isComplete && (
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton, (disabled || isProcessing) && styles.buttonDisabled]}
            onPress={handlePickImage}
            disabled={disabled || isProcessing}
          >
            {state === 'picking' ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Choose Photo</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton, (disabled || isProcessing) && styles.buttonDisabled]}
            onPress={handleTakePhoto}
            disabled={disabled || isProcessing}
          >
            {state === 'picking' ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>Take Photo</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Reset Button (shown after completion or error) */}
      {(isComplete || state === 'error') && (
        <TouchableOpacity
          style={[styles.button, styles.resetButton]}
          onPress={handleReset}
        >
          <Text style={styles.resetButtonText}>
            {state === 'error' ? 'Try Again' : 'Submit Another'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Status Message */}
      {state === 'pending' && submission && (
        <View style={styles.statusMessage}>
          <Text style={styles.statusMessageText}>
            Your proof submission is pending parent approval. You'll be notified when it's reviewed.
          </Text>
        </View>
      )}

      {/* Transmission Overlay */}
      <TransmissionOverlay
        transmission={transmission}
        visible={showTransmission}
        onDismiss={handleTransmissionDismiss}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  imagePreview: {
    width: '100%',
    height: 200,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: '#000',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingText: {
    color: '#fff',
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  statusOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingBadge: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
  },
  pendingText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  successBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
  },
  successText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: 4,
    backgroundColor: '#3f3f46',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  placeholderText: {
    color: '#71717a',
    fontSize: 14,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  secondaryButton: {
    backgroundColor: '#3f3f46',
  },
  resetButton: {
    backgroundColor: '#3f3f46',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statusMessage: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#3f3f46',
    borderRadius: 4,
  },
  statusMessageText: {
    color: '#a1a1aa',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
});

