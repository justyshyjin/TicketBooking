
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
    Alert,
    Pressable,
    Platform,
    SafeAreaView,
    ScrollView,
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
    light: '#E5F4EE',
    text: '#172B27',
    muted: '#6B7B76',
    border: '#E0E8E4',
    orange: '#D97706',
    red: '#DC2626',
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
            <ScrollView contentContainerStyle={styles.container}>
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
                                style={styles.preset}
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
                                    <View
                                        style={[
                                            styles.bar,
                                            {
                                                width: `${Math.max(
                                                    1,
                                                    (Math.abs(item.total) / maxMonthly) * 100,
                                                )}%`,
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
            </ScrollView>
        </SafeAreaView>
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
        paddingBottom: 40,
    },
    back: {
        color: colors.primary,
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 18,
    },
    heading: {
        color: colors.text,
        fontSize: 28,
        fontWeight: '800',
    },
    subtitle: {
        color: colors.muted,
        fontSize: 14,
        marginTop: 5,
        marginBottom: 20,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: 14,
        padding: 16,
        marginBottom: 18,
        borderWidth: 1,
        borderColor: colors.border,
    },
    sectionTitle: {
        color: colors.text,
        fontSize: 17,
        fontWeight: '700',
        marginBottom: 12,
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
        marginBottom: 6,
    },
    input: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 10,
        color: colors.text,
        fontSize: 13,
    },
    presetRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 7,
        marginTop: 14,
    },
    preset: {
        backgroundColor: colors.light,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 7,
    },
    presetText: {
        color: colors.primary,
        fontSize: 12,
        fontWeight: '600',
    },
    applyButton: {
        backgroundColor: colors.primary,
        borderRadius: 9,
        padding: 13,
        alignItems: 'center',
        marginTop: 15,
    },
    applyText: {
        color: '#FFFFFF',
        fontWeight: '700',
    },
    totalCard: {
        backgroundColor: colors.primary,
        padding: 20,
        borderRadius: 15,
        marginBottom: 22,
    },
    totalLabel: {
        color: '#D8EEE6',
        fontSize: 12,
        fontWeight: '700',
    },
    totalValue: {
        color: '#FFFFFF',
        fontSize: 30,
        fontWeight: '800',
        marginTop: 8,
    },
    totalHint: {
        color: '#D8EEE6',
        fontSize: 11,
        marginTop: 8,
    },
    sectionHeading: {
        fontSize: 19,
        fontWeight: '800',
        color: colors.text,
        marginBottom: 12,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 10,
        paddingVertical: 11,
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
        fontWeight: '700',
    },
    empty: {
        color: colors.muted,
        textAlign: 'center',
        paddingVertical: 18,
    },
    chartItem: {
        marginBottom: 17,
    },
    chartHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 7,
    },
    chartMonth: {
        color: colors.text,
        fontSize: 13,
        fontWeight: '600',
    },
    chartAmount: {
        color: colors.primary,
        fontSize: 13,
        fontWeight: '700',
    },
    barBackground: {
        height: 11,
        backgroundColor: colors.light,
        borderRadius: 8,
        overflow: 'hidden',
    },
    bar: {
        height: 11,
        backgroundColor: colors.primary,
        borderRadius: 8,
    },
    record: {
        paddingVertical: 13,
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
        fontWeight: '700',
    },
    recordMeta: {
        color: colors.muted,
        fontSize: 11,
        marginTop: 5,
    },
    status: {
        fontSize: 10,
        fontWeight: '700',
        marginTop: 6,
    },
    paid: {
        color: colors.primary,
    },
    pending: {
        color: colors.orange,
    },
    recordAmount: {
        color: colors.text,
        fontWeight: '700',
        fontSize: 13,
    },
    exportRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 12,
    },
    exportButton: {
        flex: 1,
        backgroundColor: '#B91C1C',
        borderRadius: 9,
        padding: 13,
        alignItems: 'center',
    },
    excelButton: {
        backgroundColor: '#176B55',
    },
    exportButtonText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 13,
    },
    headerButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 18,
    },

    homeButton: {
        padding: 6,
    },

});
