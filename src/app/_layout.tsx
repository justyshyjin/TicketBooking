
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';

import { initializeDatabase } from '../database/initialize';

export default function RootLayout() {
  return (
    <SQLiteProvider
      databaseName="ticket_business.db"
      onInit={initializeDatabase}
    >
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#F5F7FA' },
        }}
      />
    </SQLiteProvider>
  );
}
