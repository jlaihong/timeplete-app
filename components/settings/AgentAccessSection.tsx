import { FontSize } from "../../theme/tokens";
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
} from "react-native";
import { useMutation, useQuery } from "convex/react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Card } from "../../components/ui/Card";
import { useAuth } from "../../hooks/useAuth";
import { getExpoPublicConvexSiteUrl } from "../../lib/convexEnv";
import {
  AGENT_ACTIONS,
  isAgentAction,
  type AgentActionName,
} from "../../lib/agentActions";

type CreatedKey = {
  apiKey: string;
  name: string;
};

function endpointUrl(): string {
  const site = getExpoPublicConvexSiteUrl()?.replace(/\/$/, "");
  return `${site || "https://<your-deployment>.convex.site"}/api/agent`;
}

function agentInstructions(
  endpoint: string,
  apiKey: string,
  label: string,
): string {
  return [
    `You can manage my Timeplete account on ${label}.`,
    "This key does not work on the other environment.",
    `API key: ${apiKey}`,
    `Endpoint: ${endpoint}`,
    "Authorize every request with header: Authorization: Bearer <api key>",
    "GET the endpoint to list the actions this key allows and the input each one takes.",
    'POST JSON: {"action":"<action name>","input":{...}}',
    "Only call actions the key allows.",
  ].join("\n");
}

async function copyText(value: string): Promise<boolean> {
  if (
    Platform.OS === "web" &&
    typeof navigator !== "undefined" &&
    navigator.clipboard
  ) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function formatStamp(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function scopeLabels(scopes: readonly string[]): string {
  return scopes
    .map(
      (scope) =>
        AGENT_ACTIONS.find((action) => action.name === scope)?.label ?? scope,
    )
    .join(", ");
}

/**
 * API keys for AI agents: create one, choose what it may do, revoke it.
 * A section of the Settings page.
 */
export function AgentAccessSection() {
  const { profileReady } = useAuth();
  const backend = useQuery(api.apiKeys.environment);
  const keys = useQuery(api.apiKeys.list, profileReady ? {} : "skip");
  const createKey = useMutation(api.apiKeys.create);
  const updateKeyScopes = useMutation(api.apiKeys.updateScopes);
  const revokeKey = useMutation(api.apiKeys.revoke);

  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<AgentActionName[]>([]);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedKey | null>(null);
  const [copied, setCopied] = useState<"key" | "instructions" | null>(null);
  const [editingId, setEditingId] = useState<Id<"apiKeys"> | null>(null);
  const [editScopes, setEditScopes] = useState<AgentActionName[]>([]);
  const [savingScopes, setSavingScopes] = useState(false);
  const [scopeError, setScopeError] = useState<string | null>(null);

  const endpoint = endpointUrl();
  const isProduction = backend?.environment === "production";
  const environmentLabel = backend?.label ?? "Localhost";
  const storeName = backend?.storeName ?? "timeplete-agent-localhost";
  const activeKeys = keys?.filter((key) => key.revokedAt === null) ?? [];
  const revokedKeys = keys?.filter((key) => key.revokedAt !== null) ?? [];

  const toggleScope = (action: AgentActionName) => {
    setScopes((current) =>
      current.includes(action)
        ? current.filter((item) => item !== action)
        : [...current, action],
    );
  };

  const handleCreate = async () => {
    setFormError(null);
    setCopied(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Name the key so you can tell agents apart.");
      return;
    }
    if (scopes.length === 0) {
      setFormError("Choose at least one action.");
      return;
    }
    setCreating(true);
    try {
      const result = await createKey({ name: trimmed, scopes });
      setCreated({ apiKey: result.apiKey, name: result.name });
      setName("");
      setScopes([]);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not create the key.",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (which: "key" | "instructions") => {
    if (!created) return;
    const value =
      which === "key"
        ? created.apiKey
        : agentInstructions(endpoint, created.apiKey, environmentLabel);
    const didCopy = await copyText(value);
    if (didCopy) setCopied(which);
  };

  const startEditing = (
    id: Id<"apiKeys">,
    current: readonly string[],
  ) => {
    setScopeError(null);
    setEditingId(id);
    setEditScopes(current.filter(isAgentAction));
  };

  const toggleEditScope = (action: AgentActionName) => {
    setEditScopes((current) =>
      current.includes(action)
        ? current.filter((item) => item !== action)
        : [...current, action],
    );
  };

  const handleSaveScopes = async (id: Id<"apiKeys">) => {
    if (editScopes.length === 0) {
      setScopeError("Choose at least one action.");
      return;
    }
    setSavingScopes(true);
    setScopeError(null);
    try {
      await updateKeyScopes({ id, scopes: editScopes });
      setEditingId(null);
    } catch (error) {
      setScopeError(
        error instanceof Error ? error.message : "Could not update the key.",
      );
    } finally {
      setSavingScopes(false);
    }
  };

  const handleRevoke = (id: Id<"apiKeys">, keyName: string) => {
    const run = () => {
      void revokeKey({ id });
    };
    const message = `Revoke "${keyName}"? Agents using it will stop working.`;
    if (Platform.OS === "web") {
      if (window.confirm(message)) run();
      return;
    }
    Alert.alert("Revoke API key", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Revoke", style: "destructive", onPress: run },
    ]);
  };

  return (
    <View style={styles.section}>
        <Text style={styles.environment}>{environmentLabel}</Text>
        <Text style={styles.intro}>
          {isProduction
            ? "Keys created here are for production. They do not work against localhost. Create a separate key from the localhost app when you want an agent to change local data."
            : "Keys created here are for localhost. They only work with the development backend this app is using, and they do not work in production. Create a separate key from the production app when you want that."}{" "}
          The agent can only use the actions you check. To keep the key out of
          chat, save it in Keychain as {storeName}.
        </Text>
        <Text style={styles.endpoint} selectable>
          {endpoint}
        </Text>

        {created ? (
          <Card style={styles.secretCard}>
            <Text style={styles.secretTitle}>
              Key for {created.name}
            </Text>
            <Text style={styles.secretHint}>
              This is the only time this key is shown. It works on{" "}
              {environmentLabel.toLowerCase()} only. Save it in Keychain as{" "}
              {storeName}.
            </Text>
            <Text style={styles.secretValue} selectable>
              {created.apiKey}
            </Text>
            <View style={styles.secretActions}>
              <Button
                title={copied === "instructions" ? "Copied" : "Copy instructions"}
                size="small"
                onPress={() => void handleCopy("instructions")}
                style={styles.actionButton}
              />
              <Button
                title={copied === "key" ? "Copied" : "Copy key"}
                size="small"
                variant="outline"
                onPress={() => void handleCopy("key")}
                style={styles.actionButton}
              />
              <Button
                title="Dismiss"
                size="small"
                variant="ghost"
                onPress={() => {
                  setCreated(null);
                  setCopied(null);
                }}
                style={styles.actionButton}
              />
            </View>
          </Card>
        ) : null}

        <Card style={styles.formCard}>
          <Input
            label="Key name"
            value={name}
            onChangeText={setName}
            placeholder="Claude, Cursor, shortcut"
            autoCapitalize="words"
          />
          <Text style={styles.fieldLabel}>Actions this key can use</Text>
          {AGENT_ACTIONS.map((action) => {
            const checked = scopes.includes(action.name);
            return (
              <TouchableOpacity
                key={action.name}
                style={styles.scopeRow}
                onPress={() => toggleScope(action.name)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
              >
                <Ionicons
                  name={checked ? "checkbox" : "square-outline"}
                  size={22}
                  color={checked ? Colors.primary : Colors.textTertiary}
                />
                <View style={styles.scopeCopy}>
                  <Text style={styles.scopeLabel}>{action.label}</Text>
                  <Text style={styles.scopeDescription}>
                    {action.description}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
          {formError ? <Text style={styles.formError}>{formError}</Text> : null}
          <Button
            title={
              isProduction ? "Create production key" : "Create localhost key"
            }
            onPress={() => void handleCreate()}
            loading={creating}
            disabled={creating}
            style={styles.createButton}
          />
        </Card>

        <Text style={styles.sectionTitle}>Active keys</Text>
        {keys === undefined ? (
          <Text style={styles.muted}>Loading keys...</Text>
        ) : activeKeys.length === 0 ? (
          <Text style={styles.muted}>No API keys yet.</Text>
        ) : (
          activeKeys.map((key) => (
            <Card key={key._id} style={styles.keyCard}>
              <View style={styles.keyHeader}>
                <View style={styles.keyTitleBlock}>
                  <Text style={styles.keyName}>{key.name}</Text>
                  <Text style={styles.keyPrefix} selectable>
                    {key.keyPrefix}...
                  </Text>
                </View>
                <View style={styles.keyActions}>
                  <Button
                    title="Actions"
                    size="small"
                    variant="outline"
                    onPress={() => startEditing(key._id, key.scopes)}
                    style={styles.revokeButton}
                  />
                  <Button
                    title="Revoke"
                    size="small"
                    variant="danger"
                    onPress={() => handleRevoke(key._id, key.name)}
                    style={styles.revokeButton}
                  />
                </View>
              </View>
              {editingId === key._id ? (
                <View style={styles.editScopes}>
                  {AGENT_ACTIONS.map((action) => {
                    const checked = editScopes.includes(action.name);
                    return (
                      <TouchableOpacity
                        key={action.name}
                        style={styles.scopeRow}
                        onPress={() => toggleEditScope(action.name)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked }}
                      >
                        <Ionicons
                          name={checked ? "checkbox" : "square-outline"}
                          size={22}
                          color={checked ? Colors.primary : Colors.textTertiary}
                        />
                        <View style={styles.scopeCopy}>
                          <Text style={styles.scopeLabel}>{action.label}</Text>
                          <Text style={styles.scopeDescription}>
                            {action.description}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  {scopeError ? (
                    <Text style={styles.formError}>{scopeError}</Text>
                  ) : null}
                  <View style={styles.keyActions}>
                    <Button
                      title="Save actions"
                      size="small"
                      onPress={() => void handleSaveScopes(key._id)}
                      loading={savingScopes}
                      disabled={savingScopes}
                    />
                    <Button
                      title="Cancel"
                      size="small"
                      variant="ghost"
                      onPress={() => {
                        setEditingId(null);
                        setScopeError(null);
                      }}
                    />
                  </View>
                </View>
              ) : (
                <Text style={styles.keyMeta}>{scopeLabels(key.scopes)}</Text>
              )}
              <Text style={styles.keyMeta}>
                {key.lastUsedAt
                  ? `Last used ${formatStamp(key.lastUsedAt)}`
                  : "Not used yet"}
              </Text>
            </Card>
          ))
        )}

        {revokedKeys.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Revoked</Text>
            {revokedKeys.map((key) => (
              <Card key={key._id} style={styles.keyCard}>
                <Text style={styles.revokedName}>{key.name}</Text>
                <Text style={styles.keyMeta}>
                  {key.keyPrefix}...
                  {key.revokedAt
                    ? `. Revoked ${formatStamp(key.revokedAt)}`
                    : ""}
                </Text>
              </Card>
            ))}
          </>
        ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 0 },
  environment: {
    color: Colors.primary,
    fontSize: FontSize.body,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  intro: {
    color: Colors.textSecondary,
    fontSize: FontSize.body,
    lineHeight: 22,
    marginBottom: 8,
  },
  endpoint: {
    color: Colors.text,
    fontSize: FontSize.body,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
    marginBottom: 16,
  },
  secretCard: {
    marginBottom: 16,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  secretTitle: {
    color: Colors.text,
    fontSize: FontSize.bodyLarge,
    fontWeight: "700",
    marginBottom: 6,
  },
  secretHint: {
    color: Colors.textSecondary,
    fontSize: FontSize.body,
    lineHeight: 20,
    marginBottom: 10,
  },
  secretValue: {
    color: Colors.text,
    fontSize: FontSize.body,
    lineHeight: 20,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
  secretActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  actionButton: { alignSelf: "flex-start" },
  formCard: { marginBottom: 8 },
  fieldLabel: {
    color: Colors.text,
    fontSize: FontSize.body,
    fontWeight: "600",
    marginTop: 8,
    marginBottom: 8,
  },
  scopeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 8,
  },
  scopeCopy: { flex: 1 },
  scopeLabel: { color: Colors.text, fontSize: FontSize.body, fontWeight: "600" },
  scopeDescription: {
    color: Colors.textSecondary,
    fontSize: FontSize.body,
    lineHeight: 18,
    marginTop: 2,
  },
  formError: { color: Colors.error, fontSize: FontSize.body, marginTop: 8 },
  createButton: { marginTop: 16 },
  sectionTitle: {
    color: Colors.textTertiary,
    fontSize: FontSize.caption,
    fontWeight: "600",
    textTransform: "uppercase",
    marginTop: 20,
    marginBottom: 8,
  },
  muted: { color: Colors.textSecondary, fontSize: FontSize.body },
  keyCard: { marginBottom: 8 },
  keyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  keyTitleBlock: { flex: 1 },
  keyName: { color: Colors.text, fontSize: FontSize.bodyLarge, fontWeight: "600" },
  keyPrefix: {
    color: Colors.textTertiary,
    fontSize: FontSize.body,
    marginTop: 2,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
  keyActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  revokeButton: { alignSelf: "center" },
  editScopes: { marginTop: 8 },
  keyMeta: {
    color: Colors.textSecondary,
    fontSize: FontSize.body,
    lineHeight: 18,
    marginTop: 8,
  },
  revokedName: { color: Colors.textTertiary, fontSize: FontSize.body, fontWeight: "600" },
});
