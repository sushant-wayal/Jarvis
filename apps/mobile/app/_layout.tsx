import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function RootLayout() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: '#38BDF8',
          tabBarInactiveTintColor: '#64748B',
          tabBarLabelStyle: styles.tabLabel,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Jarvis Voice',
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>🎙️</Text>,
          }}
        />
        <Tabs.Screen
          name="conversation"
          options={{
            title: 'History',
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>💬</Text>,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>⚙️</Text>,
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0D14',
  },
  tabBar: {
    backgroundColor: '#0F172A',
    borderTopColor: '#1E293B',
    height: 60,
    paddingBottom: 8,
    paddingTop: 6,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
});
