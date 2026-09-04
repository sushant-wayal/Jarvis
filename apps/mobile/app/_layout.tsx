import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../src/components/Icon';
import { EarbudProvider } from '../src/hooks/useEarbudManager';
import { appSettingsService } from '../src/services/appSettingsService';
import { integrationManager } from '../src/integrations/IntegrationManager';
import { colors } from '../src/theme/tokens';

export default function RootLayout(): React.ReactElement {
  React.useEffect(() => {
    appSettingsService.initialize().catch(() => {});
    integrationManager.initialize().catch(() => {});
  }, []);

  return (
    <SafeAreaProvider>
      <EarbudProvider>
        <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
          <StatusBar style="light" backgroundColor="#131314" />
          <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: styles.tabBar,
            tabBarItemStyle: styles.tabBarItem,
            tabBarActiveTintColor: colors.primaryFixed,
            tabBarInactiveTintColor: colors.outline,
            tabBarShowLabel: false,
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'Voice',
              tabBarIcon: ({ focused }) => (
                <View style={[styles.iconWrapper, focused && styles.activeIconGlow]}>
                  <Icon
                    name="home"
                    size={22}
                    color={focused ? colors.primaryFixed : colors.outline}
                  />
                  {focused && <View style={styles.activeDot} />}
                </View>
              ),
            }}
          />
          <Tabs.Screen
            name="memories"
            options={{
              title: 'Memory',
              tabBarIcon: ({ focused }) => (
                <View style={[styles.iconWrapper, focused && styles.activeIconGlow]}>
                  <Icon
                    name="database"
                    size={22}
                    color={focused ? colors.primaryFixed : colors.outline}
                  />
                  {focused && <View style={styles.activeDot} />}
                </View>
              ),
            }}
          />
          <Tabs.Screen
            name="tasks"
            options={{
              title: 'Intentions',
              tabBarIcon: ({ focused }) => (
                <View style={[styles.iconWrapper, focused && styles.activeIconGlow]}>
                  <Icon
                    name="calendar_today"
                    size={22}
                    color={focused ? colors.primaryFixed : colors.outline}
                  />
                  {focused && <View style={styles.activeDot} />}
                </View>
              ),
            }}
          />
          <Tabs.Screen
            name="conversation"
            options={{
              title: 'Dialogue',
              tabBarIcon: ({ focused }) => (
                <View style={[styles.iconWrapper, focused && styles.activeIconGlow]}>
                  <Icon
                    name="insights"
                    size={22}
                    color={focused ? colors.primaryFixed : colors.outline}
                  />
                  {focused && <View style={styles.activeDot} />}
                </View>
              ),
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: 'Settings',
              tabBarIcon: ({ focused }) => (
                <View style={[styles.iconWrapper, focused && styles.activeIconGlow]}>
                  <Icon
                    name="settings"
                    size={22}
                    color={focused ? colors.primaryFixed : colors.outline}
                  />
                  {focused && <View style={styles.activeDot} />}
                </View>
              ),
            }}
          />
        </Tabs>
      </SafeAreaView>
      </EarbudProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabBar: {
    backgroundColor: 'rgba(19, 19, 20, 0.95)',
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    borderTopWidth: 1,
    height: 72,
    paddingBottom: 8,
    paddingTop: 8,
    elevation: 12,
  },
  tabBarItem: {
    paddingVertical: 4,
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    height: 40,
    width: 40,
  },
  activeIconGlow: {
    shadowColor: colors.primaryContainer,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
  },
  activeDot: {
    position: 'absolute',
    bottom: 2,
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.primaryFixed,
  },
});
