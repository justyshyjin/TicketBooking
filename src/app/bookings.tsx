import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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

const TRANSPORT_ICONS: Record<string, string> = {
  BUS: '🚌',
  TRAIN: '🚆',
  FLIGHT: '✈️',
  OTHER: '🧳',
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
  { key: 'new', icon: '➕', label: 'New Booking' },
  { key: 'search', icon: '🔍', label: 'Saved Bookings' },
  { key: 'payments', icon: '💳', label: 'Payments' },
  { key: 'home', icon: '🏠', label: 'Home' },
] as const;

const money = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

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
          toValue: 0.97,
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
        style={styles.saveButton}
      >
        {icon ? <Ionicons name={icon} size={18} color="#FFFFFF" /> : null}
        <Text style={styles.saveButtonText}>{label}</Text>
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

function parseJourney(value: string) {
  const match = value
    .trim()
    .replace('T', ' ')
    .match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/);
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

  return {
    date,
    hasTime: match[4] !== undefined,
    hour: match[4] !== undefined ? Number(match[4]) : 9,
    minute: match[5] !== undefined ? Number(match[5]) : 0,
  };
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
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000);

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

function Stepper({
  label,
  value,
  onUp,
  onDown,
}: {
  label: string;
  value: number;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <View style={styles.stepper}>
      <PressScale onPress={onUp}>
        <View style={styles.stepperButton}>
          <Ionicons name="chevron-up" size={18} color={colors.blueDark} />
        </View>
      </PressScale>
      <Text style={styles.stepperValue}>{pad(value)}</Text>
      <Text style={styles.stepperLabel}>{label}</Text>
      <PressScale onPress={onDown}>
        <View style={styles.stepperButton}>
          <Ionicons name="chevron-down" size={18} color={colors.blueDark} />
        </View>
      </PressScale>
    </View>
  );
}

/** Animated calendar picker. Emits "YYYY-MM-DD" or "YYYY-MM-DD HH:mm". */
function DatePickerField({
  value,
  onChange,
  placeholder = 'Select journey date',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const parsed = parseJourney(value);

  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => monthStart(parsed?.date ?? new Date()));
  const [draft, setDraft] = useState<Date | null>(parsed?.date ?? null);
  const [withTime, setWithTime] = useState(parsed?.hasTime ?? false);
  const [hour, setHour] = useState(parsed?.hour ?? 9);
  const [minute, setMinute] = useState(parsed?.minute ?? 0);

  const pop = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;

  const openPicker = () => {
    const current = parseJourney(value);
    setDraft(current?.date ?? null);
    setWithTime(current?.hasTime ?? false);
    setHour(current?.hour ?? 9);
    setMinute(current?.minute ?? 0);
    setMonth(monthStart(current?.date ?? new Date()));
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

  const changeMonth = (direction: number) => {
    setMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + direction, 1),
    );
    slide.setValue(direction);
    Animated.spring(slide, {
      toValue: 0,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();
  };

  const pickDate = (date: Date) => {
    setDraft(date);
    if (date.getMonth() !== month.getMonth() || date.getFullYear() !== month.getFullYear()) {
      const direction = date.getTime() > month.getTime() ? 1 : -1;
      setMonth(monthStart(date));
      slide.setValue(direction);
      Animated.spring(slide, {
        toValue: 0,
        friction: 7,
        tension: 90,
        useNativeDriver: true,
      }).start();
    }
  };

  const confirm = () => {
    if (!draft) return;
    const base = `${draft.getFullYear()}-${pad(draft.getMonth() + 1)}-${pad(draft.getDate())}`;
    onChange(withTime ? `${base} ${pad(hour)}:${pad(minute)}` : base);
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

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <>
      <Ripple radius={12} color="rgba(29,111,224,0.14)" onPress={openPicker}>
        <View style={[styles.dateField, parsed && styles.dateFieldFilled]}>
          <Text style={styles.dateEmoji}>📅</Text>
          <Text
            style={[styles.dateText, !parsed && styles.placeholder]}
            numberOfLines={1}
          >
            {parsed
              ? `${longDate(parsed.date)}${parsed.hasTime ? ` · ${pad(parsed.hour)}:${pad(parsed.minute)}` : ''
              }`
              : placeholder}
          </Text>
          {parsed ? (
            <LinearGradient
              colors={GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.relativePill}
            >
              <Text style={styles.relativePillText}>{relativeLabel(parsed.date)}</Text>
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
            {/* Summary header */}
            <LinearGradient
              colors={GRADIENT_DEEP}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.pickerHeader}
            >
              <View style={styles.pickerHeaderCircle} />
              <Text style={styles.pickerEyebrow}>JOURNEY DATE</Text>
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
                {draft
                  ? `${draft.getFullYear()} · ${relativeLabel(draft)}${withTime ? ` · ${pad(hour)}:${pad(minute)}` : ''
                  }`
                  : 'Tap a day below'}
              </Text>
            </LinearGradient>

            <View style={styles.pickerBody}>
              {/* Month navigation */}
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
                      isToday={sameDay(date, today)}
                      onPress={() => pickDate(date)}
                    />
                  ) : (
                    <View key={`empty-${index}`} style={styles.dayCell} />
                  ),
                )}
              </Animated.View>

              {/* Quick picks */}
              <View style={styles.quickRow}>
                {[
                  { label: 'Today', date: todayStart },
                  { label: 'Tomorrow', date: addDays(todayStart, 1) },
                  { label: 'Next week', date: addDays(todayStart, 7) },
                ].map((quick) => (
                  <PressScale key={quick.label} onPress={() => pickDate(quick.date)}>
                    <View style={styles.quickChip}>
                      <Text style={styles.quickChipText}>{quick.label}</Text>
                    </View>
                  </PressScale>
                ))}
              </View>

              {/* Optional time */}
              <View style={styles.timeToggleRow}>
                <Chip
                  label={withTime ? '⏰ Time added' : '⏰ Add time (optional)'}
                  active={withTime}
                  onPress={() => setWithTime((current) => !current)}
                />
              </View>

              {withTime ? (
                <FadeIn>
                  <View style={styles.timeRow}>
                    <Stepper
                      label="HOUR"
                      value={hour}
                      onUp={() => setHour((current) => (current + 1) % 24)}
                      onDown={() => setHour((current) => (current + 23) % 24)}
                    />
                    <Text style={styles.timeColon}>:</Text>
                    <Stepper
                      label="MIN"
                      value={minute}
                      onUp={() => setMinute((current) => (current + 5) % 60)}
                      onDown={() => setMinute((current) => (current + 55) % 60)}
                    />
                  </View>
                </FadeIn>
              ) : null}

              {/* Actions */}
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
                      <Text style={styles.saveButtonText}>Confirm</Text>
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

  const onDialPress = (key: (typeof SPEED_DIAL)[number]['key']) => {
    toggleFab(false);

    if (key === 'new') {
      scrollRef.current?.scrollTo({
        y: Math.max(0, formY.current - 90),
        animated: true,
      });
    } else if (key === 'search') {
      scrollRef.current?.scrollTo({
        y: Math.max(0, listY.current - 90),
        animated: true,
      });
    } else if (key === 'payments') {
      router.push('/payments');
    } else if (key === 'home') {
      router.replace('/');
    }
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

  const totalSelling = bookings.reduce(
    (sum, booking) => sum + booking.selling_price_paise,
    0,
  );
  const totalMargin = bookings.reduce(
    (sum, booking) =>
      sum + (booking.selling_price_paise - booking.supplier_cost_paise),
    0,
  );
  const pendingCount = bookings.filter(
    (booking) => booking.booking_status === 'PENDING',
  ).length;

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

  const renderBooking = ({ item, index }: { item: Booking; index: number }) => {
    const profit =
      item.selling_price_paise - item.supplier_cost_paise;
    const statusStyle = STATUS_STYLES[item.booking_status] ?? STATUS_STYLES.PENDING;

    return (
      <FadeIn delay={Math.min(index, 8) * 55}>
        <Ripple
          radius={18}
          color="rgba(29,111,224,0.14)"
          style={styles.bookingCard}
          onPress={() =>
            router.push({
              pathname: '/booking-details',
              params: { id: String(item.id) },
            })
          }
        >
          <LinearGradient
            colors={GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.bookingAccent}
          />

          <View style={styles.bookingHeader}>
            <View style={styles.bookingNumberWrap}>
              <Text style={styles.bookingIcon}>
                {TRANSPORT_ICONS[item.transport_type] ?? '🧳'}
              </Text>
              <Text style={styles.bookingNumber} numberOfLines={1}>
                {item.booking_number || `Booking #${item.id}`}
              </Text>
            </View>
            <Pressable
              style={[styles.statusButton, { backgroundColor: statusStyle.bg }]}
              onPress={() => updateBookingStatus(item)}
            >
              <Text style={[styles.status, { color: statusStyle.fg }]}>
                {item.booking_status}  ⌄
              </Text>
            </Pressable>
          </View>

          <Text style={styles.customerName}>{item.customer_name}</Text>
          <Text style={styles.muted}>
            {item.transport_type} · {item.phone}
          </Text>

          <View style={styles.routeBox}>
            <Text style={styles.route}>
              {item.origin} → {item.destination}
            </Text>
          </View>

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
        </Ripple>
      </FadeIn>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.blue} />
        <Text style={styles.muted}>Loading bookings...</Text>
      </SafeAreaView>
    );
  }

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

            <Text style={styles.eyebrow}>TICKET DESK</Text>
            <Text style={styles.title}>Booking Management</Text>
            <Text style={styles.subtitle}>
              Create and track customer travel bookings offline.
            </Text>
          </Animated.View>
        </SafeAreaView>
      </LinearGradient>

      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true },
          )}
        >
          {/* Hero */}
          <FadeIn delay={40}>
            <LinearGradient
              colors={GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              <View style={styles.heroCircle} />
              <Shimmer />
              <Text style={styles.heroLabel}>TOTAL BOOKINGS</Text>
              <CountUp value={bookings.length} style={styles.heroValue} />
              <Text style={styles.heroHint}>Bookings saved on this device</Text>
            </LinearGradient>
          </FadeIn>

          <FadeIn delay={100}>
            <View style={styles.snapshotRow}>
              <View style={styles.snapshotCard}>
                <Text style={styles.snapshotLabel}>SELLING</Text>
                <CountUp
                  value={totalSelling}
                  format={money}
                  style={[styles.snapshotValue, { color: colors.blueDark }]}
                />
              </View>
              <View style={styles.snapshotCard}>
                <Text style={styles.snapshotLabel}>MARGIN</Text>
                <CountUp
                  value={totalMargin}
                  format={money}
                  style={[
                    styles.snapshotValue,
                    { color: totalMargin < 0 ? colors.danger : colors.greenDark },
                  ]}
                />
              </View>
              <View style={styles.snapshotCard}>
                <Text style={styles.snapshotLabel}>PENDING</Text>
                <CountUp
                  value={pendingCount}
                  style={[styles.snapshotValue, { color: colors.amber }]}
                />
              </View>
            </View>
          </FadeIn>

          {/* New booking form */}
          <FadeIn
            delay={150}
            onLayout={(event) => {
              formY.current = event.nativeEvent.layout.y;
            }}
          >
            <View style={styles.formCard}>
              <View style={styles.sectionHeader}>
                <LinearGradient
                  colors={GRADIENT}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.sectionIcon}
                >
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                </LinearGradient>
                <Text style={styles.sectionTitleInline}>New Booking</Text>
              </View>

              <Text style={styles.label}>Customer *</Text>
              <Ripple
                radius={12}
                color="rgba(29,111,224,0.14)"
                onPress={() => setCustomerModal(true)}
              >
                <View style={styles.customerSelector}>
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
                </View>
              </Ripple>

              <Text style={styles.label}>Transport type *</Text>
              <View style={styles.typeRow}>
                {TRANSPORT_TYPES.map((type) => (
                  <Chip
                    key={type}
                    label={`${TRANSPORT_ICONS[type]} ${type}`}
                    active={transportType === type}
                    onPress={() => setTransportType(type)}
                  />
                ))}
              </View>

              <Text style={styles.label}>Operator / Travel company</Text>
              <Field
                value={operatorName}
                onChangeText={setOperatorName}
                placeholder="e.g. TNSTC, IRCTC, airline"
              />

              <Text style={styles.label}>Booking reference / PNR</Text>
              <Field
                value={bookingReference}
                onChangeText={setBookingReference}
                placeholder="Enter reference number"
                autoCapitalize="characters"
              />

              <Text style={styles.label}>Origin *</Text>
              <Field
                value={origin}
                onChangeText={setOrigin}
                placeholder="Departure city or station"
              />

              <Text style={styles.label}>Destination *</Text>
              <Field
                value={destination}
                onChangeText={setDestination}
                placeholder="Arrival city or station"
              />

              <Text style={styles.label}>Journey date *</Text>
              <DatePickerField
                value={journeyAt}
                onChange={setJourneyAt}
                placeholder="Select journey date"
              />

              <Text style={styles.label}>Selling price (₹)</Text>
              <Field
                value={sellingPrice}
                onChangeText={setSellingPrice}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />

              <Text style={styles.label}>Supplier cost (₹)</Text>
              <Field
                value={supplierCost}
                onChangeText={setSupplierCost}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />

              <View style={styles.saveGap}>
                <GradientButton
                  label={saving ? 'Saving...' : 'Save Booking'}
                  icon="checkmark-circle"
                  onPress={saveBooking}
                  disabled={saving}
                />
              </View>
            </View>
          </FadeIn>

          {/* Saved bookings */}
          <FadeIn
            delay={200}
            onLayout={(event) => {
              listY.current = event.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.sectionTitle}>
              Saved Bookings ({filteredBookings.length})
            </Text>

            <View style={[styles.searchWrap]}>
              <Text style={styles.searchIcon}>🔍</Text>
              <Field
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search customer, booking, route..."
              />
              {search ? (
                <Pressable onPress={() => setSearch('')} hitSlop={10}>
                  <Text style={styles.clearSearch}>✕</Text>
                </Pressable>
              ) : null}
            </View>

            <Animated.ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {BOOKING_STATUSES.map((status) => (
                <Chip
                  key={status}
                  label={status === 'ALL' ? 'All' : status}
                  active={statusFilter === status}
                  onPress={() => setStatusFilter(status)}
                />
              ))}
            </Animated.ScrollView>
          </FadeIn>

          {filteredBookings.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🎫</Text>
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
        </Animated.ScrollView>
      </KeyboardAvoidingView>

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

      {/* Select customer */}
      <Modal
        visible={customerModal}
        animationType="slide"
        transparent
        onRequestClose={() => setCustomerModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <LinearGradient
              colors={GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.modalHeader}
            >
              <Text style={styles.modalTitle}>Select Customer</Text>
            </LinearGradient>

            <FlatList
              data={customers}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.modalList}
              ListEmptyComponent={
                <Text style={styles.muted}>
                  No customers yet. Add a customer first.
                </Text>
              }
              renderItem={({ item }) => (
                <Ripple
                  radius={12}
                  color="rgba(29,111,224,0.14)"
                  style={styles.customerOption}
                  onPress={() => {
                    setCustomerId(item.id);
                    setCustomerModal(false);
                  }}
                >
                  <View style={styles.customerOptionRow}>
                    <LinearGradient
                      colors={GRADIENT}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.optionAvatar}
                    >
                      <Text style={styles.optionAvatarText}>
                        {item.name.trim().charAt(0).toUpperCase()}
                      </Text>
                    </LinearGradient>
                    <View style={styles.flex}>
                      <Text style={styles.optionName}>{item.name}</Text>
                      <Text style={styles.muted}>{item.phone}</Text>
                    </View>
                  </View>
                </Ripple>
              )}
            />

            <PressScale onPress={() => setCustomerModal(false)}>
              <View style={styles.cancelButton}>
                <Text style={styles.cancelText}>Close</Text>
              </View>
            </PressScale>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  keyboard: { flex: 1, marginTop: -44 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: colors.background,
  },

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
  eyebrow: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    marginTop: 4,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    marginTop: 4,
  },

  /* Content */
  content: { paddingHorizontal: 18, paddingBottom: 130, gap: 14 },

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
    fontSize: 44,
    fontWeight: '900',
    marginTop: 6,
  },
  heroHint: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginTop: 2,
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

  /* Form */
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 17,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#10243A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitleInline: { color: colors.text, fontSize: 18, fontWeight: '900' },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    marginBottom: 12,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 7,
    marginTop: 14,
  },
  input: {
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.text,
  },
  inputFocused: {
    borderColor: colors.blue,
    backgroundColor: '#F8FBFF',
  },
  customerSelector: {
    minHeight: 49,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
  },
  selectorText: { flex: 1, color: colors.text, fontSize: 14 },
  placeholder: { color: colors.muted },
  selectorArrow: { fontSize: 20, color: colors.blue, marginLeft: 8 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

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

  /* Buttons */
  saveGap: { marginTop: 22 },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: 14,
  },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  disabledButton: { opacity: 0.6 },

  /* Search + filters */
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingLeft: 14,
    paddingRight: 14,
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: {
    flex: 1,
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
  },
  clearSearch: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    paddingLeft: 8,
  },
  filterRow: {
    gap: 8,
    paddingTop: 12,
    paddingBottom: 4,
  },

  /* Booking cards */
  list: { gap: 12, paddingTop: 4 },
  bookingCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 16,
    paddingLeft: 20,
    overflow: 'hidden',
    shadowColor: '#10243A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  bookingAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  bookingNumberWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  bookingIcon: { fontSize: 18 },
  bookingNumber: {
    color: colors.blueDark,
    fontWeight: '900',
    fontSize: 14,
    flexShrink: 1,
  },
  statusButton: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  status: {
    fontSize: 11,
    fontWeight: '800',
  },
  customerName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 10,
  },
  muted: { color: colors.muted, fontSize: 12, marginTop: 4 },
  routeBox: {
    backgroundColor: colors.blueLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
  },
  route: { color: colors.blueDark, fontSize: 15, fontWeight: '800' },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 15,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  priceLabel: { color: colors.muted, fontSize: 10 },
  price: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
  },

  emptyCard: {
    backgroundColor: colors.surface,
    padding: 26,
    borderRadius: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyEmoji: { fontSize: 34, marginBottom: 8 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },

  /* Customer modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(8,30,58,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    maxHeight: '80%',
    backgroundColor: colors.surface,
    borderRadius: 22,
    overflow: 'hidden',
    paddingBottom: 14,
  },
  modalHeader: { padding: 18 },
  modalTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  modalList: { padding: 14, paddingBottom: 4 },
  customerOption: {
    borderRadius: 12,
    marginBottom: 6,
  },
  customerOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionAvatarText: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  optionName: { color: colors.text, fontSize: 15, fontWeight: '800' },
  cancelButton: {
    alignItems: 'center',
    padding: 13,
    marginHorizontal: 14,
    marginTop: 8,
    backgroundColor: colors.blueLight,
    borderRadius: 12,
  },
  cancelText: { color: colors.blueDark, fontWeight: '800' },

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
  timeToggleRow: { marginTop: 12, flexDirection: 'row' },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 12,
    backgroundColor: colors.blueLight,
    borderRadius: 16,
    paddingVertical: 12,
  },
  stepper: { alignItems: 'center', gap: 4 },
  stepperButton: {
    width: 36,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: { color: colors.blueDark, fontSize: 28, fontWeight: '900' },
  stepperLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  timeColon: {
    color: colors.blueDark,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 18,
  },
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