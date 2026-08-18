import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

export default function RootLayout(): React.ReactElement {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
        <StatusBar style="light" />
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: styles.tabBar,
            tabBarItemStyle: styles.tabBarItem,
            tabBarActiveTintColor: '#38BDF8',
            tabBarInactiveTintColor: '#64748B',
            tabBarLabelStyle: styles.tabLabel,
            tabBarIconStyle: styles.tabIcon,
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'Voice',
              tabBarIcon: () => (
                <View style={styles.iconWrapper}>
                  <Text style={{ fontSize: 18 }}>🎙️</Text>
                </View>
              ),
            }}
          />
          <Tabs.Screen
            name="tasks"
            options={{
              title: 'Tasks',
              tabBarIcon: () => (
                <View style={styles.iconWrapper}>
                  <Text style={{ fontSize: 18 }}>📋</Text>
                </View>
              ),
            }}
          />
          <Tabs.Screen
            name="memories"
            options={{
              title: 'Memories',
              tabBarIcon: () => (
                <View style={styles.iconWrapper}>
                  <Text style={{ fontSize: 18 }}>🧠</Text>
                </View>
              ),
            }}
          />
          <Tabs.Screen
            name="conversation"
            options={{
              title: 'History',
              tabBarIcon: () => (
                <View style={styles.iconWrapper}>
                  <Text style={{ fontSize: 18 }}>💬</Text>
                </View>
              ),
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: 'Settings',
              tabBarIcon: () => (
                <View style={styles.iconWrapper}>
                  <Text style={{ fontSize: 18 }}>⚙️</Text>
                </View>
              ),
            }}
          />
        </Tabs>
      </SafeAreaView>
    </SafeAreaProvider>
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
    borderTopWidth: 1,
    height: 66,
    paddingBottom: 10,
    paddingTop: 8,
    elevation: 8,
  },
  tabBarItem: {
    paddingVertical: 2,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  tabIcon: {
    marginBottom: 0,
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
