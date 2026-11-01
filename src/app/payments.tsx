import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { router, useFocusEffect } from 'expo-router';
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

const TYPE_ICONS: Record<string, string> = {
  CUSTOMER_PAYMENT: '💰',
  CUSTOMER_REFUND: '↩️',
  SUPPLIER_PAYMENT: '📤',
  SUPPLIER_REFUND: '📥',
};

const METHOD_ICONS: Record<string, string> = {
  CASH: '💵',
  UPI: '📱',
  BANK_TRANSFER: '🏦',
  CARD: '💳',
  OTHER: '✨',
};

const TRANSPORT_ICONS: Record<string, string> = {
  BUS: '🚌',
  TRAIN: '🚆',
  FLIGHT: '✈️',
  OTHER: '🧳',
};

const SPEED_DIAL = [
  { key: 'record', icon: '➕', label: 'Record Transaction' },
  { key: 'list', icon: '🧾', label: 'Recent Transactions' },
  { key: 'bookings', icon: '🎫', label: 'Bookings' },
  { key: 'home', icon: '🏠', label: 'Home' },
] as const;

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
};

const GRADIENT = ['#1D6FE0', '#12A37F'] as const;
const GRADIENT_DEEP = ['#0B4FB3', '#0D7F63'] as const;
const GRADIENT_DANGER = ['#E8574F', '#C0392B'] as const;
const SCREEN_WIDTH = Dimensions.get('window').width;

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
function PulseDot() {
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
            opacity: pulse.interpolate({
              inputRange: [0, 1],
              outputRange: [0.7, 0],
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
      <View style={styles.localDot} />
    </View>
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
        style={styles.primaryButton}
      >
        {icon ? <Ionicons name={icon} size={18} color="#FFFFFF" /> : null}
        <Text style={styles.primaryButtonText}>{label}</Text>
      </LinearGradient>
    </Ripple>
  );
}

function Field({ style, ...props }: TextInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      {...props}
      style={[styles.input, style, focused && styles.inputFocused]}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholderTextColor={colors.muted}
    />
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <PressScale onPress={onPress}>
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

/* ---------- Screen ---------- */

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

  // Animation state
  const scrollY = useRef(new Animated.Value(0)).current;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scrollRef = useRef<any>(null);
  const formY = useRef(0);
  const listY = useRef(0);
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

  const onDialPress = (key: (typeof SPEED_DIAL)[number]['key']) => {
    toggleFab(false);

    if (key === 'record') {
      scrollRef.current?.scrollTo({
        y: Math.max(0, formY.current - 90),
        animated: true,
      });
    } else if (key === 'list') {
      scrollRef.current?.scrollTo({
        y: Math.max(0, listY.current - 90),
        animated: true,
      });
    } else if (key === 'bookings') {
      router.push('/bookings');
    } else if (key === 'home') {
      router.replace('/');
    }
  };

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

  // Overall figures for the hero / snapshot cards (display only).
  const overallCustomerNet = payments.reduce((sum, p) => {
    if (p.payment_type === 'CUSTOMER_PAYMENT') return sum + p.amount_paise;
    if (p.payment_type === 'CUSTOMER_REFUND') return sum - p.amount_paise;
    return sum;
  }, 0);
  const overallSupplierNet = payments.reduce((sum, p) => {
    if (p.payment_type === 'SUPPLIER_PAYMENT') return sum + p.amount_paise;
    if (p.payment_type === 'SUPPLIER_REFUND') return sum - p.amount_paise;
    return sum;
  }, 0);

  const paidRatio =
    selectedBooking && selectedBooking.selling_price_paise > 0
      ? (selectedBookingTotals.received - selectedBookingTotals.refunded) /
      selectedBooking.selling_price_paise
      : 0;

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
                <Text style={styles.brand}>TICKET DESK</Text>
                <Text style={styles.headerSubtitle}>Payments · Offline</Text>
              </View>
              <View style={styles.localBadge}>
                <PulseDot />
                <Text style={styles.localText}>LOCAL</Text>
              </View>
            </View>
          </Animated.View>
        </SafeAreaView>
      </LinearGradient>

      <Animated.ScrollView
        ref={scrollRef}
        style={styles.page}
        contentContainerStyle={styles.pageContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
      >
        <FadeIn delay={30}>
          <Text style={styles.heading}>Payment Management</Text>
          <Text style={styles.subtitle}>Record money received, refunds, and supplier transactions.</Text>
        </FadeIn>

        {loading ? (
          <ActivityIndicator style={styles.loader} size="large" color={colors.blue} />
        ) : bookings.length === 0 ? (
          <FadeIn delay={80}>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🎫</Text>
              <Text style={styles.emptyTitle}>No bookings available</Text>
              <Text style={styles.emptyText}>Create a booking first, then you can record its payments here.</Text>
              <View style={styles.emptyButton}>
                <GradientButton
                  label="Go to Bookings"
                  icon="arrow-forward-circle"
                  onPress={() => router.push('/bookings')}
                />
              </View>
            </View>
          </FadeIn>
        ) : (
          <>
            {/* Hero */}
            <FadeIn delay={60}>
              <LinearGradient
                colors={GRADIENT}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroCard}
              >
                <View style={styles.heroCircle} />
                <Shimmer />
                <Text style={styles.heroLabel}>NET RECEIVED FROM CUSTOMERS</Text>
                <CountUp
                  value={overallCustomerNet}
                  format={money}
                  style={styles.heroValue}
                />
                <Text style={styles.heroHint}>Payments minus refunds, all bookings</Text>
              </LinearGradient>
            </FadeIn>

            <FadeIn delay={110}>
              <View style={styles.snapshotRow}>
                <View style={styles.snapshotCard}>
                  <Text style={styles.snapshotLabel}>SUPPLIER PAID</Text>
                  <CountUp
                    value={overallSupplierNet}
                    format={money}
                    style={[styles.snapshotValue, { color: colors.danger }]}
                  />
                </View>
                <View style={styles.snapshotCard}>
                  <Text style={styles.snapshotLabel}>TRANSACTIONS</Text>
                  <CountUp
                    value={payments.length}
                    style={[styles.snapshotValue, { color: colors.blueDark }]}
                  />
                </View>
                <View style={styles.snapshotCard}>
                  <Text style={styles.snapshotLabel}>BOOKINGS</Text>
                  <CountUp
                    value={bookings.length}
                    style={[styles.snapshotValue, { color: colors.greenDark }]}
                  />
                </View>
              </View>
            </FadeIn>

            {/* Record form */}
            <FadeIn
              delay={160}
              onLayout={(event) => {
                formY.current = event.nativeEvent.layout.y;
              }}
            >
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <LinearGradient
                    colors={GRADIENT}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.cardIcon}
                  >
                    <Ionicons name="card" size={16} color="#FFFFFF" />
                  </LinearGradient>
                  <Text style={styles.cardTitle}>Record a transaction</Text>
                </View>

                <Text style={styles.fieldLabel}>Select booking *</Text>
                <Animated.ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.bookingChoices}
                >
                  {bookings.map((booking) => {
                    const selected = selectedBookingId === booking.id;
                    const content = (
                      <>
                        <Text style={styles.bookingChoiceEmoji}>
                          {TRANSPORT_ICONS[booking.transport_type] ?? '🧳'}
                        </Text>
                        <Text
                          style={[
                            styles.bookingChoiceTitle,
                            selected && styles.bookingChoiceTitleSelected,
                          ]}
                        >
                          {booking.booking_number}
                        </Text>
                        <Text
                          style={[
                            styles.bookingChoiceSub,
                            selected && styles.bookingChoiceSubSelected,
                          ]}
                        >
                          {booking.customer_name}
                        </Text>
                        <Text
                          style={[
                            styles.bookingChoiceSub,
                            selected && styles.bookingChoiceSubSelected,
                          ]}
                        >
                          {booking.origin || 'Origin'} → {booking.destination || 'Destination'}
                        </Text>
                      </>
                    );

                    return (
                      <Ripple
                        key={booking.id}
                        radius={16}
                        color={selected ? 'rgba(255,255,255,0.38)' : 'rgba(29,111,224,0.14)'}
                        style={styles.bookingChoiceWrap}
                        onPress={() => setSelectedBookingId(booking.id)}
                      >
                        {selected ? (
                          <LinearGradient
                            colors={GRADIENT}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.bookingChoice}
                          >
                            {content}
                          </LinearGradient>
                        ) : (
                          <View style={[styles.bookingChoice, styles.bookingChoiceIdle]}>
                            {content}
                          </View>
                        )}
                      </Ripple>
                    );
                  })}
                </Animated.ScrollView>

                {selectedBooking ? (
                  <View style={styles.selectedSummary}>
                    <View style={styles.summaryLine}>
                      <Text style={styles.summaryLabel}>Booking selling price</Text>
                      <CountUp
                        value={selectedBooking.selling_price_paise}
                        format={money}
                        style={styles.summaryValue}
                      />
                    </View>
                    <View style={styles.summaryLine}>
                      <Text style={styles.summaryLabel}>Net customer payments</Text>
                      <CountUp
                        value={selectedBookingTotals.received - selectedBookingTotals.refunded}
                        format={money}
                        style={styles.summaryValue}
                      />
                    </View>
                    <ProgressBar ratio={paidRatio} />
                    <View style={[styles.summaryLine, styles.balanceLine]}>
                      <Text style={styles.balanceLabel}>Customer balance</Text>
                      <CountUp
                        value={selectedBookingTotals.balance}
                        format={money}
                        style={[
                          styles.balanceValue,
                          selectedBookingTotals.balance < 0 && styles.negativeValue,
                        ]}
                      />
                    </View>
                  </View>
                ) : null}

                <Text style={styles.fieldLabel}>Transaction type *</Text>
                <View style={styles.optionWrap}>
                  {PAYMENT_TYPES.map((item) => (
                    <Chip
                      key={item.value}
                      label={`${TYPE_ICONS[item.value]} ${item.label}`}
                      active={paymentType === item.value}
                      onPress={() => setPaymentType(item.value)}
                    />
                  ))}
                </View>
                <FadeIn key={paymentType}>
                  <Text style={styles.hint}>{selectedType.hint}</Text>
                </FadeIn>

                <Text style={styles.fieldLabel}>Amount (₹) *</Text>
                <Field
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="e.g. 1500.00"
                  keyboardType="decimal-pad"
                />

                <Text style={styles.fieldLabel}>Payment method *</Text>
                <View style={styles.optionWrap}>
                  {METHODS.map((item) => (
                    <Chip
                      key={item.value}
                      label={`${METHOD_ICONS[item.value]} ${item.label}`}
                      active={paymentMethod === item.value}
                      onPress={() => setPaymentMethod(item.value)}
                    />
                  ))}
                </View>

                <Text style={styles.fieldLabel}>Transaction reference</Text>
                <Field
                  value={reference}
                  onChangeText={setReference}
                  placeholder="UPI ID, bank reference, receipt no. (optional)"
                  autoCapitalize="characters"
                />

                <Text style={styles.fieldLabel}>Notes</Text>
                <Field
                  style={styles.multilineInput}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Optional notes"
                  multiline
                  textAlignVertical="top"
                />

                <View style={styles.saveGap}>
                  <GradientButton
                    label={saving ? 'Saving transaction…' : 'Save transaction'}
                    icon="checkmark-circle"
                    onPress={() => void savePayment()}
                    disabled={saving}
                  />
                </View>
              </View>
            </FadeIn>

            {/* Recent transactions */}
            <FadeIn
              delay={200}
              onLayout={(event) => {
                listY.current = event.nativeEvent.layout.y;
              }}
            >
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Recent transactions</Text>
                  <Text style={styles.sectionSubtitle}>Latest 100 saved entries</Text>
                </View>
              </View>
            </FadeIn>

            {payments.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyEmoji}>🧾</Text>
                <Text style={styles.emptyTitle}>No transactions yet</Text>
                <Text style={styles.emptyText}>Your saved payments will appear here.</Text>
              </View>
            ) : (
              payments.slice(0, 100).map((payment, index) => {
                const isIncoming =
                  payment.payment_type === 'CUSTOMER_PAYMENT' ||
                  payment.payment_type === 'SUPPLIER_REFUND';
                return (
                  <FadeIn key={payment.id} delay={Math.min(index, 8) * 55}>
                    <View style={styles.paymentCard}>
                      <LinearGradient
                        colors={isIncoming ? GRADIENT : GRADIENT_DANGER}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={styles.paymentAccent}
                      />
                      <View style={styles.paymentTopRow}>
                        <View
                          style={[
                            styles.paymentIcon,
                            { backgroundColor: isIncoming ? colors.greenLight : colors.dangerLight },
                          ]}
                        >
                          <Text style={styles.paymentIconText}>
                            {TYPE_ICONS[payment.payment_type] ?? '💰'}
                          </Text>
                        </View>
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
                  </FadeIn>
                );
              })
            )}
          </>
        )}

        <Text style={styles.footer}>Payment records are stored locally on this device.</Text>
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
    marginTop: 18,
  },
  headerTitleWrap: { flex: 1 },
  brand: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 4,
  },
  localBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
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
    backgroundColor: '#7DFFC9',
  },
  localDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#7DFFC9' },
  localText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  /* Page */
  page: { flex: 1, marginTop: -44 },
  pageContent: { paddingHorizontal: 18, paddingBottom: 130 },
  heading: { color: colors.text, fontSize: 25, fontWeight: '900', marginTop: 4 },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 18,
  },
  loader: { marginTop: 36 },

  /* Hero */
  heroCard: {
    borderRadius: 22,
    padding: 22,
    overflow: 'hidden',
    shadowColor: '#0B4FB3',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 8,
  },
  heroCircle: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
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
  heroLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  heroValue: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    marginTop: 6,
  },
  heroHint: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginTop: 2,
  },

  /* Snapshot */
  snapshotRow: { flexDirection: 'row', gap: 10, marginTop: 14, marginBottom: 16 },
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

  /* Form card */
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 22,
    shadowColor: '#10243A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  cardIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  fieldLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 14,
  },

  /* Booking choices */
  bookingChoices: { gap: 10, paddingBottom: 4 },
  bookingChoiceWrap: { width: 190, borderRadius: 16 },
  bookingChoice: {
    borderRadius: 16,
    padding: 12,
    minHeight: 112,
  },
  bookingChoiceIdle: {
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: '#F8FBFD',
  },
  bookingChoiceEmoji: { fontSize: 18, marginBottom: 4 },
  bookingChoiceTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  bookingChoiceTitleSelected: { color: '#FFFFFF' },
  bookingChoiceSub: { color: colors.muted, fontSize: 11, marginTop: 4 },
  bookingChoiceSubSelected: { color: 'rgba(255,255,255,0.9)' },

  /* Selected summary */
  selectedSummary: {
    backgroundColor: colors.blueLight,
    borderRadius: 16,
    padding: 14,
    marginTop: 14,
    gap: 6,
  },
  summaryLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
    gap: 8,
  },
  summaryLabel: { color: colors.muted, fontSize: 12, flex: 1 },
  summaryValue: { color: colors.text, fontSize: 13, fontWeight: '800' },
  balanceLine: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(29,111,224,0.18)',
    marginTop: 4,
    paddingTop: 10,
  },
  balanceLabel: { color: colors.text, fontSize: 13, fontWeight: '900', flex: 1 },
  balanceValue: { color: colors.greenDark, fontSize: 16, fontWeight: '900' },
  negativeValue: { color: colors.danger },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.8)',
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: { flex: 1, borderRadius: 4 },

  /* Options */
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  chipIdle: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F8FBFD',
  },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#FFFFFF', fontWeight: '800' },
  hint: { color: colors.muted, fontSize: 11, marginTop: 8, fontWeight: '600' },

  /* Inputs */
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text,
  },
  inputFocused: {
    borderColor: colors.blue,
    backgroundColor: '#F8FBFF',
  },
  multilineInput: { minHeight: 82, textAlignVertical: 'top' },

  /* Buttons */
  saveGap: { marginTop: 22 },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  disabledButton: { opacity: 0.6 },

  /* Empty */
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  emptyEmoji: { fontSize: 34, marginBottom: 8 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 7 },
  emptyButton: { alignSelf: 'stretch', marginTop: 6 },

  /* Transactions */
  sectionHeader: { marginTop: 2, marginBottom: 12 },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  sectionSubtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  paymentCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    paddingLeft: 18,
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#10243A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  paymentAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  paymentTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  paymentIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentIconText: { fontSize: 18 },
  paymentTextWrap: { flex: 1 },
  paymentTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  paymentMeta: { color: colors.muted, fontSize: 11, marginTop: 4 },
  paymentAmount: { fontSize: 14, fontWeight: '900', maxWidth: '45%', textAlign: 'right' },
  incomingAmount: { color: colors.greenDark },
  outgoingAmount: { color: colors.danger },
  paymentNote: { color: colors.muted, fontSize: 12, marginTop: 8 },
  footer: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 22 },

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