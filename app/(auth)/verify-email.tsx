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
import { Link, router, useLocalSearchParams } from "expo-router";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Card } from "../../components/ui/Card";
import { Colors } from "../../constants/colors";
import { authClient } from "../../lib/auth-client";
import { establishAuthSessionFromToken } from "../../lib/establishAuthSession";

export default function VerifyEmailScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const initialEmail =
    typeof params.email === "string" ? params.email.trim().toLowerCase() : "";

  const [email] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState(
    email
      ? "We sent a 6-digit code to your email. Enter it below to verify your account."
      : "",
  );
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const handleVerify = async () => {
    if (!email) {
      setError("Missing email. Please sign up again.");
      return;
    }
    if (!otp || otp.length < 6) {
      setError("Enter the 6-digit code from your email");
      return;
    }
    setLoading(true);
    setError("");
    setStatusMessage("");
    try {
      const { data, error: verifyError } = await authClient.emailOtp.verifyEmail({
        email,
        otp: otp.trim(),
      });
      if (verifyError) {
        setError(verifyError.message ?? "Invalid or expired code");
        return;
      }

      if (data?.token) {
        const sessionReady = await establishAuthSessionFromToken(data.token);
        if (sessionReady) {
          router.replace("/(app)/(tabs)");
          return;
        }
      }

      setError(
        "Email verified, but we couldn't sign you in automatically. Please sign in with your password.",
      );
      router.replace({
        pathname: "/(auth)/login",
        params: { verified: "1", email },
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Verification failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      setError("Missing email. Please sign up again.");
      return;
    }
    setResending(true);
    setError("");
    try {
      const { error: resendError } =
        await authClient.emailOtp.sendVerificationOtp({
          email,
          type: "email-verification",
        });
      if (resendError) {
        setError(resendError.message ?? "Failed to resend code");
        return;
      }
      setStatusMessage("A new code has been sent to your email.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to resend code";
      setError(message);
    } finally {
      setResending(false);
    }
  };

  if (!email) {
    return (
      <View style={[styles.container, styles.center]}>
        <Card style={styles.card}>
          <Text style={styles.title}>Verify Email</Text>
          <Text style={styles.subtitle}>
            We could not determine which email to verify. Please create your
            account again.
          </Text>
          <Link href="/(auth)/signup" asChild>
            <TouchableOpacity style={styles.backLink}>
              <Text style={styles.link}>Back to Sign Up</Text>
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
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        bottomOffset={80}
      >
        <Card style={styles.card}>
          <Text style={styles.title}>Verify Your Email</Text>
          <Text style={styles.subtitle}>
            Enter the 6-digit code we sent to {email}.
          </Text>

          <Input
            label="Verification code"
            value={otp}
            onChangeText={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            keyboardType="number-pad"
            autoCapitalize="none"
            maxLength={6}
            returnKeyType="go"
            onSubmitEditing={() => {
              if (loading) return;
              void handleVerify();
            }}
          />

          {statusMessage ? (
            <Text style={styles.status}>{statusMessage}</Text>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            title="Verify Email"
            onPress={handleVerify}
            loading={loading}
            style={styles.button}
          />

          <Button
            title="Resend Code"
            onPress={handleResend}
            loading={resending}
            variant="secondary"
            style={styles.resendButton}
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
  status: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginBottom: 12,
    textAlign: "center",
  },
  button: { marginTop: 8 },
  resendButton: { marginTop: 12 },
  backLink: { alignItems: "center", marginTop: 20 },
  link: { color: Colors.primary, fontSize: 14, fontWeight: "500" },
});
