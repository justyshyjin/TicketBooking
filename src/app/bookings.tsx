
import { useCallback, useState } from 'react';
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
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';

type Customer = {
  id: number;
  name: string;
  phone: string;
};

type Booking = {
  id: number;
  booking_number: string | null;
  customer_id: number;
  customer_name: string;
  phone: string;
  transport_type: string;
  operator_name: string | null;
  booking_reference: string | null;
  origin: string | null;
  destination: string | null;
  journey_at: string | null;
  booking_status: string;
  selling_price_paise: number;
  supplier_cost_paise: number;
};

const TRANSPORT_TYPES = ['BUS', 'TRAIN', 'FLIGHT', 'OTHER'];

const money = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function BookingsScreen() {
  const db = useSQLiteContext();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customerModal, setCustomerModal] = useState(false);

  const [customerId, setCustomerId] = useState<number | null>(null);
  const [transportType, setTransportType] = useState('BUS');
  const [operatorName, setOperatorName] = useState('');
  const [bookingReference, setBookingReference] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [journeyAt, setJourneyAt] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [supplierCost, setSupplierCost] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const BOOKING_STATUSES = [
    'ALL',
    'PENDING',
    'CONFIRMED',
    'WAITLISTED',
    'CANCELLED',
  ];

  const loadData = useCallback(async () => {
    try {
      const customerRows = await db.getAllAsync<Customer>(
        `SELECT id, name, phone
         FROM customers
         ORDER BY name COLLATE NOCASE`
      );

      const bookingRows = await db.getAllAsync<Booking>(
        `SELECT
           b.id,
           b.booking_number,
           b.customer_id,
           c.name AS customer_name,
           c.phone,
           b.transport_type,
           b.operator_name,
           b.booking_reference,
           b.origin,
           b.destination,
           b.journey_at,
           b.booking_status,
           b.selling_price_paise,
           b.supplier_cost_paise
         FROM bookings b
         JOIN customers c ON c.id = b.customer_id
         ORDER BY b.id DESC`
      );

      setCustomers(customerRows);
      setBookings(bookingRows);
    } catch (error) {
      console.error('Failed to load bookings:', error);
      Alert.alert('Error', 'Unable to load bookings.');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const selectedCustomer = customers.find(
    (customer) => customer.id === customerId
  );

  const resetForm = () => {
    setCustomerId(null);
    setTransportType('BUS');
    setOperatorName('');
    setBookingReference('');
    setOrigin('');
    setDestination('');
    setJourneyAt('');
    setSellingPrice('');
    setSupplierCost('');
  };

  const saveBooking = async () => {
    if (!customerId) {
      Alert.alert('Required', 'Please select a customer.');
      return;
    }

    if (!origin.trim() || !destination.trim()) {
      Alert.alert('Required', 'Enter both origin and destination.');
      return;
    }

    if (!journeyAt.trim()) {
      Alert.alert('Required', 'Enter the journey date.');
      return;
    }

    const journeyDate = journeyAt.trim().replace('T', ' ');
    const validDate =
      /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?$/.test(journeyDate) &&
      !Number.isNaN(Date.parse(
        journeyDate.length === 10
          ? `${journeyDate}T00:00:00`
          : journeyDate.replace(' ', 'T')
      ));

    if (!validDate) {
      Alert.alert(
        'Invalid date',
        'Use YYYY-MM-DD or YYYY-MM-DD HH:mm, for example 2026-11-05.'
      );
      return;
    }

    const parseAmount = (value: string): number | null => {
      if (!value.trim()) return 0;
      const amount = Number(value.trim());
      if (!Number.isFinite(amount) || amount < 0) return null;
      const paise = Math.round(amount * 100);
      return Number.isSafeInteger(paise) ? paise : null;
    };

    const sellingPaise = parseAmount(sellingPrice);
    const supplierPaise = parseAmount(supplierCost);

    if (sellingPaise === null || supplierPaise === null) {
      Alert.alert(
        'Invalid amount',
        'Enter valid non-negative amounts for both prices.'
      );
      return;
    }

    setSaving(true);

    try {
      const bookingNumber = `BK-${Date.now()}`;

      await db.runAsync(
        `INSERT INTO bookings (
          booking_number,
          customer_id,
          transport_type,
          operator_name,
          booking_reference,
          origin,
          destination,
          journey_at,
          booking_status,
          travel_status,
          selling_price_paise,
          supplier_cost_paise,
          notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'UPCOMING', ?, ?, NULL)`,
        bookingNumber,
        customerId,
        transportType,
        operatorName.trim() || null,
        bookingReference.trim() || null,
        origin.trim(),
        destination.trim(),
        journeyDate,
        sellingPaise,
        supplierPaise
      );

      resetForm();
      await loadData();

      Alert.alert(
        'Booking saved',
        `Booking ${bookingNumber} has been saved successfully.`
      );
    } catch (error) {
      console.error('Failed to save booking:', error);
      Alert.alert(
        'Save failed',
        'The booking could not be saved. Please check the error in the terminal.'
      );
    } finally {
      setSaving(false);
    }
  };

  const updateBookingStatus = (booking: Booking) => {
    const statuses = ['PENDING', 'CONFIRMED', 'WAITLISTED', 'CANCELLED'];

    Alert.alert(
      'Update booking status',
      `Booking: ${booking.booking_number || booking.id}`,
      [
        ...statuses.map((status) => ({
          text: status,
          onPress: () => {
            void (async () => {
              try {
                await db.runAsync(
                  `UPDATE bookings
                 SET booking_status = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                  status,
                  booking.id,
                );

                await loadData();
              } catch (error) {
                console.error('Failed to update booking status:', error);
                Alert.alert('Error', 'Could not update booking status.');
              }
            })();
          },
        })),
        { text: 'Keep Current', style: 'cancel' as const },
      ],
    );
  };

  const filteredBookings = bookings.filter((booking) => {
    const text = search.trim().toLowerCase();

    const matchesStatus =
      statusFilter === 'ALL' ||
      booking.booking_status === statusFilter;

    const matchesSearch =
      !text ||
      [
        booking.booking_number,
        booking.customer_name,
        booking.phone,
        booking.transport_type,
        booking.booking_reference,
        booking.origin,
        booking.destination,
      ].some((value) => value?.toLowerCase().includes(text));

    return matchesStatus && matchesSearch;
  });

  const renderBooking = ({ item }: { item: Booking }) => {
    const profit =
      item.selling_price_paise - item.supplier_cost_paise;

    return (
      <Pressable
        style={styles.bookingCard}
        onPress={() =>
          router.push({
            pathname: '/booking-details',
            params: { id: String(item.id) },
          })
        }
      >
        <View style={styles.bookingHeader}>
          <Text style={styles.bookingNumber}>
            {item.booking_number || `Booking #${item.id}`}
          </Text>
          <Pressable
            style={styles.statusButton}
            onPress={() => updateBookingStatus(item)}
          >
            <Text style={styles.status}>{item.booking_status}  ⌄</Text>
          </Pressable>
        </View>

        <Text style={styles.customerName}>{item.customer_name}</Text>
        <Text style={styles.muted}>
          {item.transport_type} · {item.phone}
        </Text>

        <Text style={styles.route}>
          {item.origin} → {item.destination}
        </Text>

        <Text style={styles.muted}>
          Journey: {item.journey_at || 'Not specified'}
        </Text>

        {!!item.operator_name && (
          <Text style={styles.muted}>
            Operator: {item.operator_name}
          </Text>
        )}

        {!!item.booking_reference && (
          <Text style={styles.muted}>
            Reference: {item.booking_reference}
          </Text>
        )}

        <View style={styles.priceRow}>
          <View>
            <Text style={styles.priceLabel}>Selling price</Text>
            <Text style={styles.price}>
              {money(item.selling_price_paise)}
            </Text>
          </View>

          <View>
            <Text style={styles.priceLabel}>Supplier cost</Text>
            <Text style={styles.price}>
              {money(item.supplier_cost_paise)}
            </Text>
          </View>

          <View>
            <Text style={styles.priceLabel}>Gross margin</Text>
            <Text
              style={[
                styles.price,
                { color: profit < 0 ? '#D94848' : '#07865D' },
              ]}
            >
              {money(profit)}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#07865D" />
        <Text style={styles.muted}>Loading bookings...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
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

          <Text style={styles.title}>Booking Management</Text>
          <Text style={styles.subtitle}>
            Create and track customer travel bookings offline.
          </Text>

          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>New Booking</Text>

            <Text style={styles.label}>Customer *</Text>
            <Pressable
              style={styles.customerSelector}
              onPress={() => setCustomerModal(true)}
            >
              <Text
                style={[
                  styles.selectorText,
                  !selectedCustomer && styles.placeholder,
                ]}
              >
                {selectedCustomer
                  ? `${selectedCustomer.name} · ${selectedCustomer.phone}`
                  : 'Select a customer'}
              </Text>
              <Text style={styles.selectorArrow}>⌄</Text>
            </Pressable>

            <Text style={styles.label}>Transport type *</Text>
            <View style={styles.typeRow}>
              {TRANSPORT_TYPES.map((type) => (
                <Pressable
                  key={type}
                  onPress={() => setTransportType(type)}
                  style={[
                    styles.typeButton,
                    transportType === type && styles.typeButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.typeText,
                      transportType === type && styles.typeTextActive,
                    ]}
                  >
                    {type}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Operator / Travel company</Text>
            <TextInput
              style={styles.input}
              value={operatorName}
              onChangeText={setOperatorName}
              placeholder="e.g. TNSTC, IRCTC, airline"
              placeholderTextColor="#89939E"
            />

            <Text style={styles.label}>Booking reference / PNR</Text>
            <TextInput
              style={styles.input}
              value={bookingReference}
              onChangeText={setBookingReference}
              placeholder="Enter reference number"
              placeholderTextColor="#89939E"
              autoCapitalize="characters"
            />

            <Text style={styles.label}>Origin *</Text>
            <TextInput
              style={styles.input}
              value={origin}
              onChangeText={setOrigin}
              placeholder="Departure city or station"
              placeholderTextColor="#89939E"
            />

            <Text style={styles.label}>Destination *</Text>
            <TextInput
              style={styles.input}
              value={destination}
              onChangeText={setDestination}
              placeholder="Arrival city or station"
              placeholderTextColor="#89939E"
            />

            <Text style={styles.label}>Journey date *</Text>
            <TextInput
              style={styles.input}
              value={journeyAt}
              onChangeText={setJourneyAt}
              placeholder="YYYY-MM-DD or YYYY-MM-DD HH:mm"
              placeholderTextColor="#89939E"
              autoCapitalize="none"
            />

            <Text style={styles.label}>Selling price (₹)</Text>
            <TextInput
              style={styles.input}
              value={sellingPrice}
              onChangeText={setSellingPrice}
              placeholder="0.00"
              placeholderTextColor="#89939E"
              keyboardType="decimal-pad"
            />

            <Text style={styles.label}>Supplier cost (₹)</Text>
            <TextInput
              style={styles.input}
              value={supplierCost}
              onChangeText={setSupplierCost}
              placeholder="0.00"
              placeholderTextColor="#89939E"
              keyboardType="decimal-pad"
            />

            <Pressable
              style={[
                styles.saveButton,
                saving && styles.disabledButton,
              ]}
              onPress={saveBooking}
              disabled={saving}
            >
              <Text style={styles.saveButtonText}>
                {saving ? 'Saving...' : 'Save Booking'}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.sectionTitle}>
            Saved Bookings ({filteredBookings.length})
          </Text>

          <TextInput
            style={styles.input}
            value={search}
            onChangeText={setSearch}
            placeholder="Search customer, booking, route..."
            placeholderTextColor="#89939E"
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {BOOKING_STATUSES.map((status) => (
              <Pressable
                key={status}
                style={[
                  styles.filterButton,
                  statusFilter === status && styles.filterButtonActive,
                ]}
                onPress={() => setStatusFilter(status)}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    statusFilter === status && styles.filterButtonTextActive,
                  ]}
                >
                  {status === 'ALL' ? 'All' : status}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {filteredBookings.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No bookings found</Text>
              <Text style={styles.muted}>
                Save a booking above to see it here.
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredBookings}
              renderItem={renderBooking}
              keyExtractor={(item) => String(item.id)}
              scrollEnabled={false}
              contentContainerStyle={styles.list}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={customerModal}
        animationType="slide"
        transparent
        onRequestClose={() => setCustomerModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Select Customer</Text>

            <FlatList
              data={customers}
              keyExtractor={(item) => String(item.id)}
              ListEmptyComponent={
                <Text style={styles.muted}>
                  No customers yet. Add a customer first.
                </Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  style={styles.customerOption}
                  onPress={() => {
                    setCustomerId(item.id);
                    setCustomerModal(false);
                  }}
                >
                  <Text style={styles.customerName}>{item.name}</Text>
                  <Text style={styles.muted}>{item.phone}</Text>
                </Pressable>
              )}
            />

            <Pressable
              style={styles.cancelButton}
              onPress={() => setCustomerModal(false)}
            >
              <Text style={styles.cancelText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F6F9' },
  content: { padding: 18, paddingBottom: 40 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#F3F6F9',
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingRight: 16,
    marginBottom: 8,
  },
  backText: { color: '#07865D', fontSize: 16, fontWeight: '700' },
  title: { fontSize: 27, fontWeight: '800', color: '#172B3A' },
  subtitle: { fontSize: 14, color: '#667482', marginTop: 5, marginBottom: 20 },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 17,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: '#E2E8EE',
  },
  filterRow: {
    gap: 8,
    paddingVertical: 4,
    paddingBottom: 16,
  },
  filterButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D8E0E8',
    backgroundColor: '#FFFFFF',
  },
  filterButtonActive: {
    backgroundColor: '#176B55',
    borderColor: '#176B55',
  },
  filterButtonText: {
    color: '#465467',
    fontSize: 12,
    fontWeight: '700',
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#172B3A',
    marginBottom: 15,
  },
  label: {
    color: '#344554',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 7,
    marginTop: 13,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#D6DEE6',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#172B3A',
  },
  customerSelector: {
    minHeight: 49,
    borderWidth: 1,
    borderColor: '#D6DEE6',
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
  },
  selectorText: { flex: 1, color: '#172B3A', fontSize: 14 },
  placeholder: { color: '#89939E' },
  selectorArrow: { fontSize: 20, color: '#07865D', marginLeft: 8 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  typeButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#D6DEE6',
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
  },
  typeButtonActive: { backgroundColor: '#07865D', borderColor: '#07865D' },
  typeText: { fontSize: 12, fontWeight: '700', color: '#526170' },
  typeTextActive: { color: '#FFFFFF' },
  saveButton: {
    marginTop: 23,
    backgroundColor: '#07865D',
    borderRadius: 11,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: { opacity: 0.6 },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  list: { gap: 12, paddingTop: 12 },
  bookingCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E7ED',
    borderRadius: 14,
    padding: 15,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  bookingNumber: { color: '#07865D', fontWeight: '800', fontSize: 14 },
  status: {
    backgroundColor: '#FFF2D7',
    color: '#8A5A00',
    fontSize: 11,
    fontWeight: '800',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  customerName: { color: '#172B3A', fontSize: 16, fontWeight: '800', marginTop: 10 },
  muted: { color: '#71808D', fontSize: 12, marginTop: 4 },
  route: { color: '#263C4D', fontSize: 15, fontWeight: '700', marginTop: 12 },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 15,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E9EEF2',
  },
  priceLabel: { color: '#71808D', fontSize: 10 },
  price: { color: '#172B3A', fontSize: 13, fontWeight: '800', marginTop: 4 },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  emptyTitle: { color: '#172B3A', fontSize: 16, fontWeight: '800' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
  },
  customerOption: {
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF0F3',
  },
  cancelButton: {
    alignItems: 'center',
    padding: 13,
    marginTop: 10,
    backgroundColor: '#EEF2F5',
    borderRadius: 10,
  },
  cancelText: { color: '#344554', fontWeight: '700' },
  statusButton: {
    backgroundColor: '#E5F4EE',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
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
