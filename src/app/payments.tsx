import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { Ionicons } from '@expo/vector-icons';

type Booking = {
  id: number;
  booking_number: string;
  customer_id: number;
  customer_name: string;
  transport_type: string;
  origin: string | null;
  destination: string | null;
  journey_at: string | null;
  booking_status: string;
  selling_price_paise: number;
  supplier_cost_paise: number;
};

type Payment = {
  id: number;
  booking_id: number;
  booking_number: string;
  customer_name: string;
  payment_type: PaymentType;
  amount_paise: number;
  payment_method: string;
  transaction_reference: string | null;
  payment_date: string;
  notes: string | null;
};

type PaymentType =
  | 'CUSTOMER_PAYMENT'
  | 'CUSTOMER_REFUND'
  | 'SUPPLIER_PAYMENT'
  | 'SUPPLIER_REFUND';

const PAYMENT_TYPES: { value: PaymentType; label: string; hint: string }[] = [
  { value: 'CUSTOMER_PAYMENT', label: 'Customer received', hint: 'Money received from customer' },
  { value: 'CUSTOMER_REFUND', label: 'Customer refund', hint: 'Money returned to customer' },
  { value: 'SUPPLIER_PAYMENT', label: 'Supplier paid', hint: 'Money paid to supplier' },
  { value: 'SUPPLIER_REFUND', label: 'Supplier refund', hint: 'Money returned by supplier' },
];

const METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CARD', label: 'Card' },
  { value: 'OTHER', label: 'Other' },
];

const colors = {
  background: '#F5F7FA',
  surface: '#FFFFFF',
  primary: '#176B55',
  primaryLight: '#E5F4EE',
  text: '#172B27',
  muted: '#6B7B76',
  border: '#E0E8E4',
  danger: '#B42318',
  dangerLight: '#FDECEC',
  blue: '#245BC7',
  blueLight: '#EAF1FF',
};

function money(paise: number) {
  return (paise / 100).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  });
}

function displayDate(value: string | null | undefined) {
  if (!value) return 'Date not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function readableType(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function PaymentsScreen() {
  const db = useSQLiteContext();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [paymentType, setPaymentType] = useState<PaymentType>('CUSTOMER_PAYMENT');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const selectedBooking = useMemo(
    () => bookings.find((booking) => booking.id === selectedBookingId) ?? null,
    [bookings, selectedBookingId],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const bookingRows = await db.getAllAsync<Booking>(
        `SELECT
           b.id,
           b.booking_number,
           b.customer_id,
           c.name AS customer_name,
           b.transport_type,
           b.origin,
           b.destination,
           b.journey_at,
           b.booking_status,
           b.selling_price_paise,
           b.supplier_cost_paise
         FROM bookings b
         INNER JOIN customers c ON c.id = b.customer_id
         WHERE UPPER(b.booking_status) != 'CANCELLED'
         ORDER BY b.id DESC`,
      );

      const paymentRows = await db.getAllAsync<Payment>(
        `SELECT
           p.id,
           p.booking_id,
           b.booking_number,
           c.name AS customer_name,
           p.payment_type,
           p.amount_paise,
           p.payment_method,
           p.transaction_reference,
           p.payment_date,
           p.notes
         FROM payments p
         INNER JOIN bookings b ON b.id = p.booking_id
         INNER JOIN customers c ON c.id = b.customer_id
         ORDER BY p.payment_date DESC, p.id DESC`,
      );

      setBookings(bookingRows);
      setPayments(paymentRows);
      setSelectedBookingId((current) =>
        current && bookingRows.some((booking) => booking.id === current)
          ? current
          : bookingRows[0]?.id ?? null,
      );
    } catch (error) {
      console.error('Failed to load payment data:', error);
      Alert.alert(
        'Could not load payments',
        'Please confirm that your bookings and payments tables have been created.',
      );
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  async function savePayment() {
    if (!selectedBooking) {
      Alert.alert('Select a booking', 'Create a booking before recording a payment.');
      return;
    }

    const parsedAmount = Number(amount.trim().replace(/,/g, ''));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid amount', 'Enter an amount greater than ₹0.');
      return;
    }

    const amountPaise = Math.round(parsedAmount * 100);
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid amount in Indian rupees.');
      return;
    }

    setSaving(true);
    try {
      await db.runAsync(
        `INSERT INTO payments
          (booking_id, payment_type, amount_paise, payment_method,
           transaction_reference, payment_date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        selectedBooking.id,
        paymentType,
        amountPaise,
        paymentMethod,
        reference.trim() || null,
        new Date().toISOString(),
        notes.trim() || null,
      );

      setAmount('');
      setReference('');
      setNotes('');
      await loadData();
      Alert.alert('Payment saved', 'The transaction has been saved on this device.');
    } catch (error) {
      console.error('Failed to save payment:', error);
      Alert.alert('Save failed', 'The transaction could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const selectedType = PAYMENT_TYPES.find((item) => item.value === paymentType)!;

  const selectedBookingTotals = useMemo(() => {
    if (!selectedBooking) return { received: 0, refunded: 0, balance: 0, supplierPaid: 0, supplierRefunded: 0 };
    const matching = payments.filter((p) => p.booking_id === selectedBooking.id);
    const received = matching
      .filter((p) => p.payment_type === 'CUSTOMER_PAYMENT')
      .reduce((sum, p) => sum + p.amount_paise, 0);
    const refunded = matching
      .filter((p) => p.payment_type === 'CUSTOMER_REFUND')
      .reduce((sum, p) => sum + p.amount_paise, 0);
    const supplierPaid = matching
      .filter((p) => p.payment_type === 'SUPPLIER_PAYMENT')
      .reduce((sum, p) => sum + p.amount_paise, 0);
    const supplierRefunded = matching
      .filter((p) => p.payment_type === 'SUPPLIER_REFUND')
      .reduce((sum, p) => sum + p.amount_paise, 0);
    return {
      received,
      refunded,
      balance: selectedBooking.selling_price_paise - received + refunded,
      supplierPaid,
      supplierRefunded,
    };
  }, [payments, selectedBooking]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerButtons}>
          <Pressable
            onPress={() => router.replace('/')}
            style={styles.homeButton}
          >
            <Ionicons name="home" size={22} color="#2563eb" />
          </Pressable>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
        </View>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.brand}>TICKET DESK</Text>
          <Text style={styles.headerSubtitle}>Payments · Offline</Text>
        </View>
        <View style={styles.localBadge}>
          <View style={styles.localDot} />
          <Text style={styles.localText}>LOCAL</Text>
        </View>
      </View>

      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.pageContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>Payment Management</Text>
        <Text style={styles.subtitle}>Record money received, refunds, and supplier transactions.</Text>

        {loading ? (
          <ActivityIndicator style={styles.loader} size="large" color={colors.primary} />
        ) : bookings.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No bookings available</Text>
            <Text style={styles.emptyText}>Create a booking first, then you can record its payments here.</Text>
            <Pressable style={styles.primaryButton} onPress={() => router.push('/bookings')}>
              <Text style={styles.primaryButtonText}>Go to Bookings</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Record a transaction</Text>
              <Text style={styles.fieldLabel}>Select booking *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bookingChoices}>
                {bookings.map((booking) => (
                  <Pressable
                    key={booking.id}
                    onPress={() => setSelectedBookingId(booking.id)}
                    style={[
                      styles.bookingChoice,
                      selectedBookingId === booking.id && styles.bookingChoiceSelected,
                    ]}
                  >
                    <Text style={[
                      styles.bookingChoiceTitle,
                      selectedBookingId === booking.id && styles.bookingChoiceTitleSelected,
                    ]}>
                      {booking.booking_number}
                    </Text>
                    <Text style={[
                      styles.bookingChoiceSub,
                      selectedBookingId === booking.id && styles.bookingChoiceSubSelected,
                    ]}>
                      {booking.customer_name}
                    </Text>
                    <Text style={[
                      styles.bookingChoiceSub,
                      selectedBookingId === booking.id && styles.bookingChoiceSubSelected,
                    ]}>
                      {booking.origin || 'Origin'} → {booking.destination || 'Destination'}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              {selectedBooking ? (
                <View style={styles.selectedSummary}>
                  <View style={styles.summaryLine}>
                    <Text style={styles.summaryLabel}>Booking selling price</Text>
                    <Text style={styles.summaryValue}>{money(selectedBooking.selling_price_paise)}</Text>
                  </View>
                  <View style={styles.summaryLine}>
                    <Text style={styles.summaryLabel}>Net customer payments</Text>
                    <Text style={styles.summaryValue}>
                      {money(selectedBookingTotals.received - selectedBookingTotals.refunded)}
                    </Text>
                  </View>
                  <View style={[styles.summaryLine, styles.balanceLine]}>
                    <Text style={styles.balanceLabel}>Customer balance</Text>
                    <Text style={[
                      styles.balanceValue,
                      selectedBookingTotals.balance < 0 && styles.negativeValue,
                    ]}>
                      {money(selectedBookingTotals.balance)}
                    </Text>
                  </View>
                </View>
              ) : null}

              <Text style={styles.fieldLabel}>Transaction type *</Text>
              <View style={styles.optionWrap}>
                {PAYMENT_TYPES.map((item) => (
                  <Pressable
                    key={item.value}
                    style={[styles.option, paymentType === item.value && styles.optionSelected]}
                    onPress={() => setPaymentType(item.value)}
                  >
                    <Text style={[styles.optionText, paymentType === item.value && styles.optionTextSelected]}>
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.hint}>{selectedType.hint}</Text>

              <Text style={styles.fieldLabel}>Amount (₹) *</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                placeholder="e.g. 1500.00"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
              />

              <Text style={styles.fieldLabel}>Payment method *</Text>
              <View style={styles.optionWrap}>
                {METHODS.map((item) => (
                  <Pressable
                    key={item.value}
                    style={[styles.methodOption, paymentMethod === item.value && styles.methodOptionSelected]}
                    onPress={() => setPaymentMethod(item.value)}
                  >
                    <Text style={[styles.methodText, paymentMethod === item.value && styles.methodTextSelected]}>
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Transaction reference</Text>
              <TextInput
                style={styles.input}
                value={reference}
                onChangeText={setReference}
                placeholder="UPI ID, bank reference, receipt no. (optional)"
                placeholderTextColor={colors.muted}
                autoCapitalize="characters"
              />

              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional notes"
                placeholderTextColor={colors.muted}
                multiline
                textAlignVertical="top"
              />

              <Pressable
                style={[styles.primaryButton, saving && styles.disabledButton]}
                onPress={() => void savePayment()}
                disabled={saving}
              >
                <Text style={styles.primaryButtonText}>
                  {saving ? 'Saving transaction…' : 'Save transaction'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Recent transactions</Text>
                <Text style={styles.sectionSubtitle}>Latest 100 saved entries</Text>
              </View>
            </View>

            {payments.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No transactions yet</Text>
                <Text style={styles.emptyText}>Your saved payments will appear here.</Text>
              </View>
            ) : (
              payments.slice(0, 100).map((payment) => {
                const isIncoming =
                  payment.payment_type === 'CUSTOMER_PAYMENT' ||
                  payment.payment_type === 'SUPPLIER_REFUND';
                return (
                  <View key={payment.id} style={styles.paymentCard}>
                    <View style={styles.paymentTopRow}>
                      <View style={styles.paymentTextWrap}>
                        <Text style={styles.paymentTitle}>{readableType(payment.payment_type)}</Text>
                        <Text style={styles.paymentMeta}>
                          {payment.booking_number} · {payment.customer_name}
                        </Text>
                        <Text style={styles.paymentMeta}>
                          {displayDate(payment.payment_date)} · {readableType(payment.payment_method)}
                        </Text>
                      </View>
                      <Text style={[
                        styles.paymentAmount,
                        isIncoming ? styles.incomingAmount : styles.outgoingAmount,
                      ]}>
                        {isIncoming ? '+' : '−'}{money(payment.amount_paise)}
                      </Text>
                    </View>
                    {payment.transaction_reference ? (
                      <Text style={styles.paymentNote}>Ref: {payment.transaction_reference}</Text>
                    ) : null}
                    {payment.notes ? <Text style={styles.paymentNote}>{payment.notes}</Text> : null}
                  </View>
                );
              })
            )}
          </>
        )}

        <Text style={styles.footer}>Payment records are stored locally on this device.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: { paddingVertical: 8, paddingRight: 4 },
  backButtonText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  headerTitleWrap: { flex: 1 },
  brand: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
  headerSubtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  localBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 20,
  },
  localDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
  localText: { color: colors.primary, fontSize: 10, fontWeight: '800' },
  page: { flex: 1 },
  pageContent: { padding: 18, paddingBottom: 36 },
  heading: { color: colors.text, fontSize: 25, fontWeight: '800', marginTop: 4 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 18 },
  loader: { marginTop: 36 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 22,
  },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 18 },
  fieldLabel: { color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: 8, marginTop: 14 },
  bookingChoices: { gap: 9, paddingBottom: 4 },
  bookingChoice: {
    width: 190,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 11,
    backgroundColor: '#FAFCFB',
  },
  bookingChoiceSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  bookingChoiceTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  bookingChoiceTitleSelected: { color: colors.primary },
  bookingChoiceSub: { color: colors.muted, fontSize: 11, marginTop: 4 },
  bookingChoiceSubSelected: { color: colors.primary },
  selectedSummary: {
    backgroundColor: '#F8FAF9',
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, gap: 8 },
  summaryLabel: { color: colors.muted, fontSize: 12, flex: 1 },
  summaryValue: { color: colors.text, fontSize: 13, fontWeight: '700' },
  balanceLine: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 5, paddingTop: 10 },
  balanceLabel: { color: colors.text, fontSize: 13, fontWeight: '800', flex: 1 },
  balanceValue: { color: colors.primary, fontSize: 15, fontWeight: '800' },
  negativeValue: { color: colors.danger },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10 },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  optionText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  optionTextSelected: { color: colors.primary, fontWeight: '800' },
  hint: { color: colors.muted, fontSize: 11, marginTop: 7 },
  methodOption: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 11 },
  methodOptionSelected: { borderColor: colors.blue, backgroundColor: colors.blueLight },
  methodText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  methodTextSelected: { color: colors.blue, fontWeight: '800' },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text,
  },
  multilineInput: { minHeight: 82, textAlignVertical: 'top' },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  disabledButton: { opacity: 0.6 },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    alignItems: 'flex-start',
  },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 7 },
  sectionHeader: { marginTop: 2, marginBottom: 12 },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '800' },
  sectionSubtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  paymentCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  paymentTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  paymentTextWrap: { flex: 1 },
  paymentTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  paymentMeta: { color: colors.muted, fontSize: 11, marginTop: 4 },
  paymentAmount: { fontSize: 14, fontWeight: '800', maxWidth: '45%', textAlign: 'right' },
  incomingAmount: { color: colors.primary },
  outgoingAmount: { color: colors.danger },
  paymentNote: { color: colors.muted, fontSize: 12, marginTop: 8 },
  footer: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 22 },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },

  homeButton: {
    padding: 6,
  },
  back: {
    fontSize: 16,
    color: '#2563eb',
    fontWeight: '600',
  },
});
