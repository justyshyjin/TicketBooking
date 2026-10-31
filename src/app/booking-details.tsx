import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
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

type BookingDetails = {
  id: number;
  booking_number: string | null;
  customer_name: string;
  phone: string;
  email: string | null;
  transport_type: string;
  operator_name: string | null;
  booking_reference: string | null;
  origin: string | null;
  destination: string | null;
  journey_at: string | null;
  return_at: string | null;
  booking_status: string;
  travel_status: string | null;
  selling_price_paise: number;
  supplier_cost_paise: number;
  notes: string | null;
  cancellation_reason: string | null;
};

type Payment = {
  id: number;
  payment_type: string;
  amount_paise: number;
  payment_method: string;
  transaction_reference: string | null;
  payment_date: string;
  notes: string | null;
};

type Passenger = {
  id: number;
  name: string;
  age: number | null;
  passenger_type: string | null;
  seat_number: string | null;
  ticket_number: string | null;
  notes: string | null;
};

const money = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const readable = (value: string) =>
  value.replaceAll('_', ' ').toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());

export default function BookingDetailsScreen() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const [passengers, setPassengers] = useState<Passenger[]>([]);
  const [passengerName, setPassengerName] = useState('');
  const [passengerAge, setPassengerAge] = useState('');
  const [passengerType, setPassengerType] = useState('ADULT');
  const [editingPassengerId, setEditingPassengerId] = useState<number | null>(null);
  const [seatNumber, setSeatNumber] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');
  const [passengerNotes, setPassengerNotes] = useState('');
  const [savingPassenger, setSavingPassenger] = useState(false);

  const [savingStatus, setSavingStatus] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');

  const loadPassengers = useCallback(async (bookingId: number) => {
    const rows = await db.getAllAsync<Passenger>(
      `SELECT id, name, age, passenger_type, seat_number, ticket_number, notes
     FROM passengers
     WHERE booking_id = ?
     ORDER BY id DESC`,
      bookingId,
    );

    setPassengers(rows);
  }, [db]);

  const loadDetails = useCallback(async () => {
    setLoading(true);

    try {
      const bookingId = Number(id);

      if (!Number.isSafeInteger(bookingId) || bookingId <= 0) {
        setBooking(null);
        setPayments([]);
        setPassengers([]);
        return;
      }

      const row = await db.getFirstAsync<BookingDetails>(
        `SELECT
          b.id, b.booking_number, c.name AS customer_name,
          c.phone, c.email, b.transport_type, b.operator_name,
          b.booking_reference, b.origin, b.destination,
          b.journey_at, b.return_at, b.booking_status,
          b.travel_status, b.selling_price_paise,b.cancellation_reason,
          b.supplier_cost_paise, b.notes
         FROM bookings b
         JOIN customers c ON c.id = b.customer_id
         WHERE b.id = ?`,
        bookingId,
      );

      setBooking(row ?? null);
      setCancellationReason(row?.cancellation_reason ?? '');

      if (!row) {
        setPayments([]);
        setPassengers([]);
        return;
      }

      const paymentRows = await db.getAllAsync<Payment>(
        `SELECT id, payment_type, amount_paise, payment_method,
          transaction_reference, payment_date, notes
         FROM payments
         WHERE booking_id = ?
         ORDER BY payment_date DESC, id DESC`,
        bookingId,
      );

      setPayments(paymentRows);
      await loadPassengers(bookingId);
    } catch (error) {
      console.error('Failed to load booking details:', error);
      Alert.alert('Error', 'Could not load booking details.');
    } finally {
      setLoading(false);
    }
  }, [db, id, loadPassengers]);

  useFocusEffect(
    useCallback(() => {
      void loadDetails();
    }, [loadDetails]),
  );

  const savePassenger = async () => {
    const name = passengerName.trim();

    if (!name) {
      Alert.alert('Missing name', 'Please enter the passenger name.');
      return;
    }

    const ageText = passengerAge.trim();
    const age = ageText ? Number(ageText) : null;

    if (
      ageText &&
      (!Number.isInteger(age) || age! < 0 || age! > 120)
    ) {
      Alert.alert('Invalid age', 'Enter an age between 0 and 120.');
      return;
    }

    const wasEditing = editingPassengerId !== null;
    setSavingPassenger(true);

    try {
      if (editingPassengerId !== null) {
        await db.runAsync(
          `UPDATE passengers
     SET name = ?, age = ?, passenger_type = ?,
         seat_number = ?, ticket_number = ?, notes = ?
     WHERE id = ? AND booking_id = ?`,
          name,
          age,
          passengerType,
          seatNumber.trim() || null,
          ticketNumber.trim() || null,
          passengerNotes.trim() || null,
          editingPassengerId,
          Number(id),
        );
      } else {
        await db.runAsync(
          `INSERT INTO passengers
     (booking_id, name, age, passenger_type, seat_number, ticket_number, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
          Number(id),
          name,
          age,
          passengerType,
          seatNumber.trim() || null,
          ticketNumber.trim() || null,
          passengerNotes.trim() || null,
        );
      }

      setEditingPassengerId(null);

      setPassengerName('');
      setPassengerAge('');
      setPassengerType('ADULT');
      setSeatNumber('');
      setTicketNumber('');
      setPassengerNotes('');

      await loadPassengers(Number(id));
      Alert.alert(
        'Success',
        wasEditing
          ? 'Passenger updated successfully.'
          : 'Passenger added successfully.',
      );
    } catch (error) {
      console.error('Failed to save passenger:', error);
      Alert.alert('Error', 'Could not save the passenger.');
    } finally {
      setSavingPassenger(false);
    }
  };


  const editPassenger = (passenger: Passenger) => {
    setEditingPassengerId(passenger.id);
    setPassengerName(passenger.name);
    setPassengerAge(
      passenger.age !== null ? String(passenger.age) : '',
    );
    setPassengerType(passenger.passenger_type || 'ADULT');
    setSeatNumber(passenger.seat_number || '');
    setTicketNumber(passenger.ticket_number || '');
    setPassengerNotes(passenger.notes || '');
  };

  const deletePassenger = async (passengerId: number) => {
    try {
      await db.runAsync(
        'DELETE FROM passengers WHERE id = ? AND booking_id = ?',
        passengerId,
        Number(id),
      );

      await loadPassengers(Number(id));
    } catch (error) {
      console.error('Failed to remove passenger:', error);
      Alert.alert('Error', 'Could not remove the passenger.');
    }
  };

  const updateBookingStatus = async (
    field: 'booking_status' | 'travel_status',
    value: string,
  ) => {
    const allowedValues =
      field === 'booking_status'
        ? ['PENDING', 'CONFIRMED', 'WAITLISTED', 'CANCELLED']
        : ['UPCOMING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

    if (!allowedValues.includes(value)) {
      Alert.alert('Invalid status', 'Please select a valid status.');
      return;
    }

    if (!booking || savingStatus) return;

    if (field === 'booking_status' && value === 'CANCELLED') {
      Alert.alert(
        'Cancel booking?',
        'Are you sure you want to cancel this booking?',
        [
          { text: 'Keep booking', style: 'cancel' },
          {
            text: 'Cancel booking',
            style: 'destructive',
            onPress: () => void saveStatusChange(field, value),
          },
        ],
      );
      return;
    }

    await saveStatusChange(field, value);
  };

  const saveStatusChange = async (
    field: 'booking_status' | 'travel_status',
    value: string,
  ) => {
    if (!booking || savingStatus) return;

    setSavingStatus(true);

    try {
      if (field === 'booking_status') {
        await db.runAsync(
          `UPDATE bookings
         SET booking_status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
          value,
          booking.id,
        );
      } else {
        await db.runAsync(
          `UPDATE bookings
         SET travel_status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
          value,
          booking.id,
        );
      }

      await loadDetails();
      Alert.alert('Updated', 'Booking status updated successfully.');
    } catch (error) {
      console.error('Failed to update booking status:', error);
      Alert.alert('Error', 'Could not update booking status.');
    } finally {
      setSavingStatus(false);
    }
  };

  const received = payments
    .filter((payment) => payment.payment_type === 'CUSTOMER_PAYMENT')
    .reduce((total, payment) => total + payment.amount_paise, 0);

  const refunded = payments
    .filter((payment) => payment.payment_type === 'CUSTOMER_REFUND')
    .reduce((total, payment) => total + payment.amount_paise, 0);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#176B55" />
        <Text style={styles.muted}>Loading booking...</Text>
      </SafeAreaView>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.title}>Booking not found</Text>
        <Pressable style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
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

        <Text style={styles.eyebrow}>BOOKING DETAILS</Text>
        <Text style={styles.title}>
          {booking.booking_number || `Booking #${booking.id}`}
        </Text>
        <Text style={styles.status}>{readable(booking.booking_status)}</Text>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Manage Status</Text>

          <Text style={styles.statusLabel}>Booking status</Text>
          <View style={styles.statusOptions}>
            {(['PENDING', 'CONFIRMED', 'WAITLISTED', 'CANCELLED'] as const).map(
              (status) => (
                <Pressable
                  key={status}
                  disabled={savingStatus || booking.booking_status === status}
                  style={[
                    styles.statusOption,
                    booking.booking_status === status && styles.statusOptionActive,
                  ]}
                  onPress={() => void updateBookingStatus('booking_status', status)}
                >
                  <Text
                    style={[
                      styles.statusOptionText,
                      booking.booking_status === status && styles.statusOptionTextActive,
                    ]}
                  >
                    {readable(status)}
                  </Text>
                </Pressable>
              ),
            )}
          </View>
          {booking.booking_status === 'CANCELLED' && (
            <>
              <Text style={styles.statusLabel}>Cancellation reason</Text>
              <TextInput
                style={styles.textInput}
                value={cancellationReason}
                onChangeText={setCancellationReason}
                placeholder="Why was this booking cancelled?"
                placeholderTextColor="#8A94A6"
                multiline
              />

              <Pressable
                style={styles.button}
                onPress={async () => {
                  if (!cancellationReason.trim()) {
                    Alert.alert(
                      'Missing reason',
                      'Please enter a cancellation reason.',
                    );
                    return;
                  }

                  try {
                    await db.runAsync(
                      `UPDATE bookings
             SET cancellation_reason = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
                      cancellationReason.trim(),
                      booking.id,
                    );

                    setCancellationReason(cancellationReason.trim());
                    await loadDetails();
                    Alert.alert('Saved', 'Cancellation reason saved.');
                  } catch (error) {
                    console.error('Failed to save cancellation reason:', error);
                    Alert.alert('Error', 'Could not save the cancellation reason.');
                  }
                }}
              >
                <Text style={styles.buttonText}>Save Cancellation Reason</Text>
              </Pressable>
            </>
          )}

          <Text style={styles.statusLabel}>Travel status</Text>
          <View style={styles.statusOptions}>
            {(['UPCOMING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const).map(
              (status) => (
                <Pressable
                  key={status}
                  disabled={savingStatus || booking.travel_status === status}
                  style={[
                    styles.statusOption,
                    booking.travel_status === status && styles.statusOptionActive,
                  ]}
                  onPress={() => void updateBookingStatus('travel_status', status)}
                >
                  <Text
                    style={[
                      styles.statusOptionText,
                      booking.travel_status === status && styles.statusOptionTextActive,
                    ]}
                  >
                    {readable(status)}
                  </Text>
                </Pressable>
              ),
            )}
          </View>

          {savingStatus && (
            <Text style={styles.muted}>Updating status...</Text>
          )}
        </View>
        <Pressable
          style={styles.button}
          onPress={() =>
            router.push({
              pathname: '/edit-booking',
              params: { id: String(booking.id) },
            })
          }
        >
          <Text style={styles.buttonText}>Edit Booking Details</Text>
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Journey</Text>
          <Text style={styles.route}>
            {booking.origin || 'Origin not set'} → {booking.destination || 'Destination not set'}
          </Text>
          <Info label="Transport" value={readable(booking.transport_type)} />
          <Info label="Journey date" value={booking.journey_at || 'Not set'} />
          <Info label="Return date" value={booking.return_at || 'Not set'} />
          <Info label="Travel status" value={booking.travel_status ? readable(booking.travel_status) : 'Not set'} />
          <Info label="Operator" value={booking.operator_name || 'Not set'} />
          <Info label="Booking reference" value={booking.booking_reference || 'Not set'} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Customer</Text>
          <Info label="Name" value={booking.customer_name} />
          <Info label="Phone" value={booking.phone} />
          <Info label="Email" value={booking.email || 'Not provided'} />
        </View>

        <View style={styles.card}>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Passengers ({passengers.length})</Text>

            <Text style={styles.fieldLabel}>Passenger name *</Text>
            <TextInput
              style={styles.textInput}
              value={passengerName}
              onChangeText={setPassengerName}
              placeholder="Enter passenger name"
              placeholderTextColor="#8A94A6"
            />

            <Text style={styles.fieldLabel}>Age</Text>
            <TextInput
              style={styles.textInput}
              value={passengerAge}
              onChangeText={setPassengerAge}
              placeholder="Enter age"
              placeholderTextColor="#8A94A6"
              keyboardType="number-pad"
            />

            <Text style={styles.fieldLabel}>Passenger type</Text>
            <View style={styles.typeRow}>
              {(['ADULT', 'CHILD', 'INFANT'] as const).map((type) => (
                <Pressable
                  key={type}
                  style={[
                    styles.typeButton,
                    passengerType === type && styles.typeButtonActive,
                  ]}
                  onPress={() => setPassengerType(type)}
                >
                  <Text
                    style={[
                      styles.typeButtonText,
                      passengerType === type && styles.typeButtonTextActive,
                    ]}
                  >
                    {type}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Seat number</Text>
            <TextInput
              style={styles.textInput}
              value={seatNumber}
              onChangeText={setSeatNumber}
              placeholder="e.g. 12A"
              placeholderTextColor="#8A94A6"
            />

            <Text style={styles.fieldLabel}>Ticket number</Text>
            <TextInput
              style={styles.textInput}
              value={ticketNumber}
              onChangeText={setTicketNumber}
              placeholder="Enter ticket number"
              placeholderTextColor="#8A94A6"
            />

            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput
              style={[styles.textInput, styles.notesInput]}
              value={passengerNotes}
              onChangeText={setPassengerNotes}
              placeholder="Optional notes"
              placeholderTextColor="#8A94A6"
              multiline
            />

            <Pressable
              style={[
                styles.button,
                savingPassenger && styles.disabledButton,
              ]}
              onPress={() => void savePassenger()}
              disabled={savingPassenger}
            >
              <Text style={styles.buttonText}>
                {savingPassenger
                  ? 'Saving...'
                  : editingPassengerId !== null
                    ? 'Update Passenger'
                    : 'Add Passenger'}
              </Text>
            </Pressable>
            {editingPassengerId !== null && (
              <Pressable
                style={styles.backButton}
                onPress={() => {
                  setEditingPassengerId(null);
                  setPassengerName('');
                  setPassengerAge('');
                  setPassengerType('ADULT');
                  setSeatNumber('');
                  setTicketNumber('');
                  setPassengerNotes('');
                }}
              >
                <Text style={styles.backText}>Cancel Editing</Text>
              </Pressable>
            )}

            <View style={styles.passengerList}>
              {passengers.length === 0 ? (
                <Text style={styles.muted}>
                  No passengers added to this booking yet.
                </Text>
              ) : (
                passengers.map((passenger) => (
                  <View key={passenger.id} style={styles.passengerItem}>
                    <View style={styles.passengerInfo}>
                      <Text style={styles.passengerName}>
                        {passenger.name}
                      </Text>
                      <Text style={styles.muted}>
                        {passenger.passenger_type
                          ? readable(passenger.passenger_type)
                          : 'Type not set'}
                        {passenger.age !== null ? ` · Age ${passenger.age}` : ''}
                      </Text>
                      {!!passenger.seat_number && (
                        <Text style={styles.muted}>
                          Seat: {passenger.seat_number}
                        </Text>
                      )}
                      {!!passenger.ticket_number && (
                        <Text style={styles.muted}>
                          Ticket: {passenger.ticket_number}
                        </Text>
                      )}
                      {!!passenger.notes && (
                        <Text style={styles.muted}>{passenger.notes}</Text>
                      )}
                    </View>

                    <View style={styles.passengerActions}>
                      <Pressable
                        style={styles.editPassengerButton}
                        onPress={() => editPassenger(passenger)}
                      >
                        <Text style={styles.editPassengerButtonText}>Edit</Text>
                      </Pressable>

                      <Pressable
                        style={styles.removeButton}
                        onPress={() =>
                          Alert.alert(
                            'Remove passenger?',
                            `Remove ${passenger.name} from this booking?`,
                            [
                              { text: 'Keep', style: 'cancel' },
                              {
                                text: 'Remove',
                                style: 'destructive',
                                onPress: () => void deletePassenger(passenger.id),
                              },
                            ],
                          )
                        }
                      >

                        <Text style={styles.removeButtonText}>Remove</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Financial summary</Text>
          <Info label="Selling price" value={money(booking.selling_price_paise)} />
          <Info label="Supplier cost" value={money(booking.supplier_cost_paise)} />
          <Info label="Gross margin" value={money(booking.selling_price_paise - booking.supplier_cost_paise)} />
          <Info label="Customer payments" value={money(received)} />
          <Info label="Customer refunds" value={money(refunded)} />
          <Info label="Outstanding balance" value={money(Math.max(0, booking.selling_price_paise - received + refunded))} />
          <Pressable
            style={styles.button}
            onPress={() => router.push('/payments')}
          >
            <Text style={styles.buttonText}>Open Payment Management</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Payment history ({payments.length})</Text>
          {payments.length === 0 ? (
            <Text style={styles.muted}>No transactions recorded for this booking.</Text>
          ) : (
            payments.map((payment) => (
              <View key={payment.id} style={styles.paymentRow}>
                <Text style={styles.paymentTitle}>{readable(payment.payment_type)}</Text>
                <Text style={styles.paymentAmount}>{money(payment.amount_paise)}</Text>
                <Text style={styles.muted}>
                  {payment.payment_method.replaceAll('_', ' ')} · {payment.payment_date}
                </Text>
                {!!payment.transaction_reference && (
                  <Text style={styles.muted}>Reference: {payment.transaction_reference}</Text>
                )}
                {!!payment.notes && <Text style={styles.muted}>{payment.notes}</Text>}
              </View>
            ))
          )}
        </View>

        {!!booking.notes && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.body}>{booking.notes}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F7FA' },
  center: {
    flex: 1,
    backgroundColor: '#F5F7FA',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  content: { padding: 20, paddingBottom: 40, gap: 16 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 8 },
  backText: { color: '#176B55', fontSize: 15, fontWeight: '700' },
  eyebrow: { color: '#6B7B76', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: '#172B27', fontSize: 25, fontWeight: '800' },
  status: {
    color: '#176B55',
    backgroundColor: '#E5F4EE',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E0E8E4',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475467',
    marginTop: 12,
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#D9E0E8',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#172B4D',
  },
  notesInput: {
    minHeight: 76,
    textAlignVertical: 'top',
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeButton: {
    borderWidth: 1,
    borderColor: '#D9E0E8',
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  typeButtonActive: {
    backgroundColor: '#176B55',
    borderColor: '#176B55',
  },
  typeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475467',
  },
  typeButtonTextActive: {
    color: '#FFFFFF',
  },
  disabledButton: {
    opacity: 0.6,
  },
  passengerList: {
    marginTop: 16,
    gap: 10,
  },
  passengerItem: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#E8ECF2',
    paddingTop: 12,
  },
  passengerInfo: {
    flex: 1,
    gap: 4,
  },
  passengerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  passengerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#172B4D',
  },
  removeButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FDECEC',
  },
  removeButtonText: {
    color: '#B42318',
    fontSize: 12,
    fontWeight: '600',
  },
  editPassengerButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#E8F2EF',
  },
  editPassengerButtonText: {
    color: '#176B55',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionTitle: { color: '#172B27', fontSize: 17, fontWeight: '800', marginBottom: 2 },
  route: { color: '#176B55', fontSize: 19, fontWeight: '800', marginBottom: 4 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  infoLabel: { color: '#6B7B76', fontSize: 13, flex: 1 },
  infoValue: { color: '#172B27', fontSize: 13, fontWeight: '600', flex: 1.3, textAlign: 'right' },
  button: { backgroundColor: '#176B55', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 4 },
  buttonText: { color: '#FFFFFF', fontWeight: '800' },
  muted: { color: '#6B7B76', fontSize: 12 },
  body: { color: '#172B27', fontSize: 14, lineHeight: 21 },
  paymentRow: { borderTopWidth: 1, borderTopColor: '#E0E8E4', paddingTop: 12, gap: 5 },
  paymentTitle: { color: '#172B27', fontSize: 14, fontWeight: '800' },
  paymentAmount: { color: '#176B55', fontSize: 16, fontWeight: '800' },
  statusLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475467',
    marginTop: 12,
    marginBottom: 8,
  },
  statusOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusOption: {
    borderWidth: 1,
    borderColor: '#D9E0E8',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 11,
    backgroundColor: '#FFFFFF',
  },
  statusOptionActive: {
    backgroundColor: '#176B55',
    borderColor: '#176B55',
  },
  statusOptionText: {
    color: '#475467',
    fontSize: 12,
    fontWeight: '600',
  },
  statusOptionTextActive: {
    color: '#FFFFFF',
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
