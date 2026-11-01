import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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

const colors = {
  background: '#F2F7FA',
  surface: '#FFFFFF',
  blue: '#1D6FE0',
  blueDark: '#0B4FB3',
  green: '#12A37F',
  greenDark: '#0D7F63',
  blueLight: '#E6F0FD',
  greenLight: '#E3F6F0',
  text: '#10243A',
  muted: '#6B7D8E',
  border: '#E1EAF0',
  danger: '#D6453D',
  dangerLight: '#FDECEA',
  amber: '#A66F00',
  amberLight: '#FFF5DC',
};

const GRADIENT = ['#1D6FE0', '#12A37F'] as const;
const GRADIENT_DEEP = ['#0B4FB3', '#0D7F63'] as const;
const SCREEN_WIDTH = Dimensions.get('window').width;

const STATUS_STYLES: Record<string, { bg: string; fg: string }> = {
  CONFIRMED: { bg: colors.greenLight, fg: colors.greenDark },
  PENDING: { bg: colors.amberLight, fg: colors.amber },
  WAITLISTED: { bg: colors.blueLight, fg: colors.blueDark },
  CANCELLED: { bg: colors.dangerLight, fg: colors.danger },
};

const SPEED_DIAL = [
  { key: 'edit', icon: '✏️', label: 'Edit Booking' },
  { key: 'payments', icon: '💳', label: 'Payments' },
  { key: 'passenger', icon: '👤', label: 'Add Passenger' },
  { key: 'home', icon: '🏠', label: 'Home' },
] as const;

const money = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const readable = (value: string) =>
  value.replaceAll('_', ' ').toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());

/* ---------- Animation / UI helpers ---------- */

function FadeIn({
  children,
  delay = 0,
  style,
  onLayout,
}: {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 560,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [delay, progress]);

  return (
    <Animated.View
      onLayout={onLayout}
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [28, 0],
              }),
            },
            {
              scale: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0.96, 1],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Springy press feedback. */
function PressScale({
  children,
  onPress,
  style,
  disabled,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (value: number) =>
    Animated.spring(scale, {
      toValue: value,
      speed: 40,
      bounciness: 8,
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => animateTo(0.95)}
      onPressOut={() => animateTo(1)}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

/** Ripple that grows from the exact touch point + springy press. */
function Ripple({
  children,
  onPress,
  style,
  radius = 16,
  disabled,
  color = 'rgba(255,255,255,0.38)',
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  disabled?: boolean;
  color?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const ripple = useRef(new Animated.Value(0)).current;
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: 120, h: 120 });

  const reach = Math.hypot(size.w, size.h);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={(event) => {
        setOrigin({
          x: event.nativeEvent.locationX,
          y: event.nativeEvent.locationY,
        });
        ripple.setValue(0);
        Animated.timing(ripple, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
        Animated.spring(scale, {
          toValue: 0.96,
          speed: 40,
          bounciness: 8,
          useNativeDriver: true,
        }).start();
      }}
      onPressOut={() =>
        Animated.spring(scale, {
          toValue: 1,
          speed: 30,
          bounciness: 12,
          useNativeDriver: true,
        }).start()
      }
    >
      <Animated.View
        style={[style, { transform: [{ scale }] }]}
        onLayout={(event) =>
          setSize({
            w: event.nativeEvent.layout.width,
            h: event.nativeEvent.layout.height,
          })
        }
      >
        {children}
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: radius, overflow: 'hidden' },
          ]}
        >
          <Animated.View
            style={{
              position: 'absolute',
              left: origin.x - reach,
              top: origin.y - reach,
              width: reach * 2,
              height: reach * 2,
              borderRadius: reach,
              backgroundColor: color,
              opacity: ripple.interpolate({
                inputRange: [0, 0.15, 1],
                outputRange: [0, 0.7, 0],
              }),
              transform: [
                {
                  scale: ripple.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.05, 1],
                  }),
                },
              ],
            }}
          />
        </View>
      </Animated.View>
    </Pressable>
  );
}

/** Numbers that count up smoothly whenever the value changes. */
function CountUp({
  value,
  format,
  style,
}: {
  value: number;
  format?: (value: number) => string;
  style?: StyleProp<TextStyle>;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const id = anim.addListener(({ value: current }) => setDisplay(current));
    return () => anim.removeListener(id);
  }, [anim]);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: value,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [value, anim]);

  return (
    <Text style={style} numberOfLines={1} adjustsFontSizeToFit>
      {format ? format(Math.round(display)) : String(Math.round(display))}
    </Text>
  );
}

/** Slowly drifting translucent blob for the header backdrop. */
function FloatingBlob({
  size,
  dx,
  dy,
  duration,
  style,
}: {
  size: number;
  dx: number;
  dy: number;
  duration: number;
  style: StyleProp<ViewStyle>;
}) {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift, duration]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: 'rgba(255,255,255,0.09)',
        },
        style,
        {
          transform: [
            {
              translateX: drift.interpolate({
                inputRange: [0, 1],
                outputRange: [0, dx],
              }),
            },
            {
              translateY: drift.interpolate({
                inputRange: [0, 1],
                outputRange: [0, dy],
              }),
            },
          ],
        },
      ]}
    />
  );
}

/** A soft light streak that sweeps across its parent card. */
function Shimmer() {
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(2800),
        Animated.timing(sweep, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.shimmer,
        {
          transform: [
            {
              translateX: sweep.interpolate({
                inputRange: [0, 1],
                outputRange: [-140, SCREEN_WIDTH],
              }),
            },
            { rotate: '20deg' },
          ],
        },
      ]}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/** Dot with an expanding halo. */
function PulseDot({ color }: { color: string }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.pulseWrap}>
      <Animated.View
        style={[
          styles.pulseHalo,
          {
            backgroundColor: color,
            opacity: pulse.interpolate({
              inputRange: [0, 1],
              outputRange: [0.6, 0],
            }),
            transform: [
              {
                scale: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 2.6],
                }),
              },
            ],
          },
        ]}
      />
      <View style={[styles.pulseDot, { backgroundColor: color }]} />
    </View>
  );
}

/** Arrow that glides back and forth along the route. */
function RouteArrow() {
  const glide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glide, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(glide, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glide]);

  return (
    <Animated.View
      style={{
        transform: [
          {
            translateX: glide.interpolate({
              inputRange: [0, 1],
              outputRange: [-5, 5],
            }),
          },
        ],
      }}
    >
      <Ionicons name="arrow-forward-circle" size={30} color="#FFFFFF" />
    </Animated.View>
  );
}

/** Gradient progress bar that fills smoothly. */
function ProgressBar({ ratio }: { ratio: number }) {
  const fill = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fill, {
      toValue: Math.min(Math.max(ratio, 0), 1),
      duration: 1000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [ratio, fill]);

  return (
    <View style={styles.progressTrack}>
      <Animated.View
        style={{
          height: '100%',
          width: fill.interpolate({
            inputRange: [0, 1],
            outputRange: ['0%', '100%'],
          }),
        }}
      >
        <LinearGradient
          colors={GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.progressFill}
        />
      </Animated.View>
    </View>
  );
}

function GradientButton({
  label,
  onPress,
  disabled,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Ripple
      onPress={onPress}
      disabled={disabled}
      radius={14}
      style={disabled ? styles.disabledButton : undefined}
    >
      <LinearGradient
        colors={GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.button}
      >
        {icon ? <Ionicons name={icon} size={17} color="#FFFFFF" /> : null}
        <Text style={styles.buttonText}>{label}</Text>
      </LinearGradient>
    </Ripple>
  );
}

function Section({
  title,
  icon,
  delay = 0,
  onLayout,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  delay?: number;
  onLayout?: (event: LayoutChangeEvent) => void;
  children: ReactNode;
}) {
  return (
    <FadeIn delay={delay} onLayout={onLayout}>
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <LinearGradient
            colors={GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.sectionIcon}
          >
            <Ionicons name={icon} size={16} color="#FFFFFF" />
          </LinearGradient>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {children}
      </View>
    </FadeIn>
  );
}

function Field({ style, ...props }: TextInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      {...props}
      style={[styles.textInput, style, focused && styles.textInputFocused]}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholderTextColor={colors.muted}
    />
  );
}

function Chip({
  label,
  active,
  disabled,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <PressScale onPress={onPress} disabled={disabled}>
      {active ? (
        <LinearGradient
          colors={GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.chip}
        >
          <Text style={[styles.chipText, styles.chipTextActive]}>{label}</Text>
        </LinearGradient>
      ) : (
        <View style={[styles.chip, styles.chipIdle]}>
          <Text style={styles.chipText}>{label}</Text>
        </View>
      )}
    </PressScale>
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

/* ---------- Screen ---------- */

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

  // Animation state
  const scrollY = useRef(new Animated.Value(0)).current;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scrollRef = useRef<any>(null);
  const passengersY = useRef(0);
  const [fabOpen, setFabOpen] = useState(false);
  const fabMain = useRef(new Animated.Value(0)).current;
  const fabItems = useRef(SPEED_DIAL.map(() => new Animated.Value(0))).current;

  const toggleFab = (open: boolean) => {
    setFabOpen(open);
    Animated.parallel([
      Animated.spring(fabMain, {
        toValue: open ? 1 : 0,
        friction: 7,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.stagger(
        45,
        (open ? fabItems : [...fabItems].reverse()).map((value) =>
          Animated.spring(value, {
            toValue: open ? 1 : 0,
            friction: 6,
            tension: 90,
            useNativeDriver: true,
          }),
        ),
      ),
    ]).start();
  };

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

  const resetPassengerForm = () => {
    setEditingPassengerId(null);
    setPassengerName('');
    setPassengerAge('');
    setPassengerType('ADULT');
    setSeatNumber('');
    setTicketNumber('');
    setPassengerNotes('');
  };

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

      resetPassengerForm();

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

  const saveCancellationReason = async () => {
    if (!booking) return;

    if (!cancellationReason.trim()) {
      Alert.alert('Missing reason', 'Please enter a cancellation reason.');
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
  };

  const onDialPress = (key: (typeof SPEED_DIAL)[number]['key']) => {
    toggleFab(false);

    if (key === 'edit' && booking) {
      router.push({
        pathname: '/edit-booking',
        params: { id: String(booking.id) },
      });
    } else if (key === 'payments') {
      router.push('/payments');
    } else if (key === 'passenger') {
      scrollRef.current?.scrollTo({
        y: Math.max(0, passengersY.current - 90),
        animated: true,
      });
    } else if (key === 'home') {
      router.replace('/');
    }
  };

  const received = payments
    .filter((payment) => payment.payment_type === 'CUSTOMER_PAYMENT')
    .reduce((total, payment) => total + payment.amount_paise, 0);

  const refunded = payments
    .filter((payment) => payment.payment_type === 'CUSTOMER_REFUND')
    .reduce((total, payment) => total + payment.amount_paise, 0);

  // Parallax: header content drifts up and softens while scrolling.
  const headerShift = scrollY.interpolate({
    inputRange: [0, 140],
    outputRange: [0, -22],
    extrapolate: 'clamp',
  });
  const headerFade = scrollY.interpolate({
    inputRange: [0, 140],
    outputRange: [1, 0.3],
    extrapolate: 'clamp',
  });

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.blue} />
        <Text style={styles.muted}>Loading booking...</Text>
      </SafeAreaView>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.emptyEmoji}>🔎</Text>
        <Text style={styles.notFoundTitle}>Booking not found</Text>
        <View style={styles.fullWidth}>
          <GradientButton label="Go Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const profit = booking.selling_price_paise - booking.supplier_cost_paise;
  const outstanding = Math.max(
    0,
    booking.selling_price_paise - received + refunded,
  );
  const netReceived = received - refunded;
  const paidRatio =
    booking.selling_price_paise > 0
      ? netReceived / booking.selling_price_paise
      : 0;
  const statusStyle =
    STATUS_STYLES[booking.booking_status] ?? STATUS_STYLES.PENDING;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Gradient header */}
      <LinearGradient
        colors={GRADIENT_DEEP}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <FloatingBlob
          size={230}
          dx={-26}
          dy={22}
          duration={5200}
          style={{ top: -80, right: -60 }}
        />
        <FloatingBlob
          size={150}
          dx={30}
          dy={-18}
          duration={6400}
          style={{ bottom: -40, left: -36 }}
        />
        <FloatingBlob
          size={80}
          dx={-18}
          dy={-14}
          duration={4300}
          style={{ top: 50, left: SCREEN_WIDTH * 0.5 }}
        />
        <SafeAreaView style={styles.headerSafe}>
          <Animated.View
            style={{ opacity: headerFade, transform: [{ translateY: headerShift }] }}
          >
            <View style={styles.headerButtons}>
              <Ripple radius={20} onPress={() => router.back()}>
                <View style={styles.headerIconButton}>
                  <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
                </View>
              </Ripple>
              <Ripple radius={20} onPress={() => router.replace('/')}>
                <View style={styles.headerIconButton}>
                  <Ionicons name="home" size={20} color="#FFFFFF" />
                </View>
              </Ripple>
            </View>

            <View style={styles.headerTitleRow}>
              <View style={styles.headerTitleWrap}>
                <Text style={styles.eyebrow}>BOOKING DETAILS</Text>
                <Text style={styles.title} numberOfLines={1}>
                  {booking.booking_number || `Booking #${booking.id}`}
                </Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: statusStyle.bg }]}>
                <PulseDot color={statusStyle.fg} />
                <Text style={[styles.statusPillText, { color: statusStyle.fg }]}>
                  {readable(booking.booking_status)}
                </Text>
              </View>
            </View>
          </Animated.View>
        </SafeAreaView>
      </LinearGradient>

      <Animated.ScrollView
        ref={scrollRef}
        style={styles.page}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
      >
        {/* Route hero */}
        <FadeIn delay={40}>
          <LinearGradient
            colors={GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.routeCard}
          >
            <View style={styles.routeCircle} />
            <Shimmer />
            <Text style={styles.routeLabel}>
              {readable(booking.transport_type).toUpperCase()}
            </Text>
            <View style={styles.routeRow}>
              <Text style={styles.routeCity} numberOfLines={2}>
                {booking.origin || 'Origin not set'}
              </Text>
              <RouteArrow />
              <Text style={[styles.routeCity, styles.routeCityRight]} numberOfLines={2}>
                {booking.destination || 'Destination not set'}
              </Text>
            </View>
            <View style={styles.routeMeta}>
              <Ionicons name="calendar" size={14} color="rgba(255,255,255,0.9)" />
              <Text style={styles.routeMetaText}>
                {booking.journey_at || 'Journey date not set'}
              </Text>
            </View>
          </LinearGradient>
        </FadeIn>

        {/* Money snapshot */}
        <FadeIn delay={100}>
          <View style={styles.snapshotRow}>
            <View style={styles.snapshotCard}>
              <Text style={styles.snapshotLabel}>SELLING</Text>
              <CountUp
                value={booking.selling_price_paise}
                format={money}
                style={[styles.snapshotValue, { color: colors.blueDark }]}
              />
            </View>
            <View style={styles.snapshotCard}>
              <Text style={styles.snapshotLabel}>RECEIVED</Text>
              <CountUp
                value={netReceived}
                format={money}
                style={[styles.snapshotValue, { color: colors.greenDark }]}
              />
            </View>
            <View style={styles.snapshotCard}>
              <Text style={styles.snapshotLabel}>DUE</Text>
              <CountUp
                value={outstanding}
                format={money}
                style={[
                  styles.snapshotValue,
                  { color: outstanding > 0 ? colors.danger : colors.greenDark },
                ]}
              />
            </View>
          </View>
        </FadeIn>

        <FadeIn delay={140}>
          <GradientButton
            label="Edit Booking Details"
            icon="create"
            onPress={() =>
              router.push({
                pathname: '/edit-booking',
                params: { id: String(booking.id) },
              })
            }
          />
        </FadeIn>

        {/* Manage status */}
        <Section title="Manage Status" icon="options" delay={180}>
          <Text style={styles.statusLabel}>Booking status</Text>
          <View style={styles.chipRow}>
            {(['PENDING', 'CONFIRMED', 'WAITLISTED', 'CANCELLED'] as const).map(
              (status) => (
                <Chip
                  key={status}
                  label={readable(status)}
                  active={booking.booking_status === status}
                  disabled={savingStatus || booking.booking_status === status}
                  onPress={() => void updateBookingStatus('booking_status', status)}
                />
              ),
            )}
          </View>

          {booking.booking_status === 'CANCELLED' && (
            <View style={styles.cancelBox}>
              <Text style={styles.statusLabel}>Cancellation reason</Text>
              <Field
                value={cancellationReason}
                onChangeText={setCancellationReason}
                placeholder="Why was this booking cancelled?"
                multiline
                style={styles.notesInput}
              />
              <GradientButton
                label="Save Cancellation Reason"
                onPress={() => void saveCancellationReason()}
              />
            </View>
          )}

          <Text style={styles.statusLabel}>Travel status</Text>
          <View style={styles.chipRow}>
            {(['UPCOMING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const).map(
              (status) => (
                <Chip
                  key={status}
                  label={readable(status)}
                  active={booking.travel_status === status}
                  disabled={savingStatus || booking.travel_status === status}
                  onPress={() => void updateBookingStatus('travel_status', status)}
                />
              ),
            )}
          </View>

          {savingStatus && <Text style={styles.muted}>Updating status...</Text>}
        </Section>

        {/* Journey */}
        <Section title="Journey" icon="navigate" delay={220}>
          <Info label="Transport" value={readable(booking.transport_type)} />
          <Info label="Journey date" value={booking.journey_at || 'Not set'} />
          <Info label="Return date" value={booking.return_at || 'Not set'} />
          <Info
            label="Travel status"
            value={booking.travel_status ? readable(booking.travel_status) : 'Not set'}
          />
          <Info label="Operator" value={booking.operator_name || 'Not set'} />
          <Info label="Booking reference" value={booking.booking_reference || 'Not set'} />
        </Section>

        {/* Customer */}
        <Section title="Customer" icon="person" delay={260}>
          <View style={styles.customerRow}>
            <LinearGradient
              colors={GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatar}
            >
              <Text style={styles.avatarText}>
                {booking.customer_name.trim().charAt(0).toUpperCase()}
              </Text>
            </LinearGradient>
            <View style={styles.flex}>
              <Text style={styles.customerName}>{booking.customer_name}</Text>
              <Text style={styles.muted}>{booking.phone}</Text>
              <Text style={styles.muted}>{booking.email || 'Not provided'}</Text>
            </View>
          </View>
        </Section>

        {/* Passengers */}
        <Section
          title={`Passengers (${passengers.length})`}
          icon="people"
          delay={300}
          onLayout={(event) => {
            passengersY.current = event.nativeEvent.layout.y;
          }}
        >
          <Text style={styles.fieldLabel}>Passenger name *</Text>
          <Field
            value={passengerName}
            onChangeText={setPassengerName}
            placeholder="Enter passenger name"
          />

          <Text style={styles.fieldLabel}>Age</Text>
          <Field
            value={passengerAge}
            onChangeText={setPassengerAge}
            placeholder="Enter age"
            keyboardType="number-pad"
          />

          <Text style={styles.fieldLabel}>Passenger type</Text>
          <View style={styles.chipRow}>
            {(['ADULT', 'CHILD', 'INFANT'] as const).map((type) => (
              <Chip
                key={type}
                label={type}
                active={passengerType === type}
                onPress={() => setPassengerType(type)}
              />
            ))}
          </View>

          <Text style={styles.fieldLabel}>Seat number</Text>
          <Field
            value={seatNumber}
            onChangeText={setSeatNumber}
            placeholder="e.g. 12A"
          />

          <Text style={styles.fieldLabel}>Ticket number</Text>
          <Field
            value={ticketNumber}
            onChangeText={setTicketNumber}
            placeholder="Enter ticket number"
          />

          <Text style={styles.fieldLabel}>Notes</Text>
          <Field
            style={styles.notesInput}
            value={passengerNotes}
            onChangeText={setPassengerNotes}
            placeholder="Optional notes"
            multiline
          />

          <View style={styles.buttonGap}>
            <GradientButton
              label={
                savingPassenger
                  ? 'Saving...'
                  : editingPassengerId !== null
                    ? 'Update Passenger'
                    : 'Add Passenger'
              }
              icon={editingPassengerId !== null ? 'checkmark-circle' : 'person-add'}
              onPress={() => void savePassenger()}
              disabled={savingPassenger}
            />
          </View>

          {editingPassengerId !== null && (
            <Pressable style={styles.cancelEdit} onPress={resetPassengerForm}>
              <Text style={styles.cancelEditText}>Cancel Editing</Text>
            </Pressable>
          )}

          <View style={styles.passengerList}>
            {passengers.length === 0 ? (
              <Text style={styles.muted}>
                No passengers added to this booking yet.
              </Text>
            ) : (
              passengers.map((passenger, index) => (
                <FadeIn key={passenger.id} delay={Math.min(index, 6) * 50}>
                  <View style={styles.passengerItem}>
                    <View style={styles.passengerInfo}>
                      <Text style={styles.passengerName}>{passenger.name}</Text>
                      <Text style={styles.muted}>
                        {passenger.passenger_type
                          ? readable(passenger.passenger_type)
                          : 'Type not set'}
                        {passenger.age !== null ? ` · Age ${passenger.age}` : ''}
                      </Text>
                      {!!passenger.seat_number && (
                        <Text style={styles.muted}>Seat: {passenger.seat_number}</Text>
                      )}
                      {!!passenger.ticket_number && (
                        <Text style={styles.muted}>Ticket: {passenger.ticket_number}</Text>
                      )}
                      {!!passenger.notes && (
                        <Text style={styles.muted}>{passenger.notes}</Text>
                      )}
                    </View>

                    <View style={styles.passengerActions}>
                      <PressScale onPress={() => editPassenger(passenger)}>
                        <View style={styles.editPassengerButton}>
                          <Text style={styles.editPassengerButtonText}>Edit</Text>
                        </View>
                      </PressScale>

                      <PressScale
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
                        <View style={styles.removeButton}>
                          <Text style={styles.removeButtonText}>Remove</Text>
                        </View>
                      </PressScale>
                    </View>
                  </View>
                </FadeIn>
              ))
            )}
          </View>
        </Section>

        {/* Financial summary */}
        <Section title="Financial summary" icon="wallet" delay={340}>
          <View>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Paid so far</Text>
              <Text style={styles.progressPercent}>
                {Math.round(Math.min(Math.max(paidRatio, 0), 1) * 100)}%
              </Text>
            </View>
            <ProgressBar ratio={paidRatio} />
          </View>
          <Info label="Selling price" value={money(booking.selling_price_paise)} />
          <Info label="Supplier cost" value={money(booking.supplier_cost_paise)} />
          <Info label="Gross margin" value={money(profit)} />
          <Info label="Customer payments" value={money(received)} />
          <Info label="Customer refunds" value={money(refunded)} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Outstanding balance</Text>
            <Text
              style={[
                styles.totalValue,
                { color: outstanding > 0 ? colors.danger : colors.greenDark },
              ]}
            >
              {money(outstanding)}
            </Text>
          </View>
          <GradientButton
            label="Open Payment Management"
            icon="card"
            onPress={() => router.push('/payments')}
          />
        </Section>

        {/* Payment history */}
        <Section
          title={`Payment history (${payments.length})`}
          icon="receipt"
          delay={380}
        >
          {payments.length === 0 ? (
            <Text style={styles.muted}>No transactions recorded for this booking.</Text>
          ) : (
            payments.map((payment, index) => {
              const incoming =
                payment.payment_type === 'CUSTOMER_PAYMENT' ||
                payment.payment_type === 'SUPPLIER_REFUND';

              return (
                <FadeIn key={payment.id} delay={Math.min(index, 6) * 50}>
                  <View style={styles.paymentRow}>
                    <View style={styles.paymentTop}>
                      <Text style={styles.paymentTitle}>
                        {readable(payment.payment_type)}
                      </Text>
                      <Text
                        style={[
                          styles.paymentAmount,
                          { color: incoming ? colors.greenDark : colors.danger },
                        ]}
                      >
                        {incoming ? '+' : '−'}
                        {money(payment.amount_paise)}
                      </Text>
                    </View>
                    <Text style={styles.muted}>
                      {payment.payment_method.replaceAll('_', ' ')} · {payment.payment_date}
                    </Text>
                    {!!payment.transaction_reference && (
                      <Text style={styles.muted}>
                        Reference: {payment.transaction_reference}
                      </Text>
                    )}
                    {!!payment.notes && <Text style={styles.muted}>{payment.notes}</Text>}
                  </View>
                </FadeIn>
              );
            })
          )}
        </Section>

        {!!booking.notes && (
          <Section title="Notes" icon="document-text" delay={420}>
            <Text style={styles.body}>{booking.notes}</Text>
          </Section>
        )}
      </Animated.ScrollView>

      {/* Genie speed-dial: dim backdrop */}
      <Animated.View
        pointerEvents={fabOpen ? 'auto' : 'none'}
        style={[styles.backdrop, { opacity: fabMain }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => toggleFab(false)} />
      </Animated.View>

      {/* Genie speed-dial: items pop out of the button */}
      <View style={styles.fabWrap} pointerEvents="box-none">
        {SPEED_DIAL.map((item, index) => {
          const progress = fabItems[index];
          return (
            <Animated.View
              key={item.key}
              pointerEvents={fabOpen ? 'auto' : 'none'}
              style={[
                styles.dialItem,
                {
                  opacity: progress,
                  transform: [
                    {
                      translateY: progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -(72 + index * 60)],
                      }),
                    },
                    {
                      scale: progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.2, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Pressable
                style={styles.dialPressable}
                onPress={() => onDialPress(item.key)}
              >
                <View style={styles.dialLabel}>
                  <Text style={styles.dialLabelText}>{item.label}</Text>
                </View>
                <LinearGradient
                  colors={GRADIENT}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.dialCircle}
                >
                  <Text style={styles.dialIcon}>{item.icon}</Text>
                </LinearGradient>
              </Pressable>
            </Animated.View>
          );
        })}

        <PressScale onPress={() => toggleFab(!fabOpen)}>
          <LinearGradient
            colors={GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fab}
          >
            <Animated.Text
              style={[
                styles.fabText,
                {
                  transform: [
                    {
                      rotate: fabMain.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '135deg'],
                      }),
                    },
                  ],
                },
              ]}
            >
              ＋
            </Animated.Text>
          </LinearGradient>
        </PressScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  fullWidth: { alignSelf: 'stretch' },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  emptyEmoji: { fontSize: 38 },
  notFoundTitle: { color: colors.text, fontSize: 22, fontWeight: '900' },

  /* Header */
  header: {
    paddingBottom: 64,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
  },
  headerSafe: {
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0,
    paddingHorizontal: 20,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 18,
  },
  headerTitleWrap: { flex: 1 },
  eyebrow: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 4,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  statusPillText: { fontSize: 12, fontWeight: '800' },
  pulseWrap: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseHalo: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  /* Page */
  page: { flex: 1, marginTop: -44 },
  content: { paddingHorizontal: 18, paddingBottom: 130, gap: 14 },

  /* Route hero */
  routeCard: {
    borderRadius: 22,
    padding: 20,
    overflow: 'hidden',
    shadowColor: '#0B4FB3',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 8,
  },
  routeCircle: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.12)',
    right: -40,
    top: -50,
  },
  shimmer: {
    position: 'absolute',
    top: -40,
    bottom: -40,
    width: 90,
  },
  routeLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  routeCity: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  routeCityRight: { textAlign: 'right' },
  routeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
  },
  routeMetaText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    fontWeight: '600',
  },

  /* Snapshot */
  snapshotRow: { flexDirection: 'row', gap: 10 },
  snapshotCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 12,
    shadowColor: '#10243A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  snapshotLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  snapshotValue: { fontSize: 14, fontWeight: '900', marginTop: 6 },

  /* Cards */
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 12,
    shadowColor: '#10243A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },

  /* Buttons */
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 15,
    borderRadius: 14,
  },
  buttonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
  buttonGap: { marginTop: 16 },
  disabledButton: { opacity: 0.6 },

  /* Chips */
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  chipIdle: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F8FBFD',
  },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#FFFFFF', fontWeight: '800' },
  statusLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginTop: 4,
  },
  cancelBox: { gap: 10 },

  /* Form */
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginTop: 4,
  },
  textInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text,
  },
  textInputFocused: {
    borderColor: colors.blue,
    backgroundColor: '#F8FBFF',
  },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },

  /* Info rows */
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 2,
  },
  infoLabel: { color: colors.muted, fontSize: 13, flex: 1 },
  infoValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    flex: 1.3,
    textAlign: 'right',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.blueLight,
    borderRadius: 12,
    padding: 12,
  },
  totalLabel: { color: colors.text, fontSize: 13, fontWeight: '800' },
  totalValue: { fontSize: 16, fontWeight: '900' },

  /* Progress */
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  progressPercent: { color: colors.greenDark, fontSize: 12, fontWeight: '900' },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.blueLight,
    overflow: 'hidden',
  },
  progressFill: { flex: 1, borderRadius: 5 },

  /* Customer */
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  customerName: { color: colors.text, fontSize: 16, fontWeight: '800' },

  /* Passengers */
  cancelEdit: { alignSelf: 'flex-start', paddingVertical: 8 },
  cancelEditText: { color: colors.blue, fontSize: 14, fontWeight: '800' },
  passengerList: { marginTop: 8, gap: 10 },
  passengerItem: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
    marginTop: 10,
  },
  passengerInfo: { flex: 1, gap: 4 },
  passengerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passengerName: { fontSize: 15, fontWeight: '800', color: colors.text },
  removeButton: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.dangerLight,
  },
  removeButtonText: { color: colors.danger, fontSize: 12, fontWeight: '800' },
  editPassengerButton: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.blueLight,
  },
  editPassengerButtonText: {
    color: colors.blueDark,
    fontSize: 12,
    fontWeight: '800',
  },

  /* Payments */
  paymentRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
    marginTop: 10,
    gap: 4,
  },
  paymentTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  paymentTitle: { color: colors.text, fontSize: 14, fontWeight: '800', flex: 1 },
  paymentAmount: { fontSize: 15, fontWeight: '900' },

  muted: { color: colors.muted, fontSize: 12 },
  body: { color: colors.text, fontSize: 14, lineHeight: 21 },

  /* Genie speed-dial */
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,30,58,0.5)',
  },
  fabWrap: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    alignItems: 'flex-end',
  },
  dialItem: {
    position: 'absolute',
    right: 0,
    bottom: 0,
  },
  dialPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dialLabel: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#10243A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  dialLabelText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  dialCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 5,
    shadowColor: '#0B4FB3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  dialIcon: { fontSize: 20 },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0B4FB3',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '600',
    marginTop: -2,
  },
});