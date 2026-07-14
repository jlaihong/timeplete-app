import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Link, router } from "expo-router";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Card } from "../../components/ui/Card";
import { Colors } from "../../constants/colors";
import { authClient } from "../../lib/auth-client";

type Step = "email" | "reset";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<Step>("email");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRequestReset = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Please enter your email");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { error: authError } = await authClient.emailOtp.requestPasswordReset({
        email: normalizedEmail,
      });
      if (authError) {
        setError(authError.message ?? "Failed to send reset code");
        return;
      }
      setEmail(normalizedEmail);
      setStep("reset");
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Failed to send reset code";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!otp || otp.length < 6) {
      setError("Enter the 6-digit code from your email");
      return;
    }
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { error: authError } = await authClient.emailOtp.resetPassword({
        email,
        otp: otp.trim(),
        password,
      });
      if (authError) {
        setError(authError.message ?? "Failed to reset password");
        return;
      }

      const { error: signInError } = await authClient.signIn.email({
        email,
        password,
      });
      if (signInError) {
        setError(
          "Password updated, but sign-in failed. Please sign in with your new password.",
        );
        router.replace({
          pathname: "/(auth)/login",
          params: { email },
        });
        return;
      }

      router.replace("/(app)/(tabs)");
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Failed to reset password";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (step === "reset") {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <KeyboardAwareScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          bottomOffset={80}
        >
          <Card style={styles.card}>
            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>
              Enter the 6-digit code sent to {email}, then choose a new password.
            </Text>

            <Input
              label="Verification code"
              value={otp}
              onChangeText={(value) =>
                setOtp(value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="123456"
              keyboardType="number-pad"
              autoCapitalize="none"
              maxLength={6}
            />
            <Input
              label="New password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              secureTextEntry
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button
              title="Update Password"
              onPress={handleResetPassword}
              loading={loading}
            />

            <Link href="/(auth)/login" asChild>
              <TouchableOpacity style={styles.backLink}>
                <Text style={styles.link}>Back to Sign In</Text>
              </TouchableOpacity>
            </Link>
          </Card>
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        bottomOffset={80}
      >
        <Card style={styles.card}>
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>
            Enter your email address and we'll send you a 6-digit code to reset
            your password.
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
            title="Send Reset Code"
            onPress={handleRequestReset}
            loading={loading}
          />

          <Link href="/(auth)/login" asChild>
            <TouchableOpacity style={styles.backLink}>
              <Text style={styles.link}>Back to Sign In</Text>
            </TouchableOpacity>
          </Link>
        </Card>
      </KeyboardAwareScrollView>
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
  error: {
    color: Colors.error,
    fontSize: 14,
    marginBottom: 16,
    textAlign: "center",
  },
  backLink: { alignItems: "center", marginTop: 20 },
  link: { color: Colors.primary, fontSize: 14, fontWeight: "500" },
});
