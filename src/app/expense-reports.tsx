
import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';

import { router, useFocusEffect } from 'expo-router';

import {
    Alert,
    Animated,
    Easing,
    Pressable,
    Platform,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
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
    background: '#F5F7FA',
    surface: '#FFFFFF',

    primary: '#176B55',
    primaryDark: '#105440',
    primaryLight: '#E5F4EE',

    text: '#172B27',
    muted: '#6B7B76',

    border: '#E0E8E4',

    orange: '#D97706',
    orangeLight: '#FFF4E5',

    red: '#B42318',
    redLight: '#FDECEC',

    blue: '#245BC7',
    blueLight: '#EAF1FF',

    white: '#FFFFFF',

    shadow: '#102A23',
};

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

export default function ExpenseReportsScreen() {
    const db = useSQLiteContext();

    const [fromDate, setFromDate] = useState(
        dateString(new Date(today.getFullYear(), today.getMonth(), 1)),
    );
    const [toDate, setToDate] = useState(dateString(today));

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

    // Screen entrance animation
    const screenOpacity = useRef(
        new Animated.Value(0)
    ).current;

    const screenTranslate = useRef(
        new Animated.Value(22)
    ).current;

    // Monthly chart animation
    const chartProgress = useRef(
        new Animated.Value(0)
    ).current;

    // Animate screen entrance
    useEffect(() => {
        Animated.parallel([
            Animated.timing(screenOpacity, {
                toValue: 1,
                duration: 550,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),

            Animated.timing(screenTranslate, {
                toValue: 0,
                duration: 550,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
        ]).start();
    }, [screenOpacity, screenTranslate]);

    // Animate chart whenever report data changes
    useEffect(() => {
        chartProgress.setValue(0);

        Animated.timing(chartProgress, {
            toValue: 1,
            duration: 850,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [monthly, chartProgress]);

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

    const maxMonthly = Math.max(
        1,
        ...monthly.map((item) => Math.abs(item.total)),
    );

    return (
        <SafeAreaView style={styles.safe}>
            <StatusBar
                barStyle="dark-content"
                backgroundColor={colors.background}
            />

            <ScrollView
                contentContainerStyle={styles.container}
                showsVerticalScrollIndicator={false}
            >
                <Animated.View
                    style={{
                        opacity: screenOpacity,
                        transform: [{ translateY: screenTranslate }],
                    }}
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

                    <Text style={styles.heading}>Expense Reports</Text>
                    <Text style={styles.subtitle}>
                        Business expense analysis and monthly reports
                    </Text>

                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>Date Range</Text>

                        <View style={styles.dateRow}>
                            <View style={styles.dateField}>
                                <Text style={styles.label}>From date</Text>
                                <TextInput
                                    style={styles.input}
                                    value={fromDate}
                                    onChangeText={setFromDate}
                                    placeholder="YYYY-MM-DD"
                                    autoCapitalize="none"
                                />
                            </View>

                            <View style={styles.dateField}>
                                <Text style={styles.label}>To date</Text>
                                <TextInput
                                    style={styles.input}
                                    value={toDate}
                                    onChangeText={setToDate}
                                    placeholder="YYYY-MM-DD"
                                    autoCapitalize="none"
                                />
                            </View>
                        </View>

                        <View style={styles.presetRow}>
                            {[
                                ['THIS_MONTH', 'This month'],
                                ['LAST_MONTH', 'Last month'],
                                ['THREE_MONTHS', '3 months'],
                                ['THIS_YEAR', 'This year'],
                            ].map(([key, label]) => (
                                <Pressable
                                    key={key}
                                    style={({ pressed }) => [
                                        styles.preset,
                                        pressed && styles.buttonPressed,
                                    ]}
                                    onPress={() => applyPreset(key)}
                                >
                                    <Text style={styles.presetText}>{label}</Text>
                                </Pressable>
                            ))}
                        </View>

                        <Pressable style={styles.applyButton} onPress={loadReport}>
                            <Text style={styles.applyText}>
                                {loading ? 'Loading...' : 'Apply Date Filter'}
                            </Text>
                        </Pressable>
                        <View style={styles.exportRow}>
                            <Pressable
                                style={[styles.exportButton, exporting && { opacity: 0.5 }]}
                                onPress={exportPDF}
                                disabled={exporting || loading}
                            >
                                <Text style={styles.exportButtonText}>
                                    {exporting ? 'Exporting...' : 'Export PDF'}
                                </Text>
                            </Pressable>

                            <Pressable
                                style={[
                                    styles.exportButton,
                                    styles.excelButton,
                                    exporting && { opacity: 0.5 },
                                ]}
                                onPress={exportExcel}
                                disabled={exporting || loading}
                            >
                                <Text style={styles.exportButtonText}>
                                    {exporting ? 'Exporting...' : 'Export Excel'}
                                </Text>
                            </Pressable>
                        </View>
                    </View>

                    <View style={styles.totalCard}>
                        <Text style={styles.totalLabel}>TOTAL EXPENSES</Text>
                        <Text style={styles.totalValue}>{money(totalExpenses)}</Text>
                        <Text style={styles.totalHint}>
                            Supplier payments − refunds + paid operating expenses
                        </Text>
                    </View>

                    <Text style={styles.sectionHeading}>Expense Summary</Text>

                    <View style={styles.card}>
                        <SummaryRow label="Supplier payments" value={money(supplierPayments)} />
                        <SummaryRow
                            label="Supplier refunds"
                            value={`−${money(supplierRefunds)}`}
                            color={colors.red}
                        />
                        <SummaryRow label="Paid operating expenses" value={money(paidOperating)} />
                        <SummaryRow
                            label="Pending operating expenses"
                            value={money(pendingOperating)}
                            color={colors.orange}
                        />
                    </View>

                    <Text style={styles.sectionHeading}>Monthly Expense Chart</Text>

                    <View style={styles.card}>
                        {monthly.length === 0 ? (
                            <Text style={styles.empty}>No monthly expenses in this period.</Text>
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
                                        />
                                    </View>
                                </View>
                            ))
                        )}
                    </View>

                    <Text style={styles.sectionHeading}>Category Breakdown</Text>

                    <View style={styles.card}>
                        {categories.length === 0 ? (
                            <Text style={styles.empty}>No paid operating expenses found.</Text>
                        ) : (
                            categories.map((item) => (
                                <SummaryRow
                                    key={item.category}
                                    label={item.category.replace(/_/g, ' ')}
                                    value={money(item.total)}
                                />
                            ))
                        )}
                    </View>

                    <Text style={styles.sectionHeading}>Date-wise Expense Records</Text>

                    <View style={styles.card}>
                        {records.length === 0 ? (
                            <Text style={styles.empty}>No expenses found for this date range.</Text>
                        ) : (
                            records.map((item, index) => (
                                <View
                                    key={`${item.expense_type}-${item.id}-${index}`}
                                    style={styles.record}
                                >
                                    <View style={styles.recordTop}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.recordTitle}>{item.description}</Text>
                                            <Text style={styles.recordMeta}>
                                                {item.expense_date} · {item.category}
                                            </Text>
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
                            ))
                        )}
                    </View>

                </Animated.View>
            </ScrollView>
        </SafeAreaView >
    );
}

function SummaryRow({
    label,
    value,
    color = colors.text,
}: {
    label: string;
    value: string;
    color?: string;
}) {
    return (
        <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{label}</Text>
            <Text style={[styles.summaryValue, { color }]}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: colors.background,
    },
    container: {
        padding: 18,
        paddingBottom: 45,
    },
    back: {
        color: colors.primary,
        fontSize: 15,
        fontWeight: '700',
    },
    heading: {
        color: colors.text,
        fontSize: 27,
        fontWeight: '800',
        letterSpacing: -0.7,
    },
    subtitle: {
        color: colors.muted,
        fontSize: 13,
        marginTop: 6,
        marginBottom: 22,
        lineHeight: 20,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: 18,
        padding: 17,
        marginBottom: 19,
        borderWidth: 1,
        borderColor: colors.border,

        elevation: 2,

        shadowColor: colors.shadow,
        shadowOffset: {
            width: 0,
            height: 3,
        },
        shadowOpacity: 0.045,
        shadowRadius: 8,
    },
    sectionTitle: {
        color: colors.text,
        fontSize: 17,
        fontWeight: '800',
        marginBottom: 15,
    },
    sectionHeading: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.text,
        marginBottom: 13,
        letterSpacing: -0.3,
    },

    dateRow: {
        flexDirection: 'row',
        gap: 10,
    },

    dateField: {
        flex: 1,
    },

    label: {
        color: colors.muted,
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 7,
    },
    input: {
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 11,
        paddingHorizontal: 12,
        paddingVertical: 12,
        color: colors.text,
        fontSize: 13,
    },

    presetRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 16,
    },

    preset: {
        backgroundColor: colors.primaryLight,
        paddingVertical: 9,
        paddingHorizontal: 12,
        borderRadius: 10,
    },

    presetText: {
        color: colors.primary,
        fontSize: 12,
        fontWeight: '700',
    }, applyButton: {
        backgroundColor: colors.primary,
        borderRadius: 12,
        padding: 15,
        alignItems: 'center',
        marginTop: 17,
        elevation: 2,
    },
    applyText: {
        color: colors.white,
        fontWeight: '800',
        fontSize: 14,
    },
    totalCard: {
        backgroundColor: colors.primary,
        padding: 22,
        borderRadius: 20,
        marginBottom: 24,
        elevation: 4,
        shadowColor: colors.primary,
        shadowOffset: {
            width: 0,
            height: 5,
        },
        shadowOpacity: 0.17,
        shadowRadius: 10,
    },

    totalLabel: {
        color: '#D8EEE6',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 1,
    },

    totalValue: {
        color: colors.white,
        fontSize: 31,
        fontWeight: '900',
        marginTop: 10,
    },

    totalHint: {
        color: '#D8EEE6',
        fontSize: 11,
        marginTop: 9,
        lineHeight: 17,
    },

    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 13,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    summaryLabel: {
        color: colors.muted,
        fontSize: 13,
        flex: 1,
    },

    summaryValue: {
        fontSize: 13,
        fontWeight: '800',
    },

    empty: {
        color: colors.muted,
        textAlign: 'center',
        paddingVertical: 22,
        fontSize: 13,
    },

    chartItem: {
        marginBottom: 19,
    },

    chartHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 9,
    },

    chartMonth: {
        color: colors.text,
        fontSize: 13,
        fontWeight: '700',
    },

    chartAmount: {
        color: colors.primary,
        fontSize: 13,
        fontWeight: '800',
    },
    barBackground: {
        height: 12,
        backgroundColor: colors.primaryLight,
        borderRadius: 10,
        overflow: 'hidden',
    },

    bar: {
        height: 12,
        backgroundColor: colors.primary,
        borderRadius: 10,
    },

    record: {
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },

    recordTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },

    recordTitle: {
        color: colors.text,
        fontSize: 14,
        fontWeight: '800',
    },

    recordMeta: {
        color: colors.muted,
        fontSize: 11,
        marginTop: 6,
    },

    status: {
        fontSize: 10,
        fontWeight: '800',
        marginTop: 7,
    },

    paid: {
        color: colors.primary,
    },

    pending: {
        color: colors.orange,
    },

    recordAmount: {
        color: colors.text,
        fontWeight: '800',
        fontSize: 13,
    },
    exportRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 14,
    },

    exportButton: {
        flex: 1,
        backgroundColor: '#B42318',
        borderRadius: 12,
        padding: 14,
        alignItems: 'center',
    },

    excelButton: {
        backgroundColor: colors.primary,
    },

    exportButtonText: {
        color: colors.white,
        fontWeight: '800',
        fontSize: 13,
    },

    buttonPressed: {
        opacity: 0.75,
        transform: [{ scale: 0.97 }],
    },
    homeButton: {
        width: 42,
        height: 42,
        borderRadius: 13,
        backgroundColor: colors.primaryLight,
        alignItems: 'center',
        justifyContent: 'center',
    },

    headerButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        marginBottom: 18,
    },
});
