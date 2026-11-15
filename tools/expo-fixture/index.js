import { registerRootComponent, useEvent } from 'expo';
import { File, Paths } from 'expo-file-system';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useMemo, useRef, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createNativeFixtureClient } from '../../apps/mobile/native-fixture-client.mjs';

const origin = process.env.EXPO_PUBLIC_FIXTURE_ORIGIN ?? 'http://localhost:3103';

function Player({ grant, onSave }) {
  const initialPosition = useRef(grant.position);
  const player = useVideoPlayer({ uri: grant.url, contentType: 'hls' });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  React.useEffect(() => {
    if (status === 'readyToPlay' && initialPosition.current !== null) {
      player.currentTime = initialPosition.current;
      initialPosition.current = null;
    }
  }, [status, player]);

  return (
    <View>
      <VideoView style={styles.video} player={player} nativeControls />
      <Text accessibilityLiveRegion="polite">Player status: {status}</Text>
      <Button title="Save playback position" disabled={status !== 'readyToPlay'} onPress={() => onSave(player.currentTime)} />
    </View>
  );
}

function FixtureApp() {
  const client = useMemo(() => createNativeFixtureClient(origin), []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [identity, setIdentity] = useState(null);
  const [name, setName] = useState('');
  const [grant, setGrant] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  async function run(action) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      setStatus(await action());
    } catch (error) {
      setStatus(error?.code ? 'Fixture request failed: ' + error.code : 'Fixture operation failed.');
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  async function login() {
    await client.login(email, password);
    setPassword('');
    try {
      const { titles } = await client.list({ source: 'fixture', limit: 1 });
      const title = titles[0] ? await client.title(titles[0]) : null;
      const episode = title?.episodes[0];
      if (!episode) {
        await client.logout();
        return 'No fixture episode. Run fixture sync and publish media.';
      }
      setIdentity({ source: title.source, id: title.id, locale: title.locale, episodeId: episode.id });
      setName(title.name + ' · ' + episode.name);
      return 'Signed in.';
    } catch (error) {
      await client.logout().catch(() => {});
      throw error;
    }
  }

  async function loadPlayer() {
    const { positionSeconds } = await client.progress(identity);
    const playback = await client.fixtureGrant(identity, 'playback');
    setGrant({ ...playback, position: positionSeconds });
    return 'Loaded saved position: ' + positionSeconds + 's.';
  }

  async function verifyDownload() {
    const { url } = await client.fixtureGrant(identity, 'download');
    const destination = new File(Paths.cache, 'svb-fixture-' + Date.now() + '.mp4');
    try {
      const file = await File.downloadFileAsync(url, destination);
      if (!file.exists || file.size <= 0) throw new Error('Empty fixture download');
      return 'Downloaded and removed test file (' + file.size + ' bytes).';
    } finally {
      if (destination.exists) destination.delete();
    }
  }

  async function logout() {
    try {
      await client.logout();
      return 'Signed out.';
    } finally {
      setGrant(null);
      setIdentity(null);
      setName('');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header">Series Viral Box device fixture</Text>
      {identity ? (
        <>
          <Text>{name}</Text>
          <Button disabled={busy} title="Load or reload playback" onPress={() => run(loadPlayer)} />
          {grant && <Player key={grant.url} grant={grant} onSave={seconds => run(async () => {
            const { positionSeconds } = await client.setProgress(identity, Math.floor(Math.max(0, seconds)));
            return 'Saved position: ' + positionSeconds + 's.';
          })} />}
          <Button disabled={busy} title="Verify MP4 download" onPress={() => run(verifyDownload)} />
          <Button disabled={busy} title="Sign out" onPress={() => run(logout)} />
        </>
      ) : (
        <>
          <TextInput accessibilityLabel="Email" placeholder="Email" keyboardType="email-address"
            autoCapitalize="none" value={email} onChangeText={setEmail} autoComplete="email" />
          <TextInput accessibilityLabel="Password" placeholder="Password" value={password}
            onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
          <Button disabled={busy || !email || !password} title="Sign in" onPress={() => run(login)} />
        </>
      )}
      <Text accessibilityLiveRegion="polite">{status}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, paddingTop: 64, gap: 14 },
  video: { height: 240, width: '100%' },
});

registerRootComponent(FixtureApp);
