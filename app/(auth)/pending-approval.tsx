import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Colors } from "../../constants/colors";
import { router } from "expo-router";

export default function PendingApprovalScreen() {
  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <Text style={styles.icon}>⏳</Text>
        <Text style={styles.title}>Account Pending Approval</Text>
        <Text style={styles.message}>
          Your account has been created but is waiting for admin approval.
          You'll be notified once your account is activated.
        </Text>
        <Button
          title="Back to Sign In"
          variant="outline"
          onPress={() => router.replace("/(auth)/login")}
          style={styles.button}
        />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
    padding: 24,
  },
  card: {
    maxWidth: 400,
    width: "100%",
    alignItems: "center",
  },
  icon: { fontSize: 64, marginBottom: 16 },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.text,
    textAlign: "center",
    marginBottom: 12,
  },
  message: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  button: { width: "100%" },
});
