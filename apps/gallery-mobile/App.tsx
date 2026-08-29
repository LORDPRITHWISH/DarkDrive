import { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  AppState,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native"
import { StatusBar } from "expo-status-bar"
import { getPermissionsAsync, requestPermissionsAsync } from "expo-media-library"
import { registerBackgroundBackup, unregisterBackgroundBackup } from "./src/background"
import { backupOnce, countPending } from "./src/backup"
import { api, apiBase, authHeaders, configure } from "./src/api"
import {
  clearCredentials,
  loadCredentials,
  loadLedger,
  saveCredentials,
  saveLedger,
  type Credentials,
} from "./src/state"

const ACCENT = "#f0a02a"

export default function App() {
  const [creds, setCreds] = useState<Credentials | null | undefined>(undefined)

  useEffect(() => {
    loadCredentials().then((c) => {
      if (c) configure(c.apiUrl, c.token)
      setCreds(c)
    })
  }, [])

  if (creds === undefined) {
    return (
      <View style={[s.screen, s.center]}>
        <ActivityIndicator color={ACCENT} />
      </View>
    )
  }
  return creds ? (
    <Home onUnpair={() => setCreds(null)} />
  ) : (
    <Pair
      onPaired={(c) => {
        configure(c.apiUrl, c.token)
        setCreds(c)
      }}
    />
  )
}

// --- pairing ---------------------------------------------------------------

function Pair({ onPaired }: { onPaired: (c: Credentials) => void }) {
  const [apiUrl, setApiUrl] = useState("https://api.darkdrive.zenux.live")
  const [token, setToken] = useState("")
  const [error, setError] = useState("")

  const submit = async () => {
    const url = apiUrl.trim().replace(/\/+$/, "")
    if (!token.trim().startsWith("dd_")) return setError("That doesn't look like a device token.")
    const c = { apiUrl: url, token: token.trim() }
    await saveCredentials(c)
    onPaired(c)
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <StatusBar style="light" />
      <Text style={s.h1}>
        Dark<Text style={{ color: ACCENT }}>Gallery</Text>
      </Text>
      <Text style={s.muted}>
        Your camera roll, backed up to your own DarkDrive. Same account, same storage — kept
        under My Photos rather than in your files.
      </Text>

      <Text style={s.label}>Server</Text>
      <TextInput
        style={s.input}
        value={apiUrl}
        onChangeText={setApiUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://api.example.com"
        placeholderTextColor="#525252"
      />

      <Pressable
        style={s.secondary}
        onPress={() => Linking.openURL(`${apiUrl.trim().replace(/\/+$/, "")}/api/devices/pair`)}
      >
        <Text style={s.secondaryText}>Open pairing page in browser</Text>
      </Pressable>
      <Text style={s.hint}>
        Sign in there, create a token, then paste it below. It is shown only once. A token
        minted for DarkDrive works here too — it's the same account.
      </Text>

      <Text style={s.label}>Device token</Text>
      <TextInput
        style={[s.input, s.mono]}
        value={token}
        onChangeText={(t) => {
          setToken(t)
          setError("")
        }}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        placeholder="dd_..."
        placeholderTextColor="#525252"
      />

      {!!error && <Text style={s.error}>{error}</Text>}

      <Pressable style={s.primary} onPress={submit}>
        <Text style={s.primaryText}>Pair device</Text>
      </Pressable>
    </ScrollView>
  )
}

// --- library ---------------------------------------------------------------

type Item = { id: string; name: string; at: string; mimeType: string }

const COLUMNS = 3
const GAP = 2

function Home({ onUnpair }: { onUnpair: () => void }) {
  const [tab, setTab] = useState<"library" | "backup">("library")
  return (
    <View style={s.screen}>
      <StatusBar style="light" />
      <View style={s.header}>
        <Text style={s.brand}>
          Dark<Text style={{ color: ACCENT }}>Gallery</Text>
        </Text>
      </View>

      <View style={{ flex: 1 }}>
        {tab === "library" ? <Library /> : <Backup onUnpair={onUnpair} />}
      </View>

      <View style={s.tabs}>
        {(["library", "backup"] as const).map((t) => (
          <Pressable key={t} style={s.tab} onPress={() => setTab(t)}>
            <Text style={[s.tabText, tab === t && { color: ACCENT }]}>
              {t === "library" ? "Photos" : "Backup"}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

function Library() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [viewing, setViewing] = useState<Item | null>(null)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api<{ items: Item[] }>("GET", "/api/gallery/timeline?limit=200")
      setItems(res.items)
      setError("")
    } catch (e: any) {
      setError(e?.message ?? "Couldn't load your library")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const size = (Dimensions.get("window").width - GAP * (COLUMNS - 1)) / COLUMNS

  if (loading && !items.length) {
    return (
      <View style={[s.screen, s.center]}>
        <ActivityIndicator color={ACCENT} />
      </View>
    )
  }

  return (
    <>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        numColumns={COLUMNS}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ gap: GAP }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={ACCENT} />
        }
        ListEmptyComponent={
          <View style={s.pad}>
            <Text style={s.muted}>
              {error || "Nothing backed up yet. Turn on backup in the Backup tab."}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => setViewing(item)}>
            <Image
              source={{
                uri: `${apiBase()}/api/files/${item.id}/thumbnail`,
                headers: authHeaders(),
              }}
              style={{ width: size, height: size, backgroundColor: "#141414" }}
            />
          </Pressable>
        )}
      />

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={s.viewer} onPress={() => setViewing(null)}>
          {viewing && (
            <Image
              source={{
                uri: `${apiBase()}/api/files/${viewing.id}/download?inline=1`,
                headers: authHeaders(),
              }}
              style={{ width: "100%", height: "80%" }}
              resizeMode="contain"
            />
          )}
          <Text style={s.hint}>{viewing?.name}</Text>
        </Pressable>
      </Modal>
    </>
  )
}

// --- backup ----------------------------------------------------------------

function Backup({ onUnpair }: { onUnpair: () => void }) {
  const [auto, setAuto] = useState(() => loadLedger().autoBackup)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<number | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [uploaded, setUploaded] = useState(() => loadLedger().uploaded)
  const [permission, setPermission] = useState<boolean | null>(null)
  const busyRef = useRef(false)

  const refreshCounts = useCallback(async () => {
    setPending(await countPending().catch(() => 0))
    setUploaded(loadLedger().uploaded)
  }, [])

  const run = useCallback(
    async (limit?: number) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy(true)
      const lines: string[] = []
      try {
        await backupOnce((line) => lines.push(line), limit)
      } catch (e: any) {
        lines.push(`! ${e?.message ?? "backup failed"}`)
      } finally {
        setLog((prev) => [...lines, ...prev].slice(0, 100))
        busyRef.current = false
        setBusy(false)
        void refreshCounts()
      }
    },
    [refreshCounts]
  )

  useEffect(() => {
    getPermissionsAsync().then((p) => setPermission(p.granted))
    void refreshCounts()
    // iOS may run the background task rarely or never, so a foreground is the
    // reliable trigger — this is what makes the app feel current when opened.
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active" && loadLedger().autoBackup) void run()
    })
    return () => sub.remove()
  }, [run, refreshCounts])

  const askPermission = async () => {
    const p = await requestPermissionsAsync()
    setPermission(p.granted)
    if (p.granted) {
      await registerBackgroundBackup().catch(() => {})
      void run()
    }
  }

  return (
    <ScrollView contentContainerStyle={s.pad}>
      <Text style={s.h2}>Backup</Text>

      {permission === false && (
        <>
          <Text style={s.muted}>
            DarkGallery needs access to your photo library to back it up. Nothing is ever
            deleted or changed on this device — photos are only copied up.
          </Text>
          <Pressable style={s.primary} onPress={askPermission}>
            <Text style={s.primaryText}>Allow photo access</Text>
          </Pressable>
        </>
      )}

      <View style={s.row}>
        <Text style={s.rowLabel}>Back up automatically</Text>
        <Switch
          value={auto}
          trackColor={{ true: ACCENT, false: "#333" }}
          onValueChange={async (v) => {
            setAuto(v)
            const ledger = loadLedger()
            ledger.autoBackup = v
            saveLedger(ledger)
            if (v) {
              await registerBackgroundBackup().catch(() => {})
              void run()
            } else {
              await unregisterBackgroundBackup().catch(() => {})
            }
          }}
        />
      </View>
      <Text style={s.hint}>
        The OS decides how often background work actually runs, so backup also happens every
        time you open the app.
      </Text>

      <View style={s.stats}>
        <Stat label="Backed up" value={String(uploaded)} />
        <Stat label="Waiting" value={pending === null ? "—" : String(pending)} />
      </View>

      <Pressable style={[s.primary, busy && s.disabled]} disabled={busy} onPress={() => run(500)}>
        {busy ? (
          <ActivityIndicator color="#0a0a0a" />
        ) : (
          <Text style={s.primaryText}>Back up now</Text>
        )}
      </Pressable>

      <Pressable
        style={s.secondary}
        onPress={() => {
          // Clears the "we've seen the whole library" mark so the next pass
          // walks all the way down instead of stopping at known photos —
          // that's what finds old images added after the fact.
          const ledger = loadLedger()
          ledger.scanned = false
          saveLedger(ledger)
          void run(500)
        }}
      >
        <Text style={s.secondaryText}>Rescan library</Text>
      </Pressable>
      <Text style={s.hint}>
        Use this after importing older photos — an AirDrop or a restored backup lands below
        the point a normal pass stops at.
      </Text>

      <Text style={s.label}>Recent activity</Text>
      {log.length === 0 ? (
        <Text style={s.hint}>Nothing yet.</Text>
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
          await unregisterBackgroundBackup().catch(() => {})
          await clearCredentials()
          onUnpair()
        }}
      >
        <Text style={s.dangerText}>Unpair this device</Text>
      </Pressable>
      <Text style={s.hint}>
        Your photos stay on the server and on this phone. Revoke the token from the web app
        too if the device is gone.
      </Text>
    </ScrollView>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0a0a0a" },
  center: { alignItems: "center", justifyContent: "center" },
  pad: { padding: 24, gap: 4, paddingBottom: 60 },
  header: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12 },
  brand: { color: "#e5e5e5", fontSize: 20, fontWeight: "700", letterSpacing: -0.4 },
  h1: { color: "#e5e5e5", fontSize: 28, fontWeight: "700", marginBottom: 6, marginTop: 48 },
  h2: { color: "#e5e5e5", fontSize: 22, fontWeight: "700", marginBottom: 10 },
  muted: { color: "#a3a3a3", fontSize: 14, lineHeight: 20, marginBottom: 12 },
  label: { color: "#e5e5e5", fontSize: 13, fontWeight: "600", marginTop: 22, marginBottom: 6 },
  hint: { color: "#737373", fontSize: 12, marginTop: 8, lineHeight: 17 },
  error: { color: "#f87171", fontSize: 13, marginTop: 12 },
  input: {
    backgroundColor: "#111", borderColor: "#262626", borderWidth: 1, borderRadius: 10,
    color: "#e5e5e5", paddingHorizontal: 12, paddingVertical: 11, fontSize: 15,
  },
  mono: { fontFamily: "monospace" },
  primary: {
    backgroundColor: ACCENT, borderRadius: 10, paddingVertical: 14,
    alignItems: "center", marginTop: 22, minHeight: 48, justifyContent: "center",
  },
  primaryText: { color: "#1a1206", fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.6 },
  secondary: {
    borderColor: "#262626", borderWidth: 1, borderRadius: 10, paddingVertical: 12,
    alignItems: "center", marginTop: 14,
  },
  secondaryText: { color: "#e5e5e5", fontSize: 14, fontWeight: "600" },
  danger: {
    borderColor: "#3f1d1d", borderWidth: 1, borderRadius: 10, paddingVertical: 12,
    alignItems: "center", marginTop: 40,
  },
  dangerText: { color: "#f87171", fontSize: 14, fontWeight: "600" },
  logLine: { color: "#a3a3a3", fontSize: 12, paddingVertical: 3 },
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: 18,
  },
  rowLabel: { color: "#e5e5e5", fontSize: 15 },
  stats: { flexDirection: "row", gap: 12, marginTop: 20 },
  stat: {
    flex: 1, backgroundColor: "#111", borderRadius: 12, padding: 14,
    borderColor: "#1f1f1f", borderWidth: 1,
  },
  statValue: { color: "#e5e5e5", fontSize: 24, fontWeight: "700" },
  statLabel: { color: "#737373", fontSize: 12, marginTop: 2 },
  tabs: {
    flexDirection: "row", borderTopColor: "#1f1f1f", borderTopWidth: 1,
    paddingBottom: 24, paddingTop: 10,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 6 },
  tabText: { color: "#737373", fontSize: 14, fontWeight: "600" },
  viewer: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
})
