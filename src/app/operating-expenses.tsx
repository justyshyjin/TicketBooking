import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
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
  type LayoutChangeEvent,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';

type Expense = {
  id: number;
  description: string;
  category: string;
  payee: string | null;
  amount_paise: number;
  payment_status: 'PENDING' | 'PAID';
  payment_method: string | null;
  expense_date: string;
  payment_date: string | null;
  transaction_reference: string | null;
  notes: string | null;
};

const CATEGORIES = [
  'RENT',
  'SALARY',
  'ELECTRICITY',
  'INTERNET',
  'TRAVEL',
  'OFFICE',
  'MARKETING',
  'OTHER',
];

const CATEGORY_ICONS: Record<string, string> = {
  RENT: '🏢',
  SALARY: '👥',
  ELECTRICITY: '⚡',
  INTERNET: '🌐',
  TRAVEL: '✈️',
  OFFICE: '🗂️',
  MARKETING: '📣',
  OTHER: '✨',
};

const METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CARD', label: 'Card' },
  { value: 'OTHER', label: 'Other' },
];

const METHOD_ICONS: Record<string, string> = {
  CASH: '💵',
  UPI: '📱',
  BANK_TRANSFER: '🏦',
  CARD: '💳',
  OTHER: '✨',
};

const SPEED_DIAL = [
  { key: 'add', icon: '➕', label: 'Add Expense' },
  { key: 'list', icon: '🧾', label: 'Expense History' },
  { key: 'reports', icon: '📊', label: 'Reports' },
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
  amber: '#A66F00',
  amberLight: '#FFF5DC',
};

const GRADIENT = ['#1D6FE0', '#12A37F'] as const;
const GRADIENT_DEEP = ['#0B4FB3', '#0D7F63'] as const;
const GRADIENT_AMBER = ['#F2B33D', '#E8913A'] as const;
const SCREEN_WIDTH = Dimensions.get('window').width;

function money(paise: number) {
  return (paise / 100).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  });
}

function readable(value: string) {
  return value.replaceAll('_', ' ').toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function today() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function displayDate(value: string | null) {
  if (!value) return 'Not set';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
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

/* ---------- Date picker ---------- */

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const pad = (value: number) => String(value).padStart(2, '0');

function parseDateValue(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function sameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function relativeLabel(date: Date) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((date.getTime() - start.getTime()) / 86400000);

  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return diff > 0 ? `In ${diff} days` : `${-diff} days ago`;
}

function longDate(date: Date) {
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** One day in the calendar: gradient bubble pops in when selected. */
function DayCell({
  date,
  selected,
  isToday,
  onPress,
}: {
  date: Date;
  selected: boolean;
  isToday: boolean;
  onPress: () => void;
}) {
  const pop = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(pop, {
      toValue: selected ? 1 : 0,
      friction: 5,
      tension: 140,
      useNativeDriver: true,
    }).start();
  }, [selected, pop]);

  return (
    <Pressable
      style={styles.dayCell}
      onPress={onPress}
      onPressIn={() =>
        Animated.spring(press, {
          toValue: 0.82,
          speed: 50,
          useNativeDriver: true,
        }).start()
      }
      onPressOut={() =>
        Animated.spring(press, {
          toValue: 1,
          speed: 30,
          bounciness: 12,
          useNativeDriver: true,
        }).start()
      }
    >
      <Animated.View style={[styles.dayInner, { transform: [{ scale: press }] }]}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: pop,
              transform: [
                {
                  scale: pop.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.4, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.daySelected}
          />
        </Animated.View>
        {isToday && !selected ? <View style={styles.dayTodayRing} /> : null}
        <Text style={[styles.dayText, selected && styles.dayTextSelected]}>
          {date.getDate()}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/** Animated calendar picker. Emits "YYYY-MM-DD". */
function DatePickerField({
  title,
  value,
  onChange,
  placeholder = 'Select date',
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const parsed = parseDateValue(value);

  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => monthStart(parsed ?? new Date()));
  const [draft, setDraft] = useState<Date | null>(parsed);

  const pop = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;

  const openPicker = () => {
    const current = parseDateValue(value);
    setDraft(current);
    setMonth(monthStart(current ?? new Date()));
    pop.setValue(0);
    setOpen(true);
    Animated.spring(pop, {
      toValue: 1,
      friction: 7,
      tension: 70,
      useNativeDriver: true,
    }).start();
  };

  const closePicker = () => {
    Animated.timing(pop, {
      toValue: 0,
      duration: 170,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => setOpen(false));
  };

  const slideTo = (direction: number) => {
    slide.setValue(direction);
    Animated.spring(slide, {
      toValue: 0,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();
  };

  const changeMonth = (direction: number) => {
    setMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + direction, 1),
    );
    slideTo(direction);
  };

  const pickDate = (date: Date) => {
    setDraft(date);
    if (date.getMonth() !== month.getMonth() || date.getFullYear() !== month.getFullYear()) {
      const direction = date.getTime() > month.getTime() ? 1 : -1;
      setMonth(monthStart(date));
      slideTo(direction);
    }
  };

  const confirm = () => {
    if (!draft) return;
    onChange(`${draft.getFullYear()}-${pad(draft.getMonth() + 1)}-${pad(draft.getDate())}`);
    closePicker();
  };

  const firstWeekday = month.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let index = 0; index < firstWeekday; index += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return (
    <>
      <Ripple radius={12} color="rgba(29,111,224,0.14)" onPress={openPicker}>
        <View style={[styles.dateField, parsed && styles.dateFieldFilled]}>
          <Text style={styles.dateEmoji}>📅</Text>
          <Text
            style={[styles.dateText, !parsed && styles.placeholder]}
            numberOfLines={1}
          >
            {parsed ? longDate(parsed) : placeholder}
          </Text>
          {parsed ? (
            <LinearGradient
              colors={GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.relativePill}
            >
              <Text style={styles.relativePillText}>{relativeLabel(parsed)}</Text>
            </LinearGradient>
          ) : (
            <Text style={styles.selectorArrow}>⌄</Text>
          )}
        </View>
      </Ripple>

      <Modal visible={open} transparent animationType="none" onRequestClose={closePicker}>
        <Animated.View style={[styles.pickerOverlay, { opacity: pop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closePicker} />

          <Animated.View
            style={[
              styles.pickerCard,
              {
                opacity: pop,
                transform: [
                  {
                    scale: pop.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1],
                    }),
                  },
                  {
                    translateY: pop.interpolate({
                      inputRange: [0, 1],
                      outputRange: [40, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <LinearGradient
              colors={GRADIENT_DEEP}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.pickerHeader}
            >
              <View style={styles.pickerHeaderCircle} />
              <Text style={styles.pickerEyebrow}>{title.toUpperCase()}</Text>
              <Text style={styles.pickerBig}>
                {draft
                  ? draft.toLocaleDateString('en-IN', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })
                  : 'Pick a date'}
              </Text>
              <Text style={styles.pickerSub}>
                {draft ? `${draft.getFullYear()} · ${relativeLabel(draft)}` : 'Tap a day below'}
              </Text>
            </LinearGradient>

            <View style={styles.pickerBody}>
              <View style={styles.monthRow}>
                <PressScale onPress={() => changeMonth(-1)}>
                  <View style={styles.monthButton}>
                    <Text style={styles.monthButtonText}>‹</Text>
                  </View>
                </PressScale>
                <Text style={styles.monthTitle}>
                  {MONTH_NAMES[month.getMonth()]} {month.getFullYear()}
                </Text>
                <PressScale onPress={() => changeMonth(1)}>
                  <View style={styles.monthButton}>
                    <Text style={styles.monthButtonText}>›</Text>
                  </View>
                </PressScale>
              </View>

              <View style={styles.weekRow}>
                {WEEKDAYS.map((day) => (
                  <Text key={day} style={styles.weekday}>
                    {day}
                  </Text>
                ))}
              </View>

              <Animated.View
                style={[
                  styles.dayGrid,
                  {
                    opacity: slide.interpolate({
                      inputRange: [-1, 0, 1],
                      outputRange: [0.2, 1, 0.2],
                    }),
                    transform: [
                      {
                        translateX: slide.interpolate({
                          inputRange: [-1, 0, 1],
                          outputRange: [-46, 0, 46],
                        }),
                      },
                    ],
                  },
                ]}
              >
                {cells.map((date, index) =>
                  date ? (
                    <DayCell
                      key={`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`}
                      date={date}
                      selected={draft ? sameDay(date, draft) : false}
                      isToday={sameDay(date, now)}
                      onPress={() => pickDate(date)}
                    />
                  ) : (
                    <View key={`empty-${index}`} style={styles.dayCell} />
                  ),
                )}
              </Animated.View>

              <View style={styles.quickRow}>
                {[
                  { label: 'Today', date: todayStart },
                  { label: 'Yesterday', date: addDays(todayStart, -1) },
                  { label: 'Last week', date: addDays(todayStart, -7) },
                ].map((quick) => (
                  <PressScale key={quick.label} onPress={() => pickDate(quick.date)}>
                    <View style={styles.quickChip}>
                      <Text style={styles.quickChipText}>{quick.label}</Text>
                    </View>
                  </PressScale>
                ))}
              </View>

              <View style={styles.pickerActions}>
                <View style={styles.flex}>
                  <PressScale onPress={closePicker}>
                    <View style={styles.pickerCancel}>
                      <Text style={styles.pickerCancelText}>Cancel</Text>
                    </View>
                  </PressScale>
                </View>
                <View style={styles.pickerConfirm}>
                  <Ripple
                    radius={14}
                    onPress={confirm}
                    disabled={!draft}
                    style={!draft ? styles.disabledButton : undefined}
                  >
                    <LinearGradient
                      colors={GRADIENT}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.pickerConfirmButton}
                    >
                      <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                      <Text style={styles.primaryButtonText}>Confirm</Text>
                    </LinearGradient>
                  </Ripple>
                </View>
              </View>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </>
  );
}

/* ---------- Screen ---------- */

export default function OperatingExpensesScreen() {
  const db = useSQLiteContext();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'PAID' | 'PENDING'>('ALL');

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('OTHER');
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<'PENDING' | 'PAID'>('PENDING');
  const [method, setMethod] = useState('CASH');
  const [expenseDate, setExpenseDate] = useState(today());
  const [paymentDate, setPaymentDate] = useState(today());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  // Animation state
  const scrollY = useRef(new Animated.Value(0)).current;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scrollRef = useRef<any>(null);
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

  const loadExpenses = useCallback(async () => {
    try {
      const rows = await db.getAllAsync<Expense>(
        `SELECT *
         FROM operating_expenses
         ORDER BY expense_date DESC, id DESC`,
      );
      setExpenses(rows);
    } catch (error) {
      console.error('Failed to load operating expenses:', error);
      Alert.alert('Error', 'Could not load operating expenses.');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void loadExpenses();
    }, [loadExpenses]),
  );

  const paidTotal = expenses
    .filter((item) => item.payment_status === 'PAID')
    .reduce((sum, item) => sum + item.amount_paise, 0);

  const pendingTotal = expenses
    .filter((item) => item.payment_status === 'PENDING')
    .reduce((sum, item) => sum + item.amount_paise, 0);

  const filteredExpenses = expenses.filter((item) => {
    const matchesStatus =
      filter === 'ALL' || item.payment_status === filter;

    const term = search.trim().toLowerCase();
    const matchesSearch =
      !term ||
      item.description.toLowerCase().includes(term) ||
      (item.payee ?? '').toLowerCase().includes(term) ||
      item.category.toLowerCase().includes(term) ||
      (item.transaction_reference ?? '').toLowerCase().includes(term);

    return matchesStatus && matchesSearch;
  });

  function resetForm() {
    setEditingId(null);
    setDescription('');
    setCategory('OTHER');
    setPayee('');
    setAmount('');
    setStatus('PENDING');
    setMethod('CASH');
    setExpenseDate(today());
    setPaymentDate(today());
    setReference('');
    setNotes('');
  }

  function openAddForm() {
    resetForm();
    setModalVisible(true);
  }

  function openEditForm(item: Expense) {
    setEditingId(item.id);
    setDescription(item.description);
    setCategory(item.category);
    setPayee(item.payee ?? '');
    setAmount((item.amount_paise / 100).toFixed(2));
    setStatus(item.payment_status);
    setMethod(item.payment_method ?? 'CASH');
    setExpenseDate(item.expense_date.slice(0, 10));
    setPaymentDate(item.payment_date?.slice(0, 10) ?? today());
    setReference(item.transaction_reference ?? '');
    setNotes(item.notes ?? '');
    setModalVisible(true);
  }

  async function saveExpense() {
    if (!description.trim()) {
      Alert.alert('Required', 'Please enter an expense description.');
      return;
    }

    const parsedAmount = Number(amount.trim().replace(/,/g, ''));

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid amount', 'Enter an amount greater than ₹0.');
      return;
    }

    const amountPaise = Math.round(parsedAmount * 100);

    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid amount in rupees.');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
      Alert.alert('Invalid date', 'Use the date format YYYY-MM-DD.');
      return;
    }

    if (
      status === 'PAID' &&
      !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)
    ) {
      Alert.alert('Invalid payment date', 'Use YYYY-MM-DD.');
      return;
    }

    setSaving(true);

    try {
      const finalPaymentDate = status === 'PAID' ? paymentDate : null;
      const finalMethod = status === 'PAID' ? method : null;

      if (editingId !== null) {
        await db.runAsync(
          `UPDATE operating_expenses
           SET description = ?,
               category = ?,
               payee = ?,
               amount_paise = ?,
               payment_status = ?,
               payment_method = ?,
               expense_date = ?,
               payment_date = ?,
               transaction_reference = ?,
               notes = ?,
               updated_at = ?
           WHERE id = ?`,
          description.trim(),
          category,
          payee.trim() || null,
          amountPaise,
          status,
          finalMethod,
          expenseDate,
          finalPaymentDate,
          reference.trim() || null,
          notes.trim() || null,
          new Date().toISOString(),
          editingId,
        );
      } else {
        await db.runAsync(
          `INSERT INTO operating_expenses (
             description,
             category,
             payee,
             amount_paise,
             payment_status,
             payment_method,
             expense_date,
             payment_date,
             transaction_reference,
             notes
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          description.trim(),
          category,
          payee.trim() || null,
          amountPaise,
          status,
          finalMethod,
          expenseDate,
          finalPaymentDate,
          reference.trim() || null,
          notes.trim() || null,
        );
      }

      setModalVisible(false);
      resetForm();
      await loadExpenses();

      Alert.alert(
        'Saved',
        editingId !== null
          ? 'Expense updated successfully.'
          : 'Expense added successfully.',
      );
    } catch (error) {
      console.error('Failed to save expense:', error);
      Alert.alert('Save failed', 'Could not save this expense.');
    } finally {
      setSaving(false);
    }
  }

  function deleteExpense(id: number) {
    Alert.alert(
      'Delete expense',
      'Are you sure you want to delete this expense?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await db.runAsync(
                  'DELETE FROM operating_expenses WHERE id = ?',
                  id,
                );
                await loadExpenses();
              } catch (error) {
                console.error('Failed to delete expense:', error);
                Alert.alert('Error', 'Could not delete this expense.');
              }
            })();
          },
        },
      ],
    );
  }

  const onDialPress = (key: (typeof SPEED_DIAL)[number]['key']) => {
    toggleFab(false);

    if (key === 'add') {
      openAddForm();
    } else if (key === 'list') {
      scrollRef.current?.scrollTo({
        y: Math.max(0, listY.current - 90),
        animated: true,
      });
    } else if (key === 'reports') {
      router.push('/expense-reports');
    } else if (key === 'home') {
      router.replace('/');
    }
  };

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
                <Text style={styles.headerSubtitle}>Operating Expenses · Offline</Text>
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
          <View style={styles.titleRow}>
            <View style={styles.flex}>
              <Text style={styles.heading}>Operating Expenses</Text>
              <Text style={styles.subtitle}>
                Manage rent, salaries, bills and other business expenses.
              </Text>
            </View>
            <Ripple radius={12} onPress={openAddForm}>
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
        </FadeIn>

        {/* Hero */}
        <FadeIn delay={80}>
          <LinearGradient
            colors={GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroCircle} />
            <Shimmer />
            <Text style={styles.heroLabel}>PAID EXPENSES</Text>
            <CountUp value={paidTotal} format={money} style={styles.heroValue} />
            <Text style={styles.heroHint}>Included in Total Expenses</Text>
          </LinearGradient>
        </FadeIn>

        <FadeIn delay={130}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>PENDING</Text>
              <CountUp
                value={pendingTotal}
                format={money}
                style={styles.pendingValue}
              />
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>RECORDS</Text>
              <CountUp value={expenses.length} style={styles.recordsValue} />
            </View>
          </View>
        </FadeIn>

        <FadeIn delay={170}>
          <View
            style={[
              styles.searchWrap,
              searchFocused && styles.searchWrapFocused,
            ]}
          >
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search description, payee or category..."
              placeholderTextColor={colors.muted}
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={10}>
                <Text style={styles.clearSearch}>✕</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.filterRow}>
            {(['ALL', 'PAID', 'PENDING'] as const).map((item) => (
              <Chip
                key={item}
                label={item === 'ALL' ? 'All' : readable(item)}
                active={filter === item}
                onPress={() => setFilter(item)}
              />
            ))}
          </View>
        </FadeIn>

        <FadeIn
          delay={200}
          onLayout={(event) => {
            listY.current = event.nativeEvent.layout.y;
          }}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Expense history</Text>
            <Text style={styles.sectionSubtitle}>
              {filteredExpenses.length} record(s)
            </Text>
          </View>
        </FadeIn>

        {loading ? (
          <ActivityIndicator
            size="large"
            color={colors.blue}
            style={styles.loader}
          />
        ) : filteredExpenses.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🧾</Text>
            <Text style={styles.emptyTitle}>No expenses found</Text>
            <Text style={styles.emptyText}>
              Add your first operating expense using the Add button.
            </Text>
          </View>
        ) : (
          filteredExpenses.map((item, index) => {
            const paid = item.payment_status === 'PAID';
            return (
              <FadeIn key={item.id} delay={Math.min(index, 8) * 55}>
                <View style={styles.expenseCard}>
                  <LinearGradient
                    colors={paid ? GRADIENT : GRADIENT_AMBER}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={styles.expenseAccent}
                  />
                  <View style={styles.expenseTop}>
                    <View
                      style={[
                        styles.categoryIcon,
                        { backgroundColor: paid ? colors.greenLight : colors.amberLight },
                      ]}
                    >
                      <Text style={styles.categoryIconText}>
                        {CATEGORY_ICONS[item.category] ?? '✨'}
                      </Text>
                    </View>

                    <View style={styles.flex}>
                      <Text style={styles.expenseTitle}>{item.description}</Text>
                      <Text style={styles.expenseMeta}>
                        {readable(item.category)}
                        {item.payee ? ` · ${item.payee}` : ''}
                      </Text>
                      <Text style={styles.expenseMeta}>
                        Expense date: {displayDate(item.expense_date)}
                      </Text>
                      {paid ? (
                        <Text style={styles.expenseMeta}>
                          Paid on: {displayDate(item.payment_date)}
                          {item.payment_method
                            ? ` · ${readable(item.payment_method)}`
                            : ''}
                        </Text>
                      ) : null}
                    </View>

                    <View style={styles.amountWrap}>
                      <Text style={styles.expenseAmount}>
                        {money(item.amount_paise)}
                      </Text>
                      <View
                        style={[
                          styles.statusBadge,
                          paid ? styles.paidBadge : styles.pendingBadge,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            paid ? styles.paidText : styles.pendingText,
                          ]}
                        >
                          {readable(item.payment_status)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {item.transaction_reference ? (
                    <Text style={styles.expenseNote}>
                      Ref: {item.transaction_reference}
                    </Text>
                  ) : null}

                  {item.notes ? (
                    <Text style={styles.expenseNote}>{item.notes}</Text>
                  ) : null}

                  <View style={styles.actionRow}>
                    <PressScale onPress={() => openEditForm(item)}>
                      <View style={styles.editButton}>
                        <Text style={styles.editButtonText}>Edit</Text>
                      </View>
                    </PressScale>
                    <PressScale onPress={() => deleteExpense(item.id)}>
                      <View style={styles.deleteButton}>
                        <Text style={styles.deleteButtonText}>Delete</Text>
                      </View>
                    </PressScale>
                  </View>
                </View>
              </FadeIn>
            );
          })
        )}

        <Text style={styles.footer}>
          Only paid operating expenses are included in Total Expenses.
        </Text>
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

      {/* Add / edit expense */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <LinearGradient
              colors={GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.modalHeader}
            >
              <View>
                <Text style={styles.modalTitle}>
                  {editingId !== null ? 'Edit expense' : 'Add expense'}
                </Text>
                <Text style={styles.modalSubtitle}>Operating expense details</Text>
              </View>
              <Pressable
                onPress={() => setModalVisible(false)}
                style={styles.closeCircle}
                hitSlop={8}
              >
                <Text style={styles.closeButton}>✕</Text>
              </Pressable>
            </LinearGradient>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.modalContent}
            >
              <Text style={styles.fieldLabelFirst}>Description *</Text>
              <Field
                value={description}
                onChangeText={setDescription}
                placeholder="e.g. Office rent"
              />

              <Text style={styles.fieldLabel}>Category *</Text>
              <View style={styles.optionWrap}>
                {CATEGORIES.map((item) => (
                  <Chip
                    key={item}
                    label={`${CATEGORY_ICONS[item]} ${readable(item)}`}
                    active={category === item}
                    onPress={() => setCategory(item)}
                  />
                ))}
              </View>

              <Text style={styles.fieldLabel}>Payee / Paid to</Text>
              <Field
                value={payee}
                onChangeText={setPayee}
                placeholder="Person or company name"
              />

              <Text style={styles.fieldLabel}>Amount (₹) *</Text>
              <Field
                value={amount}
                onChangeText={setAmount}
                placeholder="e.g. 2500.00"
                keyboardType="decimal-pad"
              />

              <Text style={styles.fieldLabel}>Expense date *</Text>
              <DatePickerField
                title="Expense date"
                value={expenseDate}
                onChange={setExpenseDate}
                placeholder="Select expense date"
              />

              <Text style={styles.fieldLabel}>Payment status *</Text>
              <View style={styles.optionWrap}>
                {(['PENDING', 'PAID'] as const).map((item) => (
                  <Chip
                    key={item}
                    label={`${item === 'PAID' ? '✅' : '⏳'} ${readable(item)}`}
                    active={status === item}
                    onPress={() => setStatus(item)}
                  />
                ))}
              </View>

              {status === 'PAID' ? (
                <FadeIn>
                  <Text style={styles.fieldLabel}>Payment method *</Text>
                  <View style={styles.optionWrap}>
                    {METHODS.map((item) => (
                      <Chip
                        key={item.value}
                        label={`${METHOD_ICONS[item.value]} ${item.label}`}
                        active={method === item.value}
                        onPress={() => setMethod(item.value)}
                      />
                    ))}
                  </View>

                  <Text style={styles.fieldLabel}>Payment date *</Text>
                  <DatePickerField
                    title="Payment date"
                    value={paymentDate}
                    onChange={setPaymentDate}
                    placeholder="Select payment date"
                  />

                  <Text style={styles.fieldLabel}>Transaction reference</Text>
                  <Field
                    value={reference}
                    onChangeText={setReference}
                    placeholder="UPI or bank reference (optional)"
                    autoCapitalize="characters"
                  />
                </FadeIn>
              ) : null}

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
                  label={saving ? 'Saving...' : 'Save expense'}
                  icon="checkmark-circle"
                  onPress={() => void saveExpense()}
                  disabled={saving}
                />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },

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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heading: { color: colors.text, fontSize: 25, fontWeight: '900', marginTop: 4 },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 18,
  },
  addButton: {
    borderRadius: 12,
    paddingHorizontal: 17,
    paddingVertical: 12,
  },
  addButtonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },

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

  /* Summary */
  summaryRow: { flexDirection: 'row', gap: 10, marginTop: 14, marginBottom: 16 },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    shadowColor: '#10243A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  pendingValue: {
    color: colors.danger,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 7,
  },
  recordsValue: {
    color: colors.blueDark,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 7,
  },

  /* Search + filters */
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  searchWrapFocused: {
    borderColor: colors.blue,
    shadowColor: colors.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 3,
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: {
    flex: 1,
    paddingVertical: 13,
    color: colors.text,
    fontSize: 14,
  },
  clearSearch: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    paddingLeft: 8,
  },
  filterRow: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 22 },

  /* Chips */
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

  /* History */
  sectionHeader: { marginBottom: 12 },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  sectionSubtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  loader: { marginTop: 30 },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    alignItems: 'center',
  },
  emptyEmoji: { fontSize: 34, marginBottom: 8 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
    textAlign: 'center',
  },
  expenseCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 14,
    paddingLeft: 18,
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#10243A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  expenseAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
  },
  expenseTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  categoryIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIconText: { fontSize: 19 },
  expenseTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  expenseMeta: { color: colors.muted, fontSize: 11, marginTop: 5 },
  amountWrap: { alignItems: 'flex-end', maxWidth: '38%' },
  expenseAmount: { color: colors.text, fontSize: 15, fontWeight: '900' },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, marginTop: 7 },
  paidBadge: { backgroundColor: colors.greenLight },
  pendingBadge: { backgroundColor: colors.amberLight },
  statusText: { fontSize: 10, fontWeight: '800' },
  paidText: { color: colors.greenDark },
  pendingText: { color: colors.amber },
  expenseNote: { color: colors.muted, fontSize: 12, marginTop: 8 },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 9,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 12,
    paddingTop: 10,
  },
  editButton: {
    backgroundColor: colors.blueLight,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
  },
  editButtonText: { color: colors.blueDark, fontSize: 12, fontWeight: '800' },
  deleteButton: {
    backgroundColor: colors.dangerLight,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
  },
  deleteButtonText: { color: colors.danger, fontSize: 12, fontWeight: '800' },
  footer: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 22 },

  /* Form modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(8,30,58,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: 'hidden',
    maxHeight: '92%',
  },
  modalHeader: {
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: { color: '#FFFFFF', fontSize: 21, fontWeight: '900' },
  modalSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginTop: 4,
  },
  closeCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  modalContent: { padding: 18, paddingBottom: 40 },
  fieldLabelFirst: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 16,
  },
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
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  multilineInput: { minHeight: 82, textAlignVertical: 'top' },
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

  /* Date picker */
  dateField: {
    minHeight: 49,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
  },
  dateFieldFilled: {
    borderColor: '#BFD8FA',
    backgroundColor: '#F8FBFF',
  },
  dateEmoji: { fontSize: 18 },
  dateText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700' },
  placeholder: { color: colors.muted, fontWeight: '500' },
  selectorArrow: { fontSize: 20, color: colors.blue, marginLeft: 8 },
  relativePill: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  relativePillText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(8,30,58,0.55)',
    justifyContent: 'center',
    padding: 18,
  },
  pickerCard: {
    backgroundColor: colors.surface,
    borderRadius: 26,
    overflow: 'hidden',
    shadowColor: '#0B4FB3',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 16,
  },
  pickerHeader: {
    padding: 20,
    paddingBottom: 18,
    overflow: 'hidden',
  },
  pickerHeaderCircle: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.12)',
    right: -40,
    top: -50,
  },
  pickerEyebrow: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  pickerBig: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 4,
  },
  pickerSub: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  pickerBody: { padding: 16 },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  monthButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.blueLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthButtonText: {
    color: colors.blueDark,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 28,
  },
  monthTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekday: {
    flex: 1,
    textAlign: 'center',
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: '14.2857%',
    aspectRatio: 1,
    padding: 2,
  },
  dayInner: {
    flex: 1,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySelected: { flex: 1, borderRadius: 100 },
  dayTodayRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 100,
    borderWidth: 1.5,
    borderColor: colors.green,
  },
  dayText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  dayTextSelected: { color: '#FFFFFF', fontWeight: '900' },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  quickChip: {
    backgroundColor: colors.greenLight,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickChipText: { color: colors.greenDark, fontSize: 12, fontWeight: '800' },
  pickerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  pickerCancel: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: colors.blueLight,
  },
  pickerCancelText: { color: colors.blueDark, fontWeight: '800', fontSize: 14 },
  pickerConfirm: { flex: 1.4 },
  pickerConfirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 50,
    borderRadius: 14,
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