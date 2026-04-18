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
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Card } from "../../components/ui/Card";
import { Colors } from "../../constants/colors";
import { authClient } from "../../lib/auth-client";

export default function SignupScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!name || !email || !password) {
      setError("All fields are required");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { error: authError } = await authClient.signUp.email({
        email,
        password,
        name,
      });
      if (authError) {
        setError(authError.message ?? "Signup failed");
        return;
      }
      router.replace("/(app)/(tabs)");
    } catch (e: any) {
      setError(e.message ?? "Signup failed");
    } finally {
      setLoading(false);
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
        </View>

        <Card style={styles.card}>
          <Text style={styles.title}>Create Account</Text>

          <Input
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Your name"
          />
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
            placeholder="Create a password (min 8 chars)"
            secureTextEntry
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            title="Sign Up"
            onPress={handleSignup}
            loading={loading}
            style={styles.button}
          />

          <Link href="/(auth)/login" asChild>
            <TouchableOpacity style={styles.linkContainer}>
              <Text style={styles.link}>Already have an account? Sign In</Text>
            </TouchableOpacity>
          </Link>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  header: { alignItems: "center", marginBottom: 32 },
  logo: {
    fontSize: 36,
    fontWeight: "800",
    color: Colors.primary,
    letterSpacing: -1,
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
  button: { marginTop: 8 },
  linkContainer: { alignItems: "center", marginTop: 20 },
  link: { color: Colors.primary, fontSize: 14, fontWeight: "500" },
});
