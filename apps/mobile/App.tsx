import { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator, AppState, Linking, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View,
} from "react-native"
import { StatusBar } from "expo-status-bar"
import { registerBackgroundSync, unregisterBackgroundSync } from "./src/background"
import { syncOnce } from "./src/sync"
import { ROOT, clearCredentials, loadCredentials, saveCredentials } from "./src/state"

export default function App() {
  const [paired, setPaired] = useState<boolean | null>(null)
  useEffect(() => {
    loadCredentials().then((c) => setPaired(!!c))
  }, [])

  if (paired === null) {
    return (
      <View style={[s.screen, s.center]}>
        <ActivityIndicator color="#e5e5e5" />
      </View>
    )
  }
  return paired ? <Status onUnpair={() => setPaired(false)} /> : <Pair onPaired={() => setPaired(true)} />
}

function Pair({ onPaired }: { onPaired: () => void }) {
  const [apiUrl, setApiUrl] = useState("https://api.darkdrive.zenux.live")
  const [token, setToken] = useState("")
  const [device, setDevice] = useState("Phone")
  const [error, setError] = useState("")

  const submit = async () => {
    const url = apiUrl.trim().replace(/\/+$/, "")
    if (!token.trim().startsWith("dd_")) return setError("That doesn't look like a device token.")
    await saveCredentials({ apiUrl: url, token: token.trim(), device: device.trim() || "Phone" })
    await registerBackgroundSync().catch(() => {})
    onPaired()
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <StatusBar style="light" />
      <Text style={s.h1}>DarkDrive</Text>
      <Text style={s.muted}>
        Pair this device, then anything you put in the DarkDrive folder syncs to every device on
        your account.
      </Text>

      <Text style={s.label}>Server</Text>
      <TextInput
        style={s.input} value={apiUrl} onChangeText={setApiUrl}
        autoCapitalize="none" autoCorrect={false} keyboardType="url"
        placeholder="https://api.example.com" placeholderTextColor="#525252"
      />

      <Pressable
        style={s.secondary}
        onPress={() => Linking.openURL(`${apiUrl.trim().replace(/\/+$/, "")}/api/devices/pair`)}
      >
        <Text style={s.secondaryText}>Open pairing page in browser</Text>
      </Pressable>
      <Text style={s.hint}>
        Sign in there, create a token, then paste it below. It is shown only once.
      </Text>

      <Text style={s.label}>Device token</Text>
      <TextInput
        style={[s.input, s.mono]} value={token} onChangeText={(t) => { setToken(t); setError("") }}
        autoCapitalize="none" autoCorrect={false} multiline
        placeholder="dd_..." placeholderTextColor="#525252"
      />

      <Text style={s.label}>Device name</Text>
      <TextInput
        style={s.input} value={device} onChangeText={setDevice}
        placeholder="Phone" placeholderTextColor="#525252"
      />
      <Text style={s.hint}>Used to label conflicted copies, so you can tell them apart.</Text>

      {!!error && <Text style={s.error}>{error}</Text>}

      <Pressable style={s.primary} onPress={submit}>
        <Text style={s.primaryText}>Pair device</Text>
      </Pressable>
    </ScrollView>
  )
}

function Status({ onUnpair }: { onUnpair: () => void }) {
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [lastRun, setLastRun] = useState<string>("never")
  const [error, setError] = useState("")
  const busyRef = useRef(false)

  const run = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError("")
    const lines: string[] = []
    try {
      await syncOnce((line) => lines.push(line))
      // Keep the tail only — this is a status readout, not an audit log.
      setLog((prev) => [...lines, ...prev].slice(0, 100))
      setLastRun(new Date().toLocaleTimeString())
    } catch (e: any) {
      setError(e?.message ?? "Sync failed")
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    registerBackgroundSync().catch(() => {})
    run()
    // iOS may run the background task rarely or never, so a foreground is the
    // reliable trigger — this is what makes the app feel synced when opened.
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") run()
    })
    return () => sub.remove()
  }, [run])

  return (
    <View style={s.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={s.pad}>
        <Text style={s.h1}>DarkDrive</Text>
        <Text style={s.muted}>
          Syncing the <Text style={s.strong}>DarkDrive</Text> folder in this app's storage. Add
          files to it from the Files app to sync them everywhere.
        </Text>
        <Text style={s.path} selectable numberOfLines={2}>
          {ROOT.uri}
        </Text>

        <Pressable style={[s.primary, busy && s.disabled]} onPress={run} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#0a0a0a" />
          ) : (
            <Text style={s.primaryText}>Sync now</Text>
          )}
        </Pressable>
        <Text style={s.hint}>Last sync: {lastRun}</Text>

        {!!error && <Text style={s.error}>{error}</Text>}

        <Text style={s.label}>Recent activity</Text>
        {log.length === 0 ? (
          <Text style={s.hint}>Nothing to sync — everything is up to date.</Text>
        ) : (
          log.map((line, i) => (
            <Text key={i} style={[s.logLine, s.mono]} numberOfLines={2}>
              {line}
            </Text>
          ))
        )}

        <Pressable
          style={s.danger}
          onPress={async () => {
            await unregisterBackgroundSync().catch(() => {})
            await clearCredentials()
            onUnpair()
          }}
        >
          <Text style={s.dangerText}>Unpair this device</Text>
        </Pressable>
        <Text style={s.hint}>Local files stay put. Revoke the token from the web app too.</Text>
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0a0a0a" },
  center: { alignItems: "center", justifyContent: "center" },
  pad: { padding: 24, paddingTop: 72, gap: 4 },
  h1: { color: "#e5e5e5", fontSize: 28, fontWeight: "700", marginBottom: 6 },
  muted: { color: "#a3a3a3", fontSize: 14, lineHeight: 20, marginBottom: 12 },
  strong: { color: "#e5e5e5", fontWeight: "600" },
  label: { color: "#e5e5e5", fontSize: 13, fontWeight: "600", marginTop: 20, marginBottom: 6 },
  hint: { color: "#737373", fontSize: 12, marginTop: 8, lineHeight: 17 },
  error: { color: "#f87171", fontSize: 13, marginTop: 12 },
  input: {
    backgroundColor: "#111", borderColor: "#262626", borderWidth: 1, borderRadius: 10,
    color: "#e5e5e5", paddingHorizontal: 12, paddingVertical: 11, fontSize: 15,
  },
  mono: { fontFamily: "monospace" },
  path: {
    color: "#737373", fontSize: 11, fontFamily: "monospace", backgroundColor: "#111",
    borderRadius: 8, padding: 10, marginBottom: 20,
  },
  primary: {
    backgroundColor: "#e5e5e5", borderRadius: 10, paddingVertical: 14,
    alignItems: "center", marginTop: 24, minHeight: 48, justifyContent: "center",
  },
  primaryText: { color: "#0a0a0a", fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.6 },
  secondary: {
    borderColor: "#262626", borderWidth: 1, borderRadius: 10, paddingVertical: 12,
    alignItems: "center", marginTop: 16,
  },
  secondaryText: { color: "#e5e5e5", fontSize: 14, fontWeight: "600" },
  danger: {
    borderColor: "#3f1d1d", borderWidth: 1, borderRadius: 10, paddingVertical: 12,
    alignItems: "center", marginTop: 40,
  },
  dangerText: { color: "#f87171", fontSize: 14, fontWeight: "600" },
  logLine: { color: "#a3a3a3", fontSize: 12, paddingVertical: 3 },
})
