import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { Link, router } from "expo-router";
import { useConvex } from "convex/react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Card } from "../../components/ui/Card";
import { Colors } from "../../constants/colors";
import { authClient } from "../../lib/auth-client";
import { api } from "../../convex/_generated/api";
import {
  authenticateAgainstCognito,
  rehashOnConvex,
} from "../../lib/cognitoMigration";

export default function LoginScreen() {
  const convex = useConvex();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Please enter both email and password");
      return;
    }
    setLoading(true);
    setError("");
    setStatusMessage("");
    const normalizedEmail = email.trim().toLowerCase();
    try {
      const { error: authError } = await authClient.signIn.email({
        email: normalizedEmail,
        password,
      });
      if (!authError) {
        router.replace("/(app)/(tabs)");
        return;
      }

      // Better Auth rejected the password. The user may be a legacy
      // Cognito user whose Better Auth account still has the
      // `MIGRATE:cognito:<email>` sentinel password. Probe Convex; if
      // they're in that state, run the SRP fallback and retry.
      const needsMigration = await convex.query(
        api.auth.needsCognitoMigration,
        { email: normalizedEmail },
      );
      if (!needsMigration) {
        setError(authError.message ?? "Invalid email or password");
        return;
      }

      setStatusMessage("Migrating your account from the previous app…");
      let cognitoIdToken: string;
      try {
        cognitoIdToken = await authenticateAgainstCognito(
          normalizedEmail,
          password,
        );
      } catch (cognitoErr) {
        const msg =
          cognitoErr instanceof Error
            ? cognitoErr.message
            : "Cognito sign-in failed";
        setError(`Old password didn't work: ${msg}`);
        return;
      }

      try {
        await rehashOnConvex(normalizedEmail, password, cognitoIdToken);
      } catch (bridgeErr) {
        const msg =
          bridgeErr instanceof Error
            ? bridgeErr.message
            : "Migration bridge failed";
        setError(`Migration failed: ${msg}`);
        return;
      }

      const { error: retryError } = await authClient.signIn.email({
        email: normalizedEmail,
        password,
      });
      if (retryError) {
        setError(retryError.message ?? "Login failed after migration");
        return;
      }
      router.replace("/(app)/(tabs)");
    } catch (e: any) {
      setError(e.message ?? "Login failed");
    } finally {
      setLoading(false);
      setStatusMessage("");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.logo}>Timeplete</Text>
          <Text style={styles.subtitle}>
            Track your time. Achieve your goals.
          </Text>
        </View>

        <Card style={styles.card}>
          <Text style={styles.title}>Sign In</Text>

          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry
            returnKeyType="go"
            onSubmitEditing={() => {
              if (loading) return;
              void handleLogin();
            }}
          />

          {statusMessage ? (
            <Text style={styles.status}>{statusMessage}</Text>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            title="Sign In"
            onPress={handleLogin}
            loading={loading}
            style={styles.button}
          />

          <View style={styles.links}>
            <Link href="/(auth)/forgot-password" asChild>
              <TouchableOpacity>
                <Text style={styles.link}>Forgot Password?</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/(auth)/signup" asChild>
              <TouchableOpacity>
                <Text style={styles.link}>Create Account</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  header: { alignItems: "center", marginBottom: 32 },
  logo: {
    fontSize: 36,
    fontWeight: "800",
    color: Colors.primary,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 8,
  },
  card: { maxWidth: 400, width: "100%", alignSelf: "center" },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 24,
  },
  error: {
    color: Colors.error,
    fontSize: 14,
    marginBottom: 16,
    textAlign: "center",
  },
  status: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginBottom: 12,
    textAlign: "center",
  },
  button: { marginTop: 8 },
  links: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
  },
  link: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: "500",
  },
});
