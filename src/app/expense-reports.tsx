import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react';

import { router, useFocusEffect } from 'expo-router';

import {
    Alert,
    Animated,
    Dimensions,
    Easing,
    Modal,
    Pressable,
    Platform,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    View,
    type LayoutChangeEvent,
    type StyleProp,
    type TextStyle,
    type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSQLiteContext } from 'expo-sqlite';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import { Ionicons } from '@expo/vector-icons';

type ExpenseRecord = {
    id: number;
    expense_date: string;
    description: string;
    category: string;
    expense_type: string;
    amount_paise: number;
    status: string;
};

type MonthlyTotal = {
    month: string;
    total: number;
};

type CategoryTotal = {
    category: string;
    total: number;
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
    orange: '#A66F00',
    orangeLight: '#FFF5DC',
    red: '#D6453D',
    redLight: '#FDECEA',
    white: '#FFFFFF',
};

const GRADIENT = ['#1D6FE0', '#12A37F'] as const;
const GRADIENT_DEEP = ['#0B4FB3', '#0D7F63'] as const;
const GRADIENT_DANGER = ['#E8574F', '#C0392B'] as const;
const SCREEN_WIDTH = Dimensions.get('window').width;

const CATEGORY_ICONS: Record<string, string> = {
    SUPPLIER: '🚚',
    RENT: '🏢',
    SALARY: '👥',
    ELECTRICITY: '⚡',
    INTERNET: '🌐',
    TRAVEL: '✈️',
    OFFICE: '🗂️',
    MARKETING: '📣',
    OTHER: '✨',
};

const PRESETS: [string, string][] = [
    ['THIS_MONTH', 'This month'],
    ['LAST_MONTH', 'Last month'],
    ['THREE_MONTHS', '3 months'],
    ['THIS_YEAR', 'This year'],
];

const SPEED_DIAL = [
    { key: 'pdf', icon: '📄', label: 'Export PDF' },
    { key: 'excel', icon: '📊', label: 'Export Excel' },
    { key: 'refresh', icon: '🔄', label: 'Refresh Report' },
    { key: 'home', icon: '🏠', label: 'Home' },
] as const;

const today = new Date();

function dateString(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function money(paise: number) {
    return `₹${(paise / 100).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function monthLabel(value: string) {
    const [year, month] = value.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('en-IN', {
        month: 'short',
        year: '2-digit',
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

function SectionHeading({ title, icon }: { title: string; icon: keyof typeof Ionicons.glyphMap }) {
    return (
        <View style={styles.sectionHeadingRow}>
            <LinearGradient
                colors={GRADIENT}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.sectionIcon}
            >
                <Ionicons name={icon} size={15} color="#FFFFFF" />
            </LinearGradient>
            <Text style={styles.sectionHeading}>{title}</Text>
        </View>
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
}: {
    title: string;
    value: string;
    onChange: (value: string) => void;
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
                <View style={[styles.dateInput, parsed && styles.dateInputFilled]}>
                    <Text style={styles.dateEmoji}>📅</Text>
                    <Text
                        style={[styles.dateInputText, !parsed && styles.placeholder]}
                        numberOfLines={1}
                    >
                        {parsed
                            ? parsed.toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                            })
                            : 'Select date'}
                    </Text>
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
                                            <Text style={styles.applyText}>Confirm</Text>
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

export default function ExpenseReportsScreen() {
    const db = useSQLiteContext();

    const [fromDate, setFromDate] = useState(
        dateString(new Date(today.getFullYear(), today.getMonth(), 1)),
    );
    const [toDate, setToDate] = useState(dateString(today));
    const [activePreset, setActivePreset] = useState<string | null>('THIS_MONTH');

    const [totalExpenses, setTotalExpenses] = useState(0);
    const [supplierPayments, setSupplierPayments] = useState(0);
    const [supplierRefunds, setSupplierRefunds] = useState(0);
    const [paidOperating, setPaidOperating] = useState(0);
    const [pendingOperating, setPendingOperating] = useState(0);

    const [monthly, setMonthly] = useState<MonthlyTotal[]>([]);
    const [categories, setCategories] = useState<CategoryTotal[]>([]);
    const [records, setRecords] = useState<ExpenseRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);

    // Animation state
    const scrollY = useRef(new Animated.Value(0)).current;
    const chartProgress = useRef(new Animated.Value(0)).current;
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

    // Animate charts whenever report data changes
    useEffect(() => {
        chartProgress.setValue(0);

        Animated.timing(chartProgress, {
            toValue: 1,
            duration: 850,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [monthly, categories, chartProgress]);

    const loadReport = useCallback(async () => {
        if (
            !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) ||
            !/^\d{4}-\d{2}-\d{2}$/.test(toDate) ||
            fromDate > toDate
        ) {
            Alert.alert('Invalid dates', 'Please enter valid dates in YYYY-MM-DD format.');
            return;
        }

        setLoading(true);

        try {
            const supplier = await db.getFirstAsync<{
                payments: number;
                refunds: number;
            }>(
                `SELECT
          COALESCE(SUM(
            CASE WHEN payment_type = 'SUPPLIER_PAYMENT'
            THEN amount_paise ELSE 0 END
          ), 0) AS payments,
          COALESCE(SUM(
            CASE WHEN payment_type = 'SUPPLIER_REFUND'
            THEN amount_paise ELSE 0 END
          ), 0) AS refunds
        FROM payments
        WHERE payment_type IN ('SUPPLIER_PAYMENT', 'SUPPLIER_REFUND')
          AND payment_date >= ?
          AND payment_date <= ?`,
                fromDate,
                `${toDate} 23:59:59`,
            );

            const operating = await db.getFirstAsync<{
                paid: number;
                pending: number;
            }>(
                `SELECT
          COALESCE(SUM(
            CASE WHEN payment_status = 'PAID'
            THEN amount_paise ELSE 0 END
          ), 0) AS paid,
          COALESCE(SUM(
            CASE WHEN payment_status = 'PENDING'
            THEN amount_paise ELSE 0 END
          ), 0) AS pending
        FROM operating_expenses
        WHERE expense_date >= ? AND expense_date <= ?`,
                fromDate,
                toDate,
            );

            const supplierPaid = supplier?.payments ?? 0;
            const supplierRefund = supplier?.refunds ?? 0;
            const operatingPaid = operating?.paid ?? 0;

            setSupplierPayments(supplierPaid);
            setSupplierRefunds(supplierRefund);
            setPaidOperating(operatingPaid);
            setPendingOperating(operating?.pending ?? 0);
            setTotalExpenses(supplierPaid - supplierRefund + operatingPaid);

            const rows = await db.getAllAsync<ExpenseRecord>(
                `SELECT
          id,
          payment_date AS expense_date,
          CASE
            WHEN payment_type = 'SUPPLIER_REFUND'
            THEN 'Supplier refund'
            ELSE 'Supplier payment'
          END AS description,
          'SUPPLIER' AS category,
          'SUPPLIER' AS expense_type,
          CASE
            WHEN payment_type = 'SUPPLIER_REFUND'
            THEN -amount_paise
            ELSE amount_paise
          END AS amount_paise,
          'PAID' AS status
        FROM payments
        WHERE payment_type IN ('SUPPLIER_PAYMENT', 'SUPPLIER_REFUND')
          AND payment_date >= ?
          AND payment_date <= ?

        UNION ALL

        SELECT
          id,
          expense_date,
          description,
          category,
          'OPERATING' AS expense_type,
          amount_paise,
          payment_status AS status
        FROM operating_expenses
        WHERE expense_date >= ?
          AND expense_date <= ?

        ORDER BY expense_date DESC, id DESC`,
                fromDate,
                `${toDate} 23:59:59`,
                fromDate,
                toDate,
            );

            setRecords(rows);

            const categoryRows = await db.getAllAsync<CategoryTotal>(
                `SELECT category, COALESCE(SUM(amount_paise), 0) AS total
         FROM operating_expenses
         WHERE payment_status = 'PAID'
           AND expense_date >= ?
           AND expense_date <= ?
         GROUP BY category
         ORDER BY total DESC`,
                fromDate,
                `${toDate} 23:59:59`,
            );

            setCategories(categoryRows);

            const monthlyMap = new Map<string, number>();

            rows.forEach((row) => {
                if (row.status !== 'PAID') return;

                const month = row.expense_date.substring(0, 7);
                monthlyMap.set(
                    month,
                    (monthlyMap.get(month) ?? 0) + row.amount_paise,
                );
            });

            const monthlyRows = Array.from(monthlyMap.entries())
                .map(([month, total]) => ({ month, total }))
                .sort((a, b) => a.month.localeCompare(b.month));

            setMonthly(monthlyRows);
        } catch (error) {
            console.error('Expense report error:', error);
            Alert.alert(
                'Report error',
                'Could not load expense reports. Please check your database tables.',
            );
        } finally {
            setLoading(false);
        }
    }, [db, fromDate, toDate]);

    useFocusEffect(
        useCallback(() => {
            void loadReport();
        }, [loadReport]),
    );

    function applyPreset(preset: string) {
        const end = new Date();
        let start = new Date();

        if (preset === 'THIS_MONTH') {
            start = new Date(end.getFullYear(), end.getMonth(), 1);
        } else if (preset === 'LAST_MONTH') {
            start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
            end.setDate(0);
        } else if (preset === 'THREE_MONTHS') {
            start = new Date(end.getFullYear(), end.getMonth() - 2, 1);
        } else if (preset === 'THIS_YEAR') {
            start = new Date(end.getFullYear(), 0, 1);
        }

        setActivePreset(preset);
        setFromDate(dateString(start));
        setToDate(dateString(end));
    }

    async function exportPDF() {
        if (records.length === 0) {
            Alert.alert('No data', 'There are no expense records to export.');
            return;
        }

        setExporting(true);

        try {
            const tableRows = records.map((item) => `
                <tr>
                    <td>${item.expense_date}</td>
                    <td>${item.description}</td>
                    <td>${item.category}</td>
                    <td>${item.status}</td>
                    <td style="text-align:right">
                        ${item.amount_paise < 0 ? '-' : ''}
                        ${money(Math.abs(item.amount_paise))}
                    </td>
                </tr>
            `).join('');

            const categoryRows = categories.map((item) => `
                <tr>
                    <td>${item.category.replace(/_/g, ' ')}</td>
                    <td style="text-align:right">${money(item.total)}</td>
                </tr>
            `).join('');

            const monthlyRows = monthly.map((item) => `
                <tr>
                    <td>${monthLabel(item.month)}</td>
                    <td style="text-align:right">${money(item.total)}</td>
                </tr>
            `).join('');

            const html = `
                <html>
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            padding: 24px;
                            color: #172B27;
                        }
                        h1 { color: #176B55; }
                        h2 {
                            margin-top: 28px;
                            color: #176B55;
                        }
                        .period {
                            color: #6B7B76;
                            margin-bottom: 20px;
                        }
                        .total {
                            background: #E5F4EE;
                            padding: 15px;
                            font-size: 20px;
                            font-weight: bold;
                        }
                        table {
                            width: 100%;
                            border-collapse: collapse;
                            margin-top: 12px;
                            font-size: 11px;
                        }
                        th, td {
                            border: 1px solid #DDE5E1;
                            padding: 8px;
                            text-align: left;
                        }
                        th {
                            background: #E5F4EE;
                        }
                    </style>
                </head>
                <body>
                    <h1>Expense Report</h1>
                    <p class="period">
                        Period: ${fromDate} to ${toDate}
                    </p>

                    <div class="total">
                        Total Expenses: ${money(totalExpenses)}
                    </div>

                    <h2>Expense Summary</h2>
                    <table>
                        <tr><td>Supplier Payments</td><td>${money(supplierPayments)}</td></tr>
                        <tr><td>Supplier Refunds</td><td>${money(supplierRefunds)}</td></tr>
                        <tr><td>Paid Operating Expenses</td><td>${money(paidOperating)}</td></tr>
                        <tr><td>Pending Operating Expenses</td><td>${money(pendingOperating)}</td></tr>
                    </table>

                    <h2>Monthly Expenses</h2>
                    <table>
                        <tr><th>Month</th><th>Total</th></tr>
                        ${monthlyRows}
                    </table>

                    <h2>Category Breakdown</h2>
                    <table>
                        <tr><th>Category</th><th>Total</th></tr>
                        ${categoryRows}
                    </table>

                    <h2>Expense Records</h2>
                    <table>
                        <tr>
                            <th>Date</th>
                            <th>Description</th>
                            <th>Category</th>
                            <th>Status</th>
                            <th>Amount</th>
                        </tr>
                        ${tableRows}
                    </table>
                </body>
                </html>
            `;

            if (Platform.OS === 'web') {
                await Print.printAsync({ html });
            } else {
                const result = await Print.printToFileAsync({ html });

                if (!result?.uri) {
                    throw new Error('PDF file was not generated.');
                }

                if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(result.uri, {
                        mimeType: 'application/pdf',
                        dialogTitle: 'Share Expense Report',
                        UTI: 'com.adobe.pdf',
                    });
                } else {
                    Alert.alert('PDF created', result.uri);
                }
            }
        } catch (error) {
            console.error('PDF export error:', error);
            Alert.alert('Export failed', 'Could not create the PDF report.');
        } finally {
            setExporting(false);
        }
    }

    async function exportExcel() {
        if (records.length === 0) {
            Alert.alert('No data', 'There are no expense records to export.');
            return;
        }

        setExporting(true);

        try {
            const workbook = XLSX.utils.book_new();

            // Sheet 1: Expense Summary
            const summarySheet = XLSX.utils.aoa_to_sheet([
                ['Expense Report'],
                ['From Date', fromDate],
                ['To Date', toDate],
                [],
                ['Description', 'Amount (₹)'],
                ['Supplier Payments', supplierPayments / 100],
                ['Supplier Refunds', supplierRefunds / 100],
                ['Paid Operating Expenses', paidOperating / 100],
                ['Pending Operating Expenses', pendingOperating / 100],
                ['Total Expenses', totalExpenses / 100],
            ]);

            XLSX.utils.book_append_sheet(
                workbook,
                summarySheet,
                'Expense Summary'
            );

            // Sheet 2: Monthly Expenses
            const monthlySheet = XLSX.utils.aoa_to_sheet([
                ['Month', 'Total (₹)'],
                ...monthly.map((item) => [
                    monthLabel(item.month),
                    item.total / 100,
                ]),
            ]);

            XLSX.utils.book_append_sheet(
                workbook,
                monthlySheet,
                'Monthly Expenses'
            );

            // Sheet 3: Category Breakdown
            const categorySheet = XLSX.utils.aoa_to_sheet([
                ['Category', 'Total (₹)'],
                ...categories.map((item) => [
                    item.category.replace(/_/g, ' '),
                    item.total / 100,
                ]),
            ]);

            XLSX.utils.book_append_sheet(
                workbook,
                categorySheet,
                'Category Breakdown'
            );

            // Sheet 4: Expense Records
            const recordsSheet = XLSX.utils.aoa_to_sheet([
                ['Date', 'Description', 'Category', 'Type', 'Status', 'Amount (₹)'],
                ...records.map((item) => [
                    item.expense_date,
                    item.description,
                    item.category,
                    item.expense_type,
                    item.status,
                    item.amount_paise / 100,
                ]),
            ]);

            XLSX.utils.book_append_sheet(
                workbook,
                recordsSheet,
                'Expense Records'
            );

            const excelBase64 = XLSX.write(workbook, {
                bookType: 'xlsx',
                type: 'base64',
            });

            const fileName = `Expense_Report_${fromDate}_to_${toDate}.xlsx`;
            const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

            await FileSystem.writeAsStringAsync(fileUri, excelBase64, {
                encoding: FileSystem.EncodingType.Base64,
            });

            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri, {
                    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    dialogTitle: 'Share Excel Expense Report',
                    UTI: 'org.openxmlformats.spreadsheetml.sheet',
                });
            } else {
                Alert.alert('Excel created', fileUri);
            }
        } catch (error) {
            console.error('Excel export error:', error);
            Alert.alert('Export failed', 'Could not create the Excel report.');
        } finally {
            setExporting(false);
        }
    }

    const onDialPress = (key: (typeof SPEED_DIAL)[number]['key']) => {
        toggleFab(false);

        if (key === 'home') {
            router.replace('/');
            return;
        }

        if (key === 'refresh') {
            void loadReport();
            return;
        }

        if (exporting || loading) return;

        if (key === 'pdf') void exportPDF();
        else if (key === 'excel') void exportExcel();
    };

    const maxMonthly = Math.max(
        1,
        ...monthly.map((item) => Math.abs(item.total)),
    );

    const maxCategory = Math.max(
        1,
        ...categories.map((item) => Math.abs(item.total)),
    );

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
                                <Text style={styles.eyebrow}>TICKET DESK</Text>
                                <Text style={styles.heading}>Expense Reports</Text>
                            </View>
                            <View style={styles.periodPill}>
                                <PulseDot color="#7DFFC9" />
                                <Text style={styles.periodPillText} numberOfLines={1}>
                                    {fromDate.slice(5)} → {toDate.slice(5)}
                                </Text>
                            </View>
                        </View>
                        <Text style={styles.subtitle}>
                            Business expense analysis and monthly reports
                        </Text>
                    </Animated.View>
                </SafeAreaView>
            </LinearGradient>

            <Animated.ScrollView
                style={styles.page}
                contentContainerStyle={styles.container}
                showsVerticalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                    { useNativeDriver: true },
                )}
            >
                {/* Hero total */}
                <FadeIn delay={40}>
                    <LinearGradient
                        colors={GRADIENT}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.totalCard}
                    >
                        <View style={styles.totalCircle} />
                        <Shimmer />
                        <Text style={styles.totalLabel}>TOTAL EXPENSES</Text>
                        <CountUp value={totalExpenses} format={money} style={styles.totalValue} />
                        <Text style={styles.totalHint}>
                            Supplier payments − refunds + paid operating expenses
                        </Text>
                    </LinearGradient>
                </FadeIn>

                {/* Date range */}
                <FadeIn delay={100}>
                    <View style={styles.card}>
                        <SectionHeading title="Date Range" icon="calendar" />

                        <View style={styles.dateRow}>
                            <View style={styles.dateField}>
                                <Text style={styles.label}>From date</Text>
                                <DatePickerField
                                    title="From date"
                                    value={fromDate}
                                    onChange={(value) => {
                                        setActivePreset(null);
                                        setFromDate(value);
                                    }}
                                />
                            </View>

                            <View style={styles.dateField}>
                                <Text style={styles.label}>To date</Text>
                                <DatePickerField
                                    title="To date"
                                    value={toDate}
                                    onChange={(value) => {
                                        setActivePreset(null);
                                        setToDate(value);
                                    }}
                                />
                            </View>
                        </View>

                        <View style={styles.presetRow}>
                            {PRESETS.map(([key, label]) => (
                                <PressScale key={key} onPress={() => applyPreset(key)}>
                                    {activePreset === key ? (
                                        <LinearGradient
                                            colors={GRADIENT}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                            style={styles.preset}
                                        >
                                            <Text style={[styles.presetText, styles.presetTextActive]}>
                                                {label}
                                            </Text>
                                        </LinearGradient>
                                    ) : (
                                        <View style={[styles.preset, styles.presetIdle]}>
                                            <Text style={styles.presetText}>{label}</Text>
                                        </View>
                                    )}
                                </PressScale>
                            ))}
                        </View>

                        <View style={styles.applyGap}>
                            <Ripple radius={14} onPress={loadReport}>
                                <LinearGradient
                                    colors={GRADIENT}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.applyButton}
                                >
                                    <Ionicons name="funnel" size={16} color="#FFFFFF" />
                                    <Text style={styles.applyText}>
                                        {loading ? 'Loading...' : 'Apply Date Filter'}
                                    </Text>
                                </LinearGradient>
                            </Ripple>
                        </View>

                        <View style={styles.exportRow}>
                            <View style={[styles.flex, exporting && styles.dimmed]}>
                                <Ripple
                                    radius={14}
                                    onPress={exportPDF}
                                    disabled={exporting || loading}
                                >
                                    <LinearGradient
                                        colors={GRADIENT_DANGER}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={styles.exportButton}
                                    >
                                        <Ionicons name="document-text" size={16} color="#FFFFFF" />
                                        <Text style={styles.exportButtonText}>
                                            {exporting ? 'Exporting...' : 'Export PDF'}
                                        </Text>
                                    </LinearGradient>
                                </Ripple>
                            </View>

                            <View style={[styles.flex, exporting && styles.dimmed]}>
                                <Ripple
                                    radius={14}
                                    onPress={exportExcel}
                                    disabled={exporting || loading}
                                >
                                    <LinearGradient
                                        colors={GRADIENT}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={styles.exportButton}
                                    >
                                        <Ionicons name="grid" size={16} color="#FFFFFF" />
                                        <Text style={styles.exportButtonText}>
                                            {exporting ? 'Exporting...' : 'Export Excel'}
                                        </Text>
                                    </LinearGradient>
                                </Ripple>
                            </View>
                        </View>
                    </View>
                </FadeIn>

                {/* Summary */}
                <FadeIn delay={150}>
                    <SectionHeading title="Expense Summary" icon="stats-chart" />
                    <View style={styles.card}>
                        <SummaryRow label="Supplier payments" value={supplierPayments} />
                        <SummaryRow
                            label="Supplier refunds"
                            value={supplierRefunds}
                            prefix="−"
                            color={colors.red}
                        />
                        <SummaryRow label="Paid operating expenses" value={paidOperating} />
                        <SummaryRow
                            label="Pending operating expenses"
                            value={pendingOperating}
                            color={colors.orange}
                            last
                        />
                    </View>
                </FadeIn>

                {/* Monthly chart */}
                <FadeIn delay={190}>
                    <SectionHeading title="Monthly Expense Chart" icon="bar-chart" />
                    <View style={styles.card}>
                        {monthly.length === 0 ? (
                            <View style={styles.emptyWrap}>
                                <Text style={styles.emptyEmoji}>📊</Text>
                                <Text style={styles.empty}>No monthly expenses in this period.</Text>
                            </View>
                        ) : (
                            monthly.map((item) => (
                                <View key={item.month} style={styles.chartItem}>
                                    <View style={styles.chartHeader}>
                                        <Text style={styles.chartMonth}>{monthLabel(item.month)}</Text>
                                        <Text style={styles.chartAmount}>{money(item.total)}</Text>
                                    </View>
                                    <View style={styles.barBackground}>
                                        <Animated.View
                                            style={[
                                                styles.bar,
                                                {
                                                    width: chartProgress.interpolate({
                                                        inputRange: [0, 1],
                                                        outputRange: [
                                                            '0%',
                                                            `${Math.max(
                                                                1,
                                                                (Math.abs(item.total) / maxMonthly) * 100,
                                                            )}%`,
                                                        ],
                                                    }),
                                                },
                                            ]}
                                        >
                                            <LinearGradient
                                                colors={GRADIENT}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 0 }}
                                                style={styles.barFill}
                                            />
                                        </Animated.View>
                                    </View>
                                </View>
                            ))
                        )}
                    </View>
                </FadeIn>

                {/* Category breakdown */}
                <FadeIn delay={230}>
                    <SectionHeading title="Category Breakdown" icon="pie-chart" />
                    <View style={styles.card}>
                        {categories.length === 0 ? (
                            <View style={styles.emptyWrap}>
                                <Text style={styles.emptyEmoji}>🗂️</Text>
                                <Text style={styles.empty}>No paid operating expenses found.</Text>
                            </View>
                        ) : (
                            categories.map((item, index) => (
                                <View
                                    key={item.category}
                                    style={[
                                        styles.categoryRow,
                                        index === categories.length - 1 && styles.categoryRowLast,
                                    ]}
                                >
                                    <View style={styles.categoryTop}>
                                        <Text style={styles.categoryLabel}>
                                            {CATEGORY_ICONS[item.category] ?? '✨'}{' '}
                                            {item.category.replace(/_/g, ' ')}
                                        </Text>
                                        <CountUp
                                            value={item.total}
                                            format={money}
                                            style={styles.summaryValue}
                                        />
                                    </View>
                                    <View style={styles.categoryBarBackground}>
                                        <Animated.View
                                            style={{
                                                height: '100%',
                                                width: chartProgress.interpolate({
                                                    inputRange: [0, 1],
                                                    outputRange: [
                                                        '0%',
                                                        `${Math.max(2, (Math.abs(item.total) / maxCategory) * 100)}%`,
                                                    ],
                                                }),
                                            }}
                                        >
                                            <LinearGradient
                                                colors={GRADIENT}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 0 }}
                                                style={styles.barFill}
                                            />
                                        </Animated.View>
                                    </View>
                                </View>
                            ))
                        )}
                    </View>
                </FadeIn>

                {/* Records */}
                <FadeIn delay={270}>
                    <SectionHeading title="Date-wise Expense Records" icon="list" />
                </FadeIn>

                <View style={styles.card}>
                    {records.length === 0 ? (
                        <View style={styles.emptyWrap}>
                            <Text style={styles.emptyEmoji}>🧾</Text>
                            <Text style={styles.empty}>No expenses found for this date range.</Text>
                        </View>
                    ) : (
                        records.map((item, index) => (
                            <FadeIn
                                key={`${item.expense_type}-${item.id}-${index}`}
                                delay={Math.min(index, 8) * 45}
                            >
                                <View
                                    style={[
                                        styles.record,
                                        index === records.length - 1 && styles.recordLast,
                                    ]}
                                >
                                    <View style={styles.recordTop}>
                                        <View
                                            style={[
                                                styles.recordIcon,
                                                {
                                                    backgroundColor:
                                                        item.status === 'PENDING'
                                                            ? colors.orangeLight
                                                            : colors.greenLight,
                                                },
                                            ]}
                                        >
                                            <Text style={styles.recordIconText}>
                                                {CATEGORY_ICONS[item.category] ?? '✨'}
                                            </Text>
                                        </View>

                                        <View style={styles.flex}>
                                            <Text style={styles.recordTitle}>{item.description}</Text>
                                            <Text style={styles.recordMeta}>
                                                {item.expense_date} · {item.category}
                                            </Text>
                                            <View
                                                style={[
                                                    styles.statusPill,
                                                    item.status === 'PENDING'
                                                        ? styles.pendingPill
                                                        : styles.paidPill,
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.status,
                                                        item.status === 'PENDING'
                                                            ? styles.pending
                                                            : styles.paid,
                                                    ]}
                                                >
                                                    {item.status}
                                                </Text>
                                            </View>
                                        </View>

                                        <Text
                                            style={[
                                                styles.recordAmount,
                                                item.amount_paise < 0 && { color: colors.red },
                                            ]}
                                        >
                                            {item.amount_paise < 0 ? '−' : ''}
                                            {money(Math.abs(item.amount_paise))}
                                        </Text>
                                    </View>
                                </View>
                            </FadeIn>
                        ))
                    )}
                </View>
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

function SummaryRow({
    label,
    value,
    prefix = '',
    color = colors.text,
    last = false,
}: {
    label: string;
    value: number;
    prefix?: string;
    color?: string;
    last?: boolean;
}) {
    return (
        <View style={[styles.summaryRow, last && styles.summaryRowLast]}>
            <Text style={styles.summaryLabel}>{label}</Text>
            <CountUp
                value={value}
                format={(amount) => `${prefix}${money(amount)}`}
                style={[styles.summaryValue, { color }]}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    dimmed: { opacity: 0.5 },

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
        marginTop: 16,
    },
    headerTitleWrap: { flex: 1 },
    eyebrow: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1.5,
    },
    heading: {
        color: '#FFFFFF',
        fontSize: 26,
        fontWeight: '900',
        marginTop: 4,
    },
    subtitle: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 13,
        marginTop: 4,
        lineHeight: 20,
    },
    periodPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(255,255,255,0.18)',
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 8,
        maxWidth: '45%',
    },
    periodPillText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
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
    pulseDot: { width: 7, height: 7, borderRadius: 4 },

    /* Page */
    page: { flex: 1, marginTop: -44 },
    container: { paddingHorizontal: 18, paddingBottom: 130 },

    /* Hero */
    totalCard: {
        borderRadius: 22,
        padding: 22,
        marginBottom: 18,
        overflow: 'hidden',
        shadowColor: '#0B4FB3',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 18,
        elevation: 8,
    },
    totalCircle: {
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
    totalLabel: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1.2,
    },
    totalValue: {
        color: colors.white,
        fontSize: 32,
        fontWeight: '900',
        marginTop: 8,
    },
    totalHint: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 11,
        marginTop: 8,
        lineHeight: 17,
    },

    /* Cards */
    card: {
        backgroundColor: colors.surface,
        borderRadius: 20,
        padding: 17,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: '#10243A',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    sectionHeadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 12,
    },
    sectionIcon: {
        width: 28,
        height: 28,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sectionHeading: {
        fontSize: 18,
        fontWeight: '900',
        color: colors.text,
    },

    /* Date range */
    dateRow: { flexDirection: 'row', gap: 10 },
    dateField: { flex: 1 },
    label: {
        color: colors.muted,
        fontSize: 12,
        fontWeight: '700',
        marginBottom: 7,
    },
    dateInput: {
        minHeight: 48,
        borderWidth: 1.5,
        borderColor: colors.border,
        borderRadius: 12,
        paddingHorizontal: 11,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: colors.surface,
    },
    dateInputFilled: {
        borderColor: '#BFD8FA',
        backgroundColor: '#F8FBFF',
    },
    dateEmoji: { fontSize: 16 },
    dateInputText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '700' },
    placeholder: { color: colors.muted, fontWeight: '500' },

    presetRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 16,
    },
    preset: {
        paddingVertical: 9,
        paddingHorizontal: 13,
        borderRadius: 20,
    },
    presetIdle: {
        backgroundColor: colors.greenLight,
    },
    presetText: {
        color: colors.greenDark,
        fontSize: 12,
        fontWeight: '800',
    },
    presetTextActive: { color: '#FFFFFF' },

    applyGap: { marginTop: 17 },
    applyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 14,
        padding: 15,
    },
    applyText: {
        color: colors.white,
        fontWeight: '900',
        fontSize: 14,
    },
    exportRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 12,
    },
    exportButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: 14,
        padding: 14,
    },
    exportButtonText: {
        color: colors.white,
        fontWeight: '900',
        fontSize: 13,
    },
    disabledButton: { opacity: 0.6 },

    /* Summary */
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 13,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    summaryRowLast: { borderBottomWidth: 0 },
    summaryLabel: {
        color: colors.muted,
        fontSize: 13,
        flex: 1,
    },
    summaryValue: {
        fontSize: 13,
        fontWeight: '900',
        color: colors.text,
    },

    emptyWrap: { alignItems: 'center', paddingVertical: 14 },
    emptyEmoji: { fontSize: 30, marginBottom: 6 },
    empty: {
        color: colors.muted,
        textAlign: 'center',
        fontSize: 13,
    },

    /* Monthly chart */
    chartItem: { marginBottom: 19 },
    chartHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 9,
    },
    chartMonth: {
        color: colors.text,
        fontSize: 13,
        fontWeight: '800',
    },
    chartAmount: {
        color: colors.blueDark,
        fontSize: 13,
        fontWeight: '900',
    },
    barBackground: {
        height: 14,
        backgroundColor: colors.blueLight,
        borderRadius: 10,
        overflow: 'hidden',
    },
    bar: {
        height: 14,
        borderRadius: 10,
        overflow: 'hidden',
    },
    barFill: { flex: 1, borderRadius: 10 },

    /* Categories */
    categoryRow: {
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    categoryRowLast: { borderBottomWidth: 0 },
    categoryTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
        marginBottom: 8,
    },
    categoryLabel: {
        color: colors.text,
        fontSize: 13,
        fontWeight: '800',
        flex: 1,
    },
    categoryBarBackground: {
        height: 8,
        backgroundColor: colors.greenLight,
        borderRadius: 6,
        overflow: 'hidden',
    },

    /* Records */
    record: {
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    recordLast: { borderBottomWidth: 0 },
    recordTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    recordIcon: {
        width: 40,
        height: 40,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
    },
    recordIconText: { fontSize: 18 },
    recordTitle: {
        color: colors.text,
        fontSize: 14,
        fontWeight: '900',
    },
    recordMeta: {
        color: colors.muted,
        fontSize: 11,
        marginTop: 5,
    },
    statusPill: {
        alignSelf: 'flex-start',
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 3,
        marginTop: 7,
    },
    paidPill: { backgroundColor: colors.greenLight },
    pendingPill: { backgroundColor: colors.orangeLight },
    status: {
        fontSize: 10,
        fontWeight: '800',
    },
    paid: { color: colors.greenDark },
    pending: { color: colors.orange },
    recordAmount: {
        color: colors.text,
        fontWeight: '900',
        fontSize: 13,
    },

    /* Date picker */
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