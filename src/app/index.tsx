import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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

type DayRow = {
  day: string;
  bookings: number;
  received: number;
  refunds: number;
  expenses: number;
};

type Period = 'TODAY' | '7D' | '30D' | 'ALL' | 'CUSTOM';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'TODAY', label: 'Today' },
  { value: '7D', label: '7 Days' },
  { value: '30D', label: '30 Days' },
  { value: 'ALL', label: 'All' },
  { value: 'CUSTOM', label: 'Custom' },
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function localDateValue(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function daysAgo(count: number) {
  const date = new Date();
  date.setDate(date.getDate() - count);
  return localDateValue(date);
}

function displayDay(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

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
  amber: '#E8A317',
  amberLight: '#FFF5DC',
};

const GRADIENT = ['#1D6FE0', '#12A37F'] as const;
const GRADIENT_DEEP = ['#0B4FB3', '#0D7F63'] as const;

const SCREEN_WIDTH = Dimensions.get('window').width;

const QUICK_ACTIONS = [
  {
    key: 'bookings',
    icon: '🎫',
    title: 'Bookings',
    subtitle: 'Bus, train, flight',
    route: '/bookings',
    gradient: ['#2F80ED', '#1D6FE0'] as const,
  },
  {
    key: 'payments',
    icon: '💳',
    title: 'Payments',
    subtitle: 'Receive & refund',
    route: '/payments',
    gradient: ['#12A37F', '#0D8F6F'] as const,
  },
  {
    key: 'expenses',
    icon: '🧾',
    title: 'Expenses',
    subtitle: 'Rent, salary, bills',
    route: '/operating-expenses',
    gradient: ['#1D8FD6', '#12A37F'] as const,
  },
  {
    key: 'reports',
    icon: '📊',
    title: 'Reports',
    subtitle: 'Charts & breakdown',
    route: '/expense-reports',
    gradient: ['#3B6FE0', '#1AB38F'] as const,
  },
];

const SPEED_DIAL = [
  { key: 'customer', icon: '👤', label: 'Add Customer', route: null },
  { key: 'booking', icon: '🎫', label: 'New Booking', route: '/bookings' },
  { key: 'payment', icon: '💳', label: 'Record Payment', route: '/payments' },
  { key: 'expense', icon: '🧾', label: 'Add Expense', route: '/operating-expenses' },
] as const;

/* ---------- Animation helpers ---------- */

function FadeIn({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
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

/** Material-style ripple that grows from the exact touch point + springy press. */
function Ripple({
  children,
  onPress,
  style,
  radius = 16,
  color = 'rgba(255,255,255,0.38)',
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  radius?: number;
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
          toValue: 0.95,
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
      <View style={styles.onlineDot} />
    </View>
  );
}

/** Icon that gently bobs up and down. */
function Bob({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(bob, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob, delay]);

  return (
    <Animated.View
      style={{
        transform: [
          {
            translateY: bob.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -4],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/* ---------- Screen ---------- */

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
  const [period, setPeriod] = useState<Period>('7D');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [dayRows, setDayRows] = useState<DayRow[]>([]);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  // Animation state
  const scrollY = useRef(new Animated.Value(0)).current;
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

  const loadDailyData = useCallback(async () => {
    let start: string | null = null;
    let end: string | null = null;

    if (period === 'TODAY') start = daysAgo(0);
    else if (period === '7D') start = daysAgo(6);
    else if (period === '30D') start = daysAgo(29);
    else if (period === 'CUSTOM') {
      start = DATE_PATTERN.test(fromDate.trim()) ? fromDate.trim() : null;
      end = DATE_PATTERN.test(toDate.trim()) ? toDate.trim() : null;
    }

    try {
      // Bookings are counted on the day they were created (the booking number
      // holds its creation time); older ones fall back to the journey date.
      const rows = await db.getAllAsync<DayRow>(
        `SELECT
           day,
           SUM(bookings) AS bookings,
           SUM(received) AS received,
           SUM(refunds) AS refunds,
           SUM(expenses) AS expenses
         FROM (
           SELECT
             date(payment_date, 'localtime') AS day,
             0 AS bookings,
             CASE WHEN payment_type = 'CUSTOMER_PAYMENT'
                  THEN amount_paise ELSE 0 END AS received,
             CASE WHEN payment_type = 'CUSTOMER_REFUND'
                  THEN amount_paise ELSE 0 END AS refunds,
             CASE payment_type
               WHEN 'SUPPLIER_PAYMENT' THEN amount_paise
               WHEN 'SUPPLIER_REFUND' THEN -amount_paise
               ELSE 0 END AS expenses
           FROM payments
           UNION ALL
           SELECT
             COALESCE(
               CASE WHEN booking_number GLOB 'BK-[0-9]*'
                    THEN date(CAST(substr(booking_number, 4) AS INTEGER) / 1000,
                              'unixepoch', 'localtime') END,
               date(journey_at)
             ) AS day,
             1, 0, 0, 0
           FROM bookings
         )
         WHERE day IS NOT NULL
           AND (? IS NULL OR day >= ?)
           AND (? IS NULL OR day <= ?)
         GROUP BY day
         ORDER BY day DESC`,
        start,
        start,
        end,
        end,
      );

      setDayRows(rows);
    } catch (error) {
      console.error('Failed to load date-wise data:', error);
      Alert.alert('Error', 'Could not load date-wise data.');
    }
  }, [db, period, fromDate, toDate]);

  useFocusEffect(
    useCallback(() => {
      void loadCustomers();
      void loadDashboardStats();
      void loadDailyData();
    }, [loadCustomers, loadDashboardStats, loadDailyData]),
  );

  const periodTotals = dayRows.reduce(
    (total, row) => ({
      bookings: total.bookings + row.bookings,
      received: total.received + row.received,
      refunds: total.refunds + row.refunds,
      expenses: total.expenses + row.expenses,
    }),
    { bookings: 0, received: 0, refunds: 0, expenses: 0 },
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

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const statCards = [
    {
      label: 'PAYMENTS RECEIVED',
      value: stats.paymentsReceived,
      money: true,
      icon: '💰',
      tint: colors.greenLight,
      color: colors.greenDark,
      route: '/payments',
    },
    {
      label: 'PENDING BALANCE',
      value: stats.pendingBalance,
      money: true,
      icon: '⏳',
      tint: colors.amberLight,
      color: '#A66F00',
      route: '/payments',
    },
    {
      label: 'TOTAL EXPENSES',
      value: stats.totalExpenses,
      money: true,
      icon: '📉',
      tint: colors.dangerLight,
      color: colors.danger,
      route: '/operating-expenses',
    },
    {
      label: 'TOTAL BOOKINGS',
      value: stats.totalBookings,
      money: false,
      icon: '🎫',
      tint: colors.blueLight,
      color: colors.blueDark,
      route: '/bookings',
    },
  ];

  // Parallax: header content drifts up and softens while scrolling.
  const headerShift = scrollY.interpolate({
    inputRange: [0, 140],
    outputRange: [0, -26],
    extrapolate: 'clamp',
  });
  const headerFade = scrollY.interpolate({
    inputRange: [0, 140],
    outputRange: [1, 0.25],
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
          style={{ top: 40, left: SCREEN_WIDTH * 0.5 }}
        />
        <SafeAreaView style={styles.headerSafe}>
          <Animated.View
            style={[
              styles.headerRow,
              { opacity: headerFade, transform: [{ translateY: headerShift }] },
            ]}
          >
            <View>
              <Text style={styles.headerGreeting}>{greeting()} 👋</Text>
              <Text style={styles.brand}>TICKET DESK</Text>
              <Text style={styles.headerDate}>{today}</Text>
            </View>

            <View style={styles.offlineBadge}>
              <PulseDot />
              <Text style={styles.offlineText}>LOCAL</Text>
            </View>
          </Animated.View>
        </SafeAreaView>
      </LinearGradient>

      <Animated.ScrollView
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
        {/* Hero card overlapping the header */}
        <FadeIn delay={60}>
          <LinearGradient
            colors={GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.summaryCard}
          >
            <View style={styles.summaryCircle} />
            <Shimmer />
            <Text style={styles.summaryLabel}>TOTAL CUSTOMERS</Text>
            <CountUp value={customerCount} style={styles.summaryValue} />
            <Text style={styles.summaryHint}>
              Customers saved on this device
            </Text>
          </LinearGradient>
        </FadeIn>

        {/* Stats (tap to jump to the matching screen) */}
        <View style={styles.statsGrid}>
          {statCards.map((card, index) => (
            <FadeIn
              key={card.label}
              delay={140 + index * 80}
              style={styles.statCardWrap}
            >
              <PressScale onPress={() => router.push(card.route as never)}>
                <LinearGradient
                  colors={['#BFD8FA', '#BDEBDD']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.statBorder}
                >
                  <View style={styles.statCard}>
                    <View style={[styles.statIcon, { backgroundColor: card.tint }]}>
                      <Text style={styles.statIconText}>{card.icon}</Text>
                    </View>
                    <Text style={styles.statLabel}>{card.label}</Text>
                    <CountUp
                      value={card.value}
                      format={card.money ? formatRupees : undefined}
                      style={[styles.statValue, { color: card.color }]}
                    />
                  </View>
                </LinearGradient>
              </PressScale>
            </FadeIn>
          ))}
        </View>

        {/* Quick actions */}
        <FadeIn delay={420}>
          <Text style={styles.sectionTitle}>Quick access</Text>
          <Text style={[styles.sectionSubtitle, styles.sectionGap]}>
            Jump straight to what you need
          </Text>
        </FadeIn>

        <View style={styles.actionsGrid}>
          {QUICK_ACTIONS.map((action, index) => (
            <FadeIn
              key={action.key}
              delay={480 + index * 80}
              style={styles.actionWrap}
            >
              <Ripple
                radius={20}
                style={styles.actionShadow}
                onPress={() => router.push(action.route as never)}
              >
                <LinearGradient
                  colors={action.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.actionCard}
                >
                  <View style={styles.actionCircle} />
                  <View style={styles.actionIconWrap}>
                    <Bob delay={index * 250}>
                      <Text style={styles.actionIcon}>{action.icon}</Text>
                    </Bob>
                  </View>
                  <Text style={styles.actionTitle}>{action.title}</Text>
                  <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
                  <Text style={styles.actionArrow}>›</Text>
                </LinearGradient>
              </Ripple>
            </FadeIn>
          ))}
        </View>

        {/* Date-wise summary */}
        <FadeIn delay={780}>
          <Text style={styles.sectionTitle}>Date-wise summary</Text>
          <Text style={[styles.sectionSubtitle, styles.sectionGap]}>
            Bookings, money in and expenses for each day
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.periodRow}
          >
            {PERIODS.map((item) => (
              <PressScale key={item.value} onPress={() => setPeriod(item.value)}>
                {period === item.value ? (
                  <LinearGradient
                    colors={GRADIENT}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.periodChip}
                  >
                    <Text style={[styles.periodChipText, styles.periodChipTextActive]}>
                      {item.label}
                    </Text>
                  </LinearGradient>
                ) : (
                  <View style={[styles.periodChip, styles.periodChipIdle]}>
                    <Text style={styles.periodChipText}>{item.label}</Text>
                  </View>
                )}
              </PressScale>
            ))}
          </ScrollView>

          {period === 'CUSTOM' ? (
            <View style={styles.customRange}>
              <View style={styles.customRangeField}>
                <Text style={styles.rangeLabel}>From</Text>
                <TextInput
                  style={styles.rangeInput}
                  value={fromDate}
                  onChangeText={setFromDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.muted}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
              </View>
              <View style={styles.customRangeField}>
                <Text style={styles.rangeLabel}>To</Text>
                <TextInput
                  style={styles.rangeInput}
                  value={toDate}
                  onChangeText={setToDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.muted}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
              </View>
            </View>
          ) : null}

          <LinearGradient
            colors={['#E6F0FD', '#E3F6F0']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.periodTotals}
          >
            <View style={styles.periodTotalItem}>
              <Text style={styles.dayLabel}>BOOKINGS</Text>
              <Text style={styles.periodTotalValue}>{periodTotals.bookings}</Text>
            </View>
            <View style={styles.periodTotalItem}>
              <Text style={styles.dayLabel}>RECEIVED</Text>
              <Text style={styles.periodTotalValue}>
                {formatRupees(periodTotals.received - periodTotals.refunds)}
              </Text>
            </View>
            <View style={styles.periodTotalItem}>
              <Text style={styles.dayLabel}>EXPENSES</Text>
              <Text style={[styles.periodTotalValue, { color: colors.danger }]}>
                {formatRupees(periodTotals.expenses)}
              </Text>
            </View>
          </LinearGradient>
        </FadeIn>

        {dayRows.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📅</Text>
            <Text style={styles.emptyTitle}>No activity in this period</Text>
            <Text style={styles.emptyText}>
              Try a longer period or a different date range.
            </Text>
          </View>
        ) : (
          dayRows.map((row, index) => {
            const net = row.received - row.refunds - row.expenses;
            return (
              <FadeIn key={row.day} delay={Math.min(index, 8) * 50}>
                <View style={styles.dayCard}>
                  <View style={styles.dayHeader}>
                    <Text style={styles.dayTitle}>{displayDay(row.day)}</Text>
                    <View
                      style={[
                        styles.netPill,
                        net < 0 ? styles.netPillNegative : styles.netPillPositive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayNet,
                          net < 0 && styles.dayNetNegative,
                        ]}
                      >
                        Net {net < 0 ? '−' : ''}
                        {formatRupees(Math.abs(net))}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.dayGrid}>
                    <View style={styles.dayCell}>
                      <Text style={styles.dayLabel}>BOOKINGS</Text>
                      <Text style={styles.dayValue}>{row.bookings}</Text>
                    </View>
                    <View style={styles.dayCell}>
                      <Text style={styles.dayLabel}>RECEIVED</Text>
                      <Text style={styles.dayValue}>{formatRupees(row.received)}</Text>
                    </View>
                    <View style={styles.dayCell}>
                      <Text style={styles.dayLabel}>REFUNDS</Text>
                      <Text style={styles.dayValue}>{formatRupees(row.refunds)}</Text>
                    </View>
                    <View style={styles.dayCell}>
                      <Text style={styles.dayLabel}>EXPENSES</Text>
                      <Text style={[styles.dayValue, { color: colors.danger }]}>
                        {formatRupees(row.expenses)}
                      </Text>
                    </View>
                  </View>
                </View>
              </FadeIn>
            );
          })
        )}

        {/* Customers */}
        <FadeIn delay={820}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Customers</Text>
              <Text style={styles.sectionSubtitle}>
                Manage your customer records
              </Text>
            </View>

            <Ripple radius={12} onPress={() => setModalVisible(true)}>
              <LinearGradient
                colors={GRADIENT}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.addButton}
              >
                <Text style={styles.addButtonText}>+ Add</Text>
              </LinearGradient>
            </Ripple>
          </View>

          <View
            style={[
              styles.searchWrap,
              searchFocused && styles.searchWrapFocused,
            ]}
          >
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search name or mobile number"
              placeholderTextColor={colors.muted}
              value={search}
              onChangeText={setSearch}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              autoCapitalize="none"
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={10}>
                <Text style={styles.clearSearch}>✕</Text>
              </Pressable>
            ) : null}
          </View>
        </FadeIn>

        {loading ? (
          <ActivityIndicator
            style={styles.loader}
            size="large"
            color={colors.blue}
          />
        ) : customers.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>{search ? '🔎' : '👥'}</Text>
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
            renderItem={({ item, index }) => (
              <FadeIn delay={Math.min(index, 8) * 50}>
                <View style={styles.customerCard}>
                  <LinearGradient
                    colors={GRADIENT}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={styles.customerAccent}
                  />
                  <LinearGradient
                    colors={GRADIENT}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.avatar}
                  >
                    <Text style={styles.avatarText}>
                      {item.name.trim().charAt(0).toUpperCase()}
                    </Text>
                  </LinearGradient>

                  <View style={styles.customerDetails}>
                    <Text style={styles.customerName}>{item.name}</Text>
                    <Text style={styles.customerPhone}>📞 {item.phone}</Text>
                    {item.email ? (
                      <Text style={styles.customerEmail}>✉️ {item.email}</Text>
                    ) : null}
                  </View>
                </View>
              </FadeIn>
            )}
          />
        )}

        <Text style={styles.footer}>Your records stay on this device.</Text>
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
                onPress={() => {
                  toggleFab(false);
                  if (item.route) router.push(item.route as never);
                  else setModalVisible(true);
                }}
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

      {/* Add customer modal */}
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
            <LinearGradient
              colors={GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.modalHeader}
            >
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
            </LinearGradient>

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

              <PressScale
                onPress={() => void addCustomer()}
                disabled={saving}
                style={saving ? styles.disabledButton : undefined}
              >
                <LinearGradient
                  colors={GRADIENT}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.saveButton}
                >
                  <Text style={styles.saveButtonText}>
                    {saving ? 'Saving...' : 'Save Customer'}
                  </Text>
                </LinearGradient>
              </PressScale>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
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
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[
          styles.fieldInput,
          multiline && styles.multilineInput,
          focused && styles.fieldInputFocused,
        ]}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
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
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },

  /* Header */
  header: {
    paddingBottom: 70,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
  },
  headerSafe: {
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 18,
  },
  headerGreeting: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '600',
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 4,
  },
  headerDate: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 4,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
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
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#7DFFC9',
  },
  offlineText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  /* Page */
  page: {
    flex: 1,
    marginTop: -50,
  },
  pageContent: {
    paddingHorizontal: 18,
    paddingBottom: 130,
  },

  /* Hero */
  summaryCard: {
    borderRadius: 22,
    padding: 22,
    overflow: 'hidden',
    shadowColor: '#0B4FB3',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 8,
  },
  summaryCircle: {
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
  summaryLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  summaryValue: {
    color: '#FFFFFF',
    fontSize: 44,
    fontWeight: '900',
    marginTop: 6,
  },
  summaryHint: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginTop: 2,
  },

  /* Stats */
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  statCardWrap: {
    width: '48.5%',
    marginBottom: 12,
  },
  statBorder: {
    borderRadius: 19,
    padding: 1.5,
    shadowColor: '#10243A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  statCard: {
    backgroundColor: colors.surface,
    borderRadius: 17.5,
    padding: 14,
    minHeight: 120,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statIconText: {
    fontSize: 17,
  },
  statLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  statValue: {
    fontSize: 19,
    fontWeight: '900',
    marginTop: 6,
  },

  /* Sections */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 14,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  sectionGap: {
    marginBottom: 14,
  },

  /* Quick actions */
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  actionWrap: {
    width: '48.5%',
    marginBottom: 12,
  },
  actionShadow: {
    borderRadius: 20,
    shadowColor: '#0B4FB3',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 5,
  },
  actionCard: {
    borderRadius: 20,
    padding: 16,
    minHeight: 128,
    overflow: 'hidden',
  },
  actionCircle: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.14)',
    right: -24,
    top: -24,
  },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actionIcon: {
    fontSize: 20,
  },
  actionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  actionSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    marginTop: 3,
  },
  actionArrow: {
    position: 'absolute',
    right: 14,
    bottom: 8,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 28,
    fontWeight: '600',
  },

  /* Date-wise summary */
  periodRow: {
    gap: 8,
    paddingBottom: 14,
  },
  periodChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  periodChipIdle: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  periodChipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  periodChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  customRange: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  customRangeField: {
    flex: 1,
  },
  rangeLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  rangeInput: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text,
  },
  periodTotals: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    gap: 8,
  },
  periodTotalItem: {
    flex: 1,
  },
  periodTotalValue: {
    color: colors.blueDark,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 4,
  },
  dayCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#10243A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  dayTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
    flexShrink: 1,
  },
  netPill: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  netPillPositive: { backgroundColor: colors.greenLight },
  netPillNegative: { backgroundColor: colors.dangerLight },
  dayNet: {
    color: colors.greenDark,
    fontSize: 12,
    fontWeight: '800',
  },
  dayNetNegative: {
    color: colors.danger,
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
  },
  dayCell: {
    width: '50%',
  },
  dayLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  dayValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 3,
  },

  /* Customers */
  addButton: {
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  searchWrapFocused: {
    borderColor: colors.blue,
    shadowColor: colors.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 3,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 14,
    color: colors.text,
  },
  clearSearch: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    paddingLeft: 8,
  },
  loader: {
    marginTop: 32,
  },
  emptyState: {
    backgroundColor: colors.surface,
    padding: 28,
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  emptyEmoji: {
    fontSize: 34,
    marginBottom: 8,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  customerCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    paddingLeft: 18,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    overflow: 'hidden',
    shadowColor: '#10243A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  customerAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  customerDetails: {
    flex: 1,
  },
  customerName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
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
  dialIcon: {
    fontSize: 20,
  },
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

  /* Modal */
  modalSafeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalContent: {
    flex: 1,
  },
  modalHeader: {
    padding: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },
  modalSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginTop: 4,
  },
  closeButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
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
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
    minHeight: 48,
  },
  fieldInputFocused: {
    borderColor: colors.blue,
    backgroundColor: '#F8FBFF',
  },
  multilineInput: {
    minHeight: 92,
  },
  saveButton: {
    borderRadius: 14,
    alignItems: 'center',
    padding: 16,
    marginTop: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
