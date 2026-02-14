import { Audio } from "expo-av";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { SoundKey } from "../types/app";

const SOUND_SOURCE: Record<SoundKey, number> = {
  whistle: require("../../assets/sounds/whistle.wav"),
  shortBell: require("../../assets/sounds/short_bell.wav"),
  longBell: require("../../assets/sounds/long_bell.wav"),
  startSignal: require("../../assets/sounds/start_signal.wav"),
  stopSignal: require("../../assets/sounds/stop_signal.wav"),
  clap: require("../../assets/sounds/clap.wav"),
  countdown: require("../../assets/sounds/countdown.wav"),
  confirm: require("../../assets/sounds/confirm.wav"),
};

export interface SoundEngine {
  ready: boolean;
  play: (key: SoundKey) => Promise<void>;
  startLoop: (key: SoundKey) => Promise<void>;
  stopLoop: (key: SoundKey) => Promise<void>;
  stopAll: () => Promise<void>;
}

export const useSoundEngine = (masterVolume: number, enabled: boolean): SoundEngine => {
  const soundsRef = useRef<Partial<Record<SoundKey, Audio.Sound>>>({});
  const loadedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const prepare = async () => {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: true,
      });

      const entries = Object.entries(SOUND_SOURCE) as Array<[SoundKey, number]>;
      await Promise.all(
        entries.map(async ([key, source]) => {
          const sound = new Audio.Sound();
          await sound.loadAsync(source);
          await sound.setVolumeAsync(masterVolume);
          soundsRef.current[key] = sound;
        })
      );

      if (mounted) {
        loadedRef.current = true;
      }
    };

    void prepare();

    return () => {
      mounted = false;
      loadedRef.current = false;
      const sounds = Object.values(soundsRef.current);
      soundsRef.current = {};
      sounds.forEach((sound) => {
        void sound?.unloadAsync();
      });
    };
  }, []);

  useEffect(() => {
    const sounds = Object.values(soundsRef.current);
    sounds.forEach((sound) => {
      void sound?.setVolumeAsync(masterVolume);
    });
  }, [masterVolume]);

  const play = useCallback(
    async (key: SoundKey) => {
      if (!enabled) {
        return;
      }
      const sound = soundsRef.current[key];
      if (!sound) {
        return;
      }
      await sound.setIsLoopingAsync(false);
      await sound.setVolumeAsync(masterVolume);
      await sound.setPositionAsync(0);
      await sound.playAsync();
    },
    [enabled, masterVolume]
  );

  const startLoop = useCallback(
    async (key: SoundKey) => {
      if (!enabled) {
        return;
      }
      const sound = soundsRef.current[key];
      if (!sound) {
        return;
      }
      await sound.setVolumeAsync(masterVolume);
      await sound.setPositionAsync(0);
      await sound.setIsLoopingAsync(true);
      await sound.playAsync();
    },
    [enabled, masterVolume]
  );

  const stopLoop = useCallback(async (key: SoundKey) => {
    const sound = soundsRef.current[key];
    if (!sound) {
      return;
    }
    await sound.setIsLoopingAsync(false);
    await sound.stopAsync();
  }, []);

  const stopAll = useCallback(async () => {
    const entries = Object.entries(soundsRef.current) as Array<[SoundKey, Audio.Sound | undefined]>;
    await Promise.all(
      entries.map(async ([, sound]) => {
        if (!sound) {
          return;
        }
        await sound.setIsLoopingAsync(false);
        const status = await sound.getStatusAsync();
        if (status.isLoaded && status.isPlaying) {
          await sound.stopAsync();
        }
      })
    );
  }, []);

  return useMemo(
    () => ({
      ready: loadedRef.current,
      play,
      startLoop,
      stopLoop,
      stopAll,
    }),
    [play, startLoop, stopLoop, stopAll]
  );
};
