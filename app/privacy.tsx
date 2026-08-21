import React from "react";
import { ScrollView, Text, StyleSheet, View, Platform } from "react-native";
import { Link } from "expo-router";
import { Colors } from "../constants/colors";

export default function PrivacyPolicy() {
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.kicker}>Timeplete</Text>
      <Text style={styles.title}>Privacy Policy</Text>
      <Text style={styles.meta}>Last updated: August 20, 2026</Text>

      <Section title="Who we are">
        Timeplete is a personal productivity app for tasks, time tracking,
        goals, calendar, reviews, and analytics. This policy describes how we
        handle information when you use the Timeplete iOS, Android, or web apps
        at timeplete.com.
      </Section>

      <Section title="Information we collect">
        Account: email address, name, and authentication credentials (including
        one-time email codes we send to verify your account).{"\n\n"}
        Content you create: tasks, lists, tags, calendar events, timers, goals,
        reviews, and sharing invitations.{"\n\n"}
        Device: timezone and, if you allow notifications, a push token used to
        deliver timer reminders.{"\n\n"}
        We do not sell your personal information. We do not use your data for
        third-party advertising.
      </Section>

      <Section title="How we use it">
        We use this information to provide the product: sign-in, syncing your
        data across devices, sharing lists or goals you choose to share,
        sending account emails, and optional timer notifications.
      </Section>

      <Section title="Where it is stored">
        App data is stored on Convex cloud infrastructure. Account emails are
        sent through Resend. Push notifications, when enabled, are delivered
        through Apple Push Notification service or Expo.
      </Section>

      <Section title="Sharing">
        We share data only with infrastructure providers needed to run the
        service, or when you invite another Timeplete user to a list or goal.
        We may disclose information if required by law.
      </Section>

      <Section title="Retention and deletion">
        We keep your account and content until you delete them or request
        deletion. You can ask us to delete your account by emailing the
        address below.
      </Section>

      <Section title="Contact">
        Privacy questions: hello@timeplete.com{"\n"}
        Website: https://www.timeplete.com
      </Section>

      {Platform.OS === "web" ? (
        <Link href="/landing" style={styles.back}>
          Back to Timeplete
        </Link>
      ) : (
        <View />
      )}
    </ScrollView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      <Text style={styles.body}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24, paddingBottom: 64, maxWidth: 720, width: "100%" },
  kicker: { color: Colors.primary, fontSize: 13, fontWeight: "600", marginBottom: 8 },
  title: { color: Colors.text, fontSize: 28, fontWeight: "700", marginBottom: 8 },
  meta: { color: Colors.textTertiary, fontSize: 13, marginBottom: 28 },
  section: { marginBottom: 24 },
  heading: { color: Colors.text, fontSize: 18, fontWeight: "600", marginBottom: 8 },
  body: { color: Colors.textSecondary, fontSize: 15, lineHeight: 22 },
  back: { marginTop: 12, color: Colors.primary, fontSize: 15 },
});
