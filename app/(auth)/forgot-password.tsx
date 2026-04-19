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
import { Link } from "expo-router";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Card } from "../../components/ui/Card";
import { Colors } from "../../constants/colors";
import { authClient } from "../../lib/auth-client";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "sent">("email");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRequestReset = async () => {
    if (!email) {
      setError("Please enter your email");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { error: authError } = await authClient.forgetPassword({
        email,
        redirectTo: "/(auth)/login",
      });
      if (authError) {
        setError(authError.message ?? "Failed to send reset email");
        return;
      }
      setStep("sent");
    } catch (e: any) {
      setError(
        e.message ??
          "Password reset requires an email sender (e.g. Resend) to be configured."
      );
    } finally {
      setLoading(false);
    }
  };

  if (step === "sent") {
    return (
      <View style={[styles.container, styles.center]}>
        <Card style={styles.card}>
          <Text style={styles.title}>Check Your Email</Text>
          <Text style={styles.subtitle}>
            If an account exists for {email}, a password reset link has been
            sent. Check your inbox and follow the link to reset your password.
          </Text>
          <Text style={styles.note}>
            Note: If you haven't configured an email sender (e.g. Resend),
            the email won't be delivered. This can be set up later.
          </Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity style={styles.backLink}>
              <Text style={styles.link}>Back to Sign In</Text>
            </TouchableOpacity>
          </Link>
        </Card>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Card style={styles.card}>
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>
            Enter your email address and we'll send you a link to reset your
            password.
          </Text>

          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            title="Send Reset Link"
            onPress={handleRequestReset}
            loading={loading}
          />

          <Link href="/(auth)/login" asChild>
            <TouchableOpacity style={styles.backLink}>
              <Text style={styles.link}>Back to Sign In</Text>
            </TouchableOpacity>
          </Link>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { justifyContent: "center", alignItems: "center", padding: 24 },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  card: { maxWidth: 400, width: "100%", alignSelf: "center" },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 20,
  },
  note: {
    fontSize: 13,
    color: Colors.textTertiary,
    fontStyle: "italic",
    marginBottom: 20,
  },
  error: {
    color: Colors.error,
    fontSize: 14,
    marginBottom: 16,
    textAlign: "center",
  },
  backLink: { alignItems: "center", marginTop: 20 },
  link: { color: Colors.primary, fontSize: 14, fontWeight: "500" },
});
