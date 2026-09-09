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
  const [autoplayEnabled, setAutoplayEnabled] = React.useState<boolean>(
    backgroundMusicPlayer.isAutoplayEnabled()
  );
  const [nextTrack, setNextTrack] = React.useState<TrackMetadata | null>(
    backgroundMusicPlayer.getNextTrack()
  );

  React.useEffect(() => {
    const unsubscribe = backgroundMusicPlayer.subscribe((playing, track) => {
      setIsPlaying(playing);
      setCurrentTrack(track);
      setAutoplayEnabled(backgroundMusicPlayer.isAutoplayEnabled());
      setNextTrack(backgroundMusicPlayer.getNextTrack());
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

  const handleSkip = async (): Promise<void> => {
    await backgroundMusicPlayer.skip();
  };

  const handleToggleAutoplay = (): void => {
    const next = backgroundMusicPlayer.toggleAutoplay();
    setAutoplayEnabled(next);
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

        {/* Track Title & Artist & Upcoming track */}
        <View style={styles.infoContainer}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {currentTrack.title}
            </Text>
            {autoplayEnabled && (
              <TouchableOpacity onPress={handleToggleAutoplay} style={styles.autoplayBadge}>
                <Text style={styles.autoplayText}>AUTOPLAY</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.artist} numberOfLines={1}>
            {currentTrack.artist || 'Background Audio'}
            {nextTrack ? ` · Up next: ${nextTrack.title}` : ''}
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
            onPress={handleSkip}
            style={styles.skipButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Skip to next track"
          >
            <Icon name="skip_next" size={20} color={colors.onSurface} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleStop}
            style={styles.stopButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Stop music"
          >
            <Icon name="close" size={16} color={colors.outline} />
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  title: {
    ...typography.bodyMd,
    fontSize: 14,
    color: colors.onSurface,
    fontWeight: '600',
    flex: 1,
  },
  autoplayBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 240, 255, 0.18)',
    borderWidth: 0.5,
    borderColor: 'rgba(0, 240, 255, 0.4)',
  },
  autoplayText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.primaryFixed,
    letterSpacing: 0.5,
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
    gap: 6,
  },
  playButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0, 240, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
