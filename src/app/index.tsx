
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

type Customer = {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  notes: string | null;
};

type DashboardStats = {
  totalBookings: number;
  paymentsReceived: number;
  pendingBalance: number;
  totalExpenses: number;
};

const colors = {
  background: '#F5F7FA',
  surface: '#FFFFFF',
  primary: '#176B55',
  primaryLight: '#E5F4EE',
  text: '#172B27',
  muted: '#6B7B76',
  border: '#E0E8E4',
};

export default function HomeScreen() {
  const db = useSQLiteContext();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerCount, setCustomerCount] = useState(0);
  const [stats, setStats] = useState<DashboardStats>({
    totalBookings: 0,
    paymentsReceived: 0,
    pendingBalance: 0,
    totalExpenses: 0,
  });
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const loadCustomers = useCallback(async () => {
    try {
      const query = `%${search.trim()}%`;

      const rows = await db.getAllAsync<Customer>(
        `SELECT id, name, phone, email, address, notes
         FROM customers
         WHERE name LIKE ? OR phone LIKE ?
         ORDER BY name COLLATE NOCASE ASC`,
        query,
        query,
      );

      const count = await db.getFirstAsync<{ total: number }>(
        'SELECT COUNT(*) AS total FROM customers',
      );

      setCustomers(rows);
      setCustomerCount(count?.total ?? 0);
    } catch {
      Alert.alert('Error', 'Could not load customers.');
    } finally {
      setLoading(false);
    }
  }, [db, search]);


  const loadDashboardStats = useCallback(async () => {
    try {
      const bookingCount = await db.getFirstAsync<{ total: number }>(
        'SELECT COUNT(*) AS total FROM bookings',
      );

      const paymentTotals = await db.getFirstAsync<{
        received: number;
      }>(
        `SELECT COALESCE(SUM(
        CASE
          WHEN payment_type = 'CUSTOMER_PAYMENT' THEN amount_paise
          WHEN payment_type = 'CUSTOMER_REFUND' THEN -amount_paise
          ELSE 0
        END
      ), 0) AS received
      FROM payments`,
      );

      const pending = await db.getFirstAsync<{ balance: number }>(
        `SELECT COALESCE(SUM(
        MAX(
          b.selling_price_paise - COALESCE(p.received, 0),
          0
        )
      ), 0) AS balance
      FROM bookings b
      LEFT JOIN (
        SELECT booking_id,
          SUM(
            CASE
              WHEN payment_type = 'CUSTOMER_PAYMENT' THEN amount_paise
              WHEN payment_type = 'CUSTOMER_REFUND' THEN -amount_paise
              ELSE 0
            END
          ) AS received
        FROM payments
        GROUP BY booking_id
      ) p ON p.booking_id = b.id
      WHERE b.booking_status != 'CANCELLED'`,
      );

      const supplierTotals = await db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(
          CASE
            WHEN payment_type = 'SUPPLIER_PAYMENT' THEN amount_paise
            WHEN payment_type = 'SUPPLIER_REFUND' THEN -amount_paise
            ELSE 0
          END
        ), 0) AS total
        FROM payments`,
      );

      const operatingExpenses = await db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(amount_paise), 0) AS total
        FROM operating_expenses
        WHERE payment_status = 'PAID'`,
      );

      const totalExpenses =
        (supplierTotals?.total ?? 0) +
        (operatingExpenses?.total ?? 0);

      setStats({
        totalBookings: bookingCount?.total ?? 0,
        paymentsReceived: paymentTotals?.received ?? 0,
        pendingBalance: pending?.balance ?? 0,
        totalExpenses,
      });
    } catch {
      Alert.alert('Error', 'Could not load dashboard totals.');
    }
  }, [db]);


  useFocusEffect(
    useCallback(() => {
      void loadCustomers();
      void loadDashboardStats();
    }, [loadCustomers, loadDashboardStats]),
  );

  function resetForm() {
    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setNotes('');
  }

  async function addCustomer() {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter the customer name.');
      return;
    }

    if (!phone.trim()) {
      Alert.alert('Required', 'Please enter the mobile number.');
      return;
    }

    setSaving(true);

    try {
      await db.runAsync(
        `INSERT INTO customers
          (name, phone, email, address, notes)
         VALUES (?, ?, ?, ?, ?)`,
        name.trim(),
        phone.trim(),
        email.trim() || null,
        address.trim() || null,
        notes.trim() || null,
      );

      resetForm();
      setModalVisible(false);
      setSearch('');
      await loadCustomers();

      Alert.alert('Success', 'Customer saved on this phone.');
    } catch {
      Alert.alert('Error', 'Unable to save this customer.');
    } finally {
      setSaving(false);
    }
  }

  const formatRupees = (paise: number) =>
    `₹${(paise / 100).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>TICKET DESK</Text>
          <Text style={styles.headerSubtitle}>Business manager · Offline</Text>
        </View>

        <View style={styles.offlineBadge}>
          <View style={styles.onlineDot} />
          <Text style={styles.offlineText}>LOCAL</Text>
        </View>
      </View>

      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.pageContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>Dashboard</Text>
        <Text style={styles.subtitle}>
          Your travel business at a glance.
        </Text>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>TOTAL CUSTOMERS</Text>
          <Text style={styles.summaryValue}>{customerCount}</Text>
          <Text style={styles.summaryHint}>
            Customers saved on this device
          </Text>
        </View>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>TOTAL BOOKINGS</Text>
            <Text style={styles.statValue}>{stats.totalBookings}</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>PAYMENTS RECEIVED</Text>
            <Text style={styles.statMoney}>{formatRupees(stats.paymentsReceived)}</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>PENDING BALANCE</Text>
            <Text style={styles.statMoney}>{formatRupees(stats.pendingBalance)}</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>TOTAL EXPENSES</Text>
            <Text style={styles.statMoney}>{formatRupees(stats.totalExpenses)}</Text>
          </View>
        </View>


        <Pressable
          style={styles.bookingsButton}
          onPress={() => router.push('/bookings')}
        >
          <View style={styles.bookingsButtonTextContainer}>
            <Text style={styles.bookingsButtonTitle}>Booking Management</Text>
            <Text style={styles.bookingsButtonSubtitle}>
              Create and track bus, train, flight, and other bookings
            </Text>
          </View>
          <Text style={styles.bookingsButtonArrow}>›</Text>
        </Pressable>

        <Pressable
          style={styles.bookingsButton}
          onPress={() => router.push('/payments')}
        >
          <View style={styles.bookingsButtonTextContainer}>
            <Text style={styles.bookingsButtonTitle}>
              Payment Management
            </Text>
            <Text style={styles.bookingsButtonSubtitle}>
              Record payments and track outstanding balances
            </Text>
          </View>
          <Text style={styles.bookingsButtonArrow}>›</Text>
        </Pressable>
        <Pressable
          style={styles.bookingsButton}
          onPress={() => router.push('/operating-expenses')}
        >
          <View style={styles.bookingsButtonTextContainer}>
            <Text style={styles.bookingsButtonTitle}>
              Operating Expenses
            </Text>
            <Text style={styles.bookingsButtonSubtitle}>
              Manage rent, salaries, travel, electricity and other expenses
            </Text>
          </View>
          <Text style={styles.bookingsButtonArrow}>›</Text>
        </Pressable>
        <Pressable
          style={styles.bookingsButton}
          onPress={() => router.push('/expense-reports')}
        >
          <View style={styles.bookingsButtonTextContainer}>
            <Text style={styles.bookingsButtonTitle}>
              Expense Reports
            </Text>
            <Text style={styles.bookingsButtonSubtitle}>
              View monthly charts and expense breakdowns
            </Text>
          </View>
          <Text style={styles.bookingsButtonArrow}>›</Text>
        </Pressable>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Customers</Text>
            <Text style={styles.sectionSubtitle}>
              Manage your customer records
            </Text>
          </View>

          <Pressable
            style={styles.addButton}
            onPress={() => setModalVisible(true)}
          >
            <Text style={styles.addButtonText}>+ Add</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.searchInput}
          placeholder="Search name or mobile number"
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />

        {loading ? (
          <ActivityIndicator
            style={styles.loader}
            size="large"
            color={colors.primary}
          />
        ) : customers.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>
              {search ? 'No matching customers' : 'No customers yet'}
            </Text>
            <Text style={styles.emptyText}>
              {search
                ? 'Try another name or mobile number.'
                : 'Add your first customer to get started.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={customers}
            scrollEnabled={false}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <View style={styles.customerCard}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {item.name.trim().charAt(0).toUpperCase()}
                  </Text>
                </View>

                <View style={styles.customerDetails}>
                  <Text style={styles.customerName}>{item.name}</Text>
                  <Text style={styles.customerPhone}>{item.phone}</Text>
                  {item.email ? (
                    <Text style={styles.customerEmail}>{item.email}</Text>
                  ) : null}
                </View>
              </View>
            )}
          />
        )}

        <Text style={styles.footer}>
          Your records stay on this device.
        </Text>
      </ScrollView>

      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <KeyboardAvoidingView
            style={styles.modalContent}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Add Customer</Text>
                <Text style={styles.modalSubtitle}>
                  Enter the customer details
                </Text>
              </View>

              <Pressable
                onPress={() => setModalVisible(false)}
                disabled={saving}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.form}
            >
              <FormField
                label="Customer name *"
                value={name}
                onChangeText={setName}
                placeholder="Enter full name"
              />

              <FormField
                label="Mobile number *"
                value={phone}
                onChangeText={setPhone}
                placeholder="Enter mobile number"
                keyboardType="phone-pad"
              />

              <FormField
                label="Email address"
                value={email}
                onChangeText={setEmail}
                placeholder="Optional"
                keyboardType="email-address"
              />

              <FormField
                label="Address"
                value={address}
                onChangeText={setAddress}
                placeholder="Optional"
                multiline
              />

              <FormField
                label="Notes"
                value={notes}
                onChangeText={setNotes}
                placeholder="Additional information"
                multiline
              />

              <Pressable
                style={[
                  styles.saveButton,
                  saving && styles.disabledButton,
                ]}
                onPress={() => void addCustomer()}
                disabled={saving}
              >
                <Text style={styles.saveButtonText}>
                  {saving ? 'Saving...' : 'Save Customer'}
                </Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

type FormFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  multiline?: boolean;
};

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  multiline = false,
}: FormFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[
          styles.fieldInput,
          multiline && styles.multilineInput,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1,
  },
  headerSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 6,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  offlineText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  page: {
    flex: 1,
  },
  pageContent: {
    padding: 20,
    paddingBottom: 36,
  },
  heading: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    marginTop: 5,
    marginBottom: 20,
    fontSize: 14,
  },
  summaryCard: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    padding: 20,
    marginBottom: 28,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statCard: {
    width: '48%',
    minHeight: 105,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    padding: 14,
    marginBottom: 12,
  },
  statLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statValue: {
    color: colors.text,
    fontSize: 27,
    fontWeight: '800',
    marginTop: 12,
  },
  statMoney: {
    color: colors.primary,
    fontSize: 17,
    fontWeight: '800',
    marginTop: 12,
  },
  summaryLabel: {
    color: '#D2F2E6',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  summaryValue: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '800',
    marginTop: 8,
  },
  summaryHint: {
    color: '#D2F2E6',
    fontSize: 12,
    marginTop: 4,
  },
  bookingsButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    borderRadius: 13,
    paddingHorizontal: 16,
    paddingVertical: 17,
    marginBottom: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bookingsButtonTextContainer: {
    flex: 1,
    paddingRight: 12,
  },
  bookingsButtonTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  bookingsButtonSubtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  bookingsButtonArrow: {
    color: colors.primary,
    fontSize: 32,
    fontWeight: '500',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
    color: colors.text,
    marginBottom: 14,
  },
  loader: {
    marginTop: 32,
  },
  emptyState: {
    backgroundColor: colors.surface,
    padding: 24,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
  customerCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '800',
  },
  customerDetails: {
    flex: 1,
  },
  customerName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  customerPhone: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
  },
  customerEmail: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  footer: {
    color: colors.muted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 24,
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalContent: {
    flex: 1,
  },
  modalHeader: {
    padding: 20,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 5,
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    color: colors.primary,
    fontWeight: '700',
  },
  form: {
    padding: 20,
    paddingBottom: 40,
  },
  field: {
    marginBottom: 17,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  fieldInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
    minHeight: 46,
  },
  multilineInput: {
    minHeight: 90,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 11,
    alignItems: 'center',
    padding: 15,
    marginTop: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
