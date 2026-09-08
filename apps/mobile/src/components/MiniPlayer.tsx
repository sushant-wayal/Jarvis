import * as React from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { backgroundMusicPlayer, TrackMetadata } from '../services/BackgroundMusicPlayer';
import { Icon } from './Icon';
import { colors, rounded, typography } from '../theme/tokens';

export function MiniPlayer(): React.ReactElement | null {
  const [currentTrack, setCurrentTrack] = React.useState<TrackMetadata | null>(
    backgroundMusicPlayer.getCurrentTrack()
  );
  const [isPlaying, setIsPlaying] = React.useState<boolean>(
    backgroundMusicPlayer.isPlaying()
  );

  React.useEffect(() => {
    const unsubscribe = backgroundMusicPlayer.subscribe((playing, track) => {
      setIsPlaying(playing);
      setCurrentTrack(track);
    });
    return unsubscribe;
  }, []);

  if (!currentTrack) {
    return null;
  }

  const togglePlayPause = async (): Promise<void> => {
    if (isPlaying) {
      await backgroundMusicPlayer.pause();
    } else {
      await backgroundMusicPlayer.resume();
    }
  };

  const handleStop = async (): Promise<void> => {
    await backgroundMusicPlayer.stop();
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Artwork or music icon */}
        <View style={styles.artContainer}>
          {currentTrack.artworkUrl ? (
            <Image
              source={{ uri: currentTrack.artworkUrl }}
              style={styles.artwork}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.artFallback}>
              <Icon name="music_note" size={20} color={colors.primaryFixed} />
            </View>
          )}
        </View>

        {/* Track Title & Artist */}
        <View style={styles.infoContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {currentTrack.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {currentTrack.artist || 'Background Audio'}
          </Text>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            onPress={togglePlayPause}
            style={styles.playButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={isPlaying ? 'Pause music' : 'Play music'}
          >
            <Icon
              name={isPlaying ? 'pause' : 'play_arrow'}
              size={22}
              color={colors.primaryFixed}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleStop}
            style={styles.stopButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Stop music"
          >
            <Icon name="close" size={18} color={colors.outline} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: 'transparent',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(23, 27, 34, 0.94)',
    borderColor: 'rgba(0, 240, 255, 0.25)',
    borderWidth: 1,
    borderRadius: rounded.lg,
    paddingVertical: 8,
    paddingHorizontal: 12,
    shadowColor: '#00F0FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  artContainer: {
    width: 40,
    height: 40,
    borderRadius: rounded.md,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  artwork: {
    width: '100%',
    height: '100%',
  },
  artFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 240, 255, 0.08)',
  },
  infoContainer: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  title: {
    ...typography.bodyMd,
    fontSize: 14,
    color: colors.onSurface,
    fontWeight: '600',
  },
  artist: {
    ...typography.bodySm,
    fontSize: 12,
    color: colors.primaryFixed,
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 240, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
