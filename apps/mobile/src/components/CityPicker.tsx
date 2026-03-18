import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import BRAND from "@/constants/colors";

type CityResult = {
  id: string;
  city: string;
  country: string;
  displayName: string;
};

type Props = {
  value: string;
  onChange: (displayName: string) => void;
  placeholder?: string;
  defaultOpen?: boolean;
  onCancel?: () => void;
};

export function CityPicker({
  value,
  onChange,
  placeholder = "Search for your city…",
  defaultOpen = false,
  onCancel,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CityResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=10&addressdetails=1`;
        const resp = await fetch(url, {
          headers: { "User-Agent": "Ollia/1.0", "Accept-Language": "en" },
        });
        if (!resp.ok) throw new Error("search failed");
        const data = await resp.json() as Array<{
          place_id: string;
          address: {
            city?: string;
            town?: string;
            village?: string;
            municipality?: string;
            county?: string;
            state?: string;
            country?: string;
          };
        }>;
        const seen = new Set<string>();
        const mapped: CityResult[] = [];
        for (const r of data) {
          const addr = r.address;
          const city =
            addr.city ?? addr.town ?? addr.village ??
            addr.municipality ?? addr.county ?? addr.state ?? "";
          const country = addr.country ?? "";
          if (!city || !country) continue;
          const key = `${city.toLowerCase()},${country.toLowerCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          mapped.push({ id: r.place_id, city, country, displayName: `${city}, ${country}` });
        }
        setResults(mapped.slice(0, 6));
        setSearched(true);
      } catch {
        setResults([]);
        setSearched(true);
      } finally {
        setLoading(false);
      }
    }, 380);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, open]);

  function handleSelect(r: CityResult) {
    onChange(r.displayName);
    setOpen(false);
    setQuery("");
    setResults([]);
    setSearched(false);
  }

  function handleOpen() {
    setOpen(true);
    setQuery("");
    setResults([]);
    setSearched(false);
  }

  if (!open) {
    return (
      <Pressable style={styles.trigger} onPress={handleOpen}>
        <Feather name="map-pin" size={16} color={value ? BRAND.primary : BRAND.textMuted} />
        <Text style={[styles.triggerText, !value && styles.triggerPlaceholder]} numberOfLines={1}>
          {value || "Choose your city…"}
        </Text>
        <Feather name="chevron-down" size={15} color={BRAND.textMuted} />
      </Pressable>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.inputRow}>
        <Feather name="search" size={15} color={BRAND.textMuted} />
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={BRAND.textMuted}
          value={query}
          onChangeText={setQuery}
          autoFocus
          autoCorrect={false}
          autoCapitalize="words"
        />
        {loading ? <ActivityIndicator size="small" color={BRAND.primary} /> : null}
        <Pressable
          onPress={() => {
            setOpen(false);
            if (onCancel) onCancel();
          }}
          style={styles.cancelBtn}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>

      {results.length > 0 && (
        <View>
          {results.map((r, i) => (
            <Pressable
              key={r.id}
              style={[styles.resultRow, i < results.length - 1 && styles.resultBorder]}
              onPress={() => handleSelect(r)}
            >
              <Feather name="map-pin" size={13} color={BRAND.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.resultCity}>{r.city}</Text>
                <Text style={styles.resultCountry}>{r.country}</Text>
              </View>
              <Feather name="chevron-right" size={13} color={BRAND.border} />
            </Pressable>
          ))}
        </View>
      )}

      {searched && results.length === 0 && !loading && (
        <View style={styles.emptyRow}>
          <Text style={styles.emptyText}>No cities found — try a different spelling.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: BRAND.backgroundCard,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: BRAND.borderLight,
    marginBottom: 4,
  },
  triggerText: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: BRAND.text,
  },
  triggerPlaceholder: {
    color: BRAND.textMuted,
  },
  panel: {
    backgroundColor: BRAND.backgroundCard,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BRAND.primary,
    marginBottom: 4,
    overflow: "hidden",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.borderLight,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: BRAND.text,
  },
  cancelBtn: { paddingLeft: 4 },
  cancelText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: BRAND.primary,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  resultBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BRAND.borderLight,
  },
  resultCity: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: BRAND.text,
  },
  resultCountry: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
    marginTop: 1,
  },
  emptyRow: { paddingHorizontal: 14, paddingVertical: 16 },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: BRAND.textMuted,
    textAlign: "center",
  },
});
